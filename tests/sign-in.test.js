import test from 'node:test';
import assert from 'node:assert/strict';
import { persistentCookie, installSignInPersistence } from '../src/sign-in.js';

const sessionCookie = () => ({ name: '__Host-auth', value: 'private-test-value', domain: 'student.iclicker.com', path: '/', secure: true, httpOnly: true, hostOnly: true, sameSite: 'lax', storeId: '0', session: true });
test('preserves cookie protections and caps persistence to seven days', () => {
  const result = persistentCookie(sessionCookie(), 100);
  assert.equal(result.expirationDate, 100 + 604800);
  assert.equal(result.secure, true);
  assert.equal(result.httpOnly, true);
  assert.equal(result.sameSite, 'lax');
  assert.equal('domain' in result, false, 'host-only cookies must stay host-only');
  const parent = persistentCookie({ ...sessionCookie(), name: 'auth', domain: '.iclicker.com', hostOnly: false, partitionKey: { topLevelSite: 'https://iclicker.com' } });
  assert.equal(parent.domain, '.iclicker.com');
  assert.equal(parent.partitionKey.topLevelSite, 'https://iclicker.com');
  assert.equal(persistentCookie({ ...sessionCookie(), session: false, expirationDate: 200 }), null);
  assert.equal(persistentCookie({ ...sessionCookie(), domain: 'school.edu' }), null);
  assert.equal(persistentCookie({ ...sessionCookie(), domain: 'fakeiclicker.com' }), null);
});

function harness() {
  const data = { settings: { rememberSignIn: true } }, listeners = {}, writes = [];
  let current = sessionCookie();
  const api = {
    cookies: {
      onChanged: { addListener(fn) { listeners.cookie = fn; } },
      async getAll() { return current ? [current] : []; },
      async get() { return current; },
      async set(details) { writes.push(details); current = { ...current, ...details, session: false }; return current; }
    },
    storage: {
      onChanged: { addListener(fn) { listeners.storage = fn; } },
      local: { async get() { return data; }, async set(values) { Object.assign(data, values); } }
    }
  };
  return { api, data, writes, listeners, remove() { current = null; }, rotate() { current = { ...current, value:'new-test-value' }; } };
}
test('saves an existing sign-in once with no separate credential backup', async () => {
  const h = harness(), persistence = installSignInPersistence(h.api);
  await persistence.scan(); await persistence.scan();
  assert.equal(h.writes.length,1);
  assert.equal(h.data.signInStatus.state,'saved');
  assert.equal(JSON.stringify(h.data).includes('private-test-value'),false);
});
test('new logins are retained but logout, expiry, rotations and opt-out are respected', async () => {
  const h = harness(); installSignInPersistence(h.api);
  await h.listeners.cookie({removed:false,cookie:sessionCookie()});
  assert.equal(h.writes.length,1);
  for (const cause of ['explicit','expired','overwrite']) await h.listeners.cookie({removed:true,cause,cookie:sessionCookie()});
  assert.equal(h.writes.length,1);
  const removed = harness(); installSignInPersistence(removed.api); removed.remove();
  await removed.listeners.cookie({removed:false,cookie:sessionCookie()});
  assert.equal(removed.writes.length,0);
  const rotated = harness(); installSignInPersistence(rotated.api); rotated.rotate();
  await rotated.listeners.cookie({removed:false,cookie:sessionCookie()});
  assert.equal(rotated.writes.length,0);
  const off = harness(); off.data.settings.rememberSignIn = false;
  await installSignInPersistence(off.api).scan();
  assert.equal(off.writes.length,0);
});
test('cookie errors produce a status without exposing sensitive error text', async () => {
  const h = harness(); h.api.cookies.set = async () => { throw new Error('private-test-value'); };
  await installSignInPersistence(h.api).scan();
  assert.equal(h.data.signInStatus.state,'unavailable');
  assert.equal(JSON.stringify(h.data).includes('private-test-value'),false);
});
