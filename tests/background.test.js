import test from 'node:test';
import assert from 'node:assert/strict';

test('worker handles live polls, reloads, ties, auth failure, and opt-out', async () => {
  const data = { settings: { enabled: true, notifications: true, minimumShare: 50 } };
  const listeners = {}, notices = [];
  const event = name => ({ addListener(fn) { listeners[name] = fn; } });
  globalThis.chrome = {
    cookies: { onChanged: event('cookies'), async getAll() { return []; } },
    storage: { onChanged: event('storage'), local: {
      async get(keys) { return structuredClone(Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]]))); },
      async set(values) { Object.assign(data, structuredClone(values)); }
    } },
    runtime: { onInstalled: event('install'), onStartup: event('startup'), onMessage: event('message') },
    alarms: { async get() { return {}; }, onAlarm: event('alarm') },
    notifications: { async create(value) { notices.push(value); } },
    commands: { onCommand: event('command') },
    tabs: { onRemoved: event('removed'), async query() { return []; } },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} }
  };
  let votes = [{ answer: 'A', percentageOfTotalResponses: 20 }, { answer: 'B', percentageOfTotalResponses: 80 }];
  let status = 200;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://activity-service.iclicker.com/reporting/'));
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    return { ok: status === 200, status, async json() { return { data: { questions: [{ questionId: 'q1', answerOverview: votes }] } }; } };
  };
  await import('../src/background.js');
  await listeners.install();
  const sender = { tab: { id: 1 }, url: 'https://student.iclicker.com/' };
  const snapshot = { active: true, session: true, key: 'c:s:q1', courseId: 'c', activityId: 's', questionId: 'q1', question: 'Question one', title: 'Test class', options: ['A', 'B'], token: 'test-secret' };
  const send = message => new Promise(resolve => listeners.message(message, sender, resolve));
  const poll = () => send({ type: 'SNAPSHOT', snapshot });
  assert.equal((await poll()).leader.answer, 'B');
  assert.equal(data.history.length, 1);
  assert.equal(JSON.stringify(data).includes('test-secret'), false);
  const count = notices.length;
  await poll();
  assert.equal(notices.length, count, 'refresh does not repeat new poll notifications');
  assert.equal(data.history.length, 1, 'refresh does not duplicate history');
  await send({ type: 'SELECTED', key: snapshot.key, answer: 'B' });
  assert.equal((await poll()).leader, null, 'same selection is not clicked repeatedly');
  assert.equal(data.history[0].selected, 'B');
  votes = [{ answer: 'A', percentageOfTotalResponses: 50 }, { answer: 'B', percentageOfTotalResponses: 50 }];
  assert.equal((await poll()).leader, null);
  status = 403;
  assert.equal((await poll()).leader, null);
  assert.match(data.sessions['1'].error, /access unavailable/);
  status = 200; votes = [{ answer: 'A', percentageOfTotalResponses: 100 }];
  snapshot.questionId = 'q2';
  assert.equal((await poll()).leader, null, 'stale results must not be selected');
  snapshot.questionId = null;
  assert.equal((await poll()).leader, null, 'unknown live question ID requires manual review');
  snapshot.questionNumber = 1;
  assert.equal((await poll()).leader.answer, 'A', 'matching visible poll number permits crowd selection');
  snapshot.questionNumber = 2;
  assert.equal((await poll()).leader, null, 'a report from the previous poll must not be clicked');
  snapshot.questionNumber = null;
  snapshot.questionId = 'q1';
  assert.equal((await poll()).leader.answer, 'A', 'crowd selection is the only answer mode');
  data.settings.autoSelect = false;
  assert.equal((await poll()).leader, null, 'crowd toggle prevents selection');
  data.settings.enabled = false;
  assert.deepEqual(await poll(), {});
});
