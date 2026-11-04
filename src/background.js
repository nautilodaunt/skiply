import { defaults, crowdLeader, currentQuestion } from './core.js';
import { installSignInPersistence } from './sign-in.js';

let serial = Promise.resolve();
const signIn = installSignInPersistence(chrome);
async function initialize() {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...defaults, ...settings } });
  if (!await chrome.alarms.get('monitor')) await chrome.alarms.create('monitor', { periodInMinutes: 0.5 });
  await signIn.scan();
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
initialize();

async function notify(title, message, enabled) {
  if (!enabled) return;
  await chrome.notifications.create({ type: 'basic', iconUrl: 'assets/icon.png', title: `Skiply · ${title}`, message }).catch(() => {});
}
async function checkTabs() {
  const { settings = defaults } = await chrome.storage.local.get('settings');
  if (!settings.enabled) return;
  const tabs = await chrome.tabs.query({ url: 'https://student.iclicker.com/*' });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'CHECK' })));
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'monitor') checkTabs(); });
chrome.commands.onCommand.addListener(async command => {
  if (command !== 'toggle-monitoring') return;
  const { settings = defaults } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: { ...settings, enabled: !settings.enabled } });
});

async function handle(message, sender) {
  if (!sender.tab || new URL(sender.url).origin !== 'https://student.iclicker.com') return;
  const tabId = String(sender.tab.id);
  const { settings = defaults, sessions = {}, history = [] } = await chrome.storage.local.get(['settings', 'sessions', 'history']);
  if (!settings.enabled) return {};
  const previous = sessions[tabId];
  if (message.type === 'SELECTED') {
    if (previous?.key === message.key) {
      previous.selected = message.answer;
      const row = history.find(r => r.id === `${tabId}:${message.key}`);
      if (row) row.selected = message.answer;
      await chrome.storage.local.set({ sessions, history });
    }
    return {};
  }
  if (message.type !== 'SNAPSHOT') return {};
  const { token: suppliedToken, ...s } = message.snapshot; // Credentials are never persisted or sent to third parties.
  let token = suppliedToken;
  const state = { ...s, tabId: sender.tab.id, checkedAt: Date.now(), selected: previous?.key === s.key ? previous.selected : null, leader: null, error: '' };
  let matchedQuestion = false;
  if (previous?.active && previous.key !== s.key && !previous.selected) await notify('Poll missed', 'The previous poll closed without a Skiply selection. Manual answers are not tracked.', settings.notifications);
  if (s.session && !previous?.session) await notify('Session detected', s.title, settings.notifications);
  if (!s.session && previous?.session) await notify('Session ended', s.title, settings.notifications);
  if (s.active && s.key !== previous?.key) await notify('New poll', s.question || 'A new poll is open in iClicker.', settings.notifications);
  if (s.active) {
    if (!token) {
      try { token = (await chrome.cookies.get({ url: 'https://student.iclicker.com/', name: 'access_token' }))?.value; } catch {}
    }
    if (!token) state.error = 'Poll detected, but sign-in is unavailable. Sign in to iClicker again.';
    else if (!s.courseId || !s.activityId) state.error = 'Poll detected, but session details are unavailable. Refresh iClicker.';
    else {
      try {
        const url = `https://activity-service.iclicker.com/reporting/courses/${encodeURIComponent(s.courseId)}/activities/${encodeURIComponent(s.activityId)}/questions/view`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), cache: 'no-store', redirect: 'error' });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Reporting access unavailable. Sign in again or check course permissions.' : `Reporting returned HTTP ${res.status}.`);
        const question = currentQuestion(await res.json(), s.questionId, s.questionNumber);
        if (!question) throw new Error('No matching question in the report.');
        matchedQuestion = !!s.questionId || (Number.isInteger(s.questionNumber) && s.questionNumber > 0);
        state.leader = crowdLeader(question.answerOverview, s.options);
        if (!matchedQuestion) state.error = 'Cannot match this poll to the vote report yet.';
        if (!state.leader) state.error = 'Waiting for votes or a tie to break.';
      } catch (error) { state.error = error.message; }
    }
    const id = `${tabId}:${s.key}`;
    const row = history.find(row => row.id === id);
    const record = { id, time: row?.time || new Date().toISOString(), question: s.question || 'Poll question', leader: state.leader?.answer || '', share: state.leader?.share ?? '', selected: state.selected || '' };
    if (row) Object.assign(row, record); else history.unshift(record);
  }
  sessions[tabId] = state;
  await chrome.storage.local.set({ sessions, history: history.slice(0, 500) });
  await chrome.action.setBadgeText({ tabId: sender.tab.id, text: s.active ? state.leader?.answer || '•' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#6ee7b7', tabId: sender.tab.id });
  const leader = settings.autoSelect !== false && matchedQuestion && state.leader?.share >= settings.minimumShare && state.selected !== state.leader.answer ? state.leader : null;
  return { leader };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!sender.tab) return;
  // Serialize read/modify/write operations across tabs without keeping secrets in storage.
  serial = serial.then(() => handle(message, sender)).then(reply, error => reply({ error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial = serial.then(async () => {
    const { sessions = {} } = await chrome.storage.local.get('sessions');
    delete sessions[String(tabId)];
    await chrome.storage.local.set({ sessions });
  });
});
