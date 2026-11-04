const STUDENT = 'https://student.iclicker.com/';
const WEEK = 7 * 24 * 60 * 60;

export function persistentCookie(cookie, now = Date.now() / 1000) {
  // Existing persistent cookies keep their original expiry. Never resurrect removals.
  if (!cookie.session || !['student.iclicker.com', 'iclicker.com'].includes(cookie.domain.replace(/^\./, ''))) return null;
  const details = {
    url: `${cookie.secure ? 'https' : 'http'}://student.iclicker.com${cookie.path}`,
    name: cookie.name, value: cookie.value, path: cookie.path,
    secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite,
    storeId: cookie.storeId, expirationDate: now + WEEK
  };
  if (!cookie.hostOnly) details.domain = cookie.domain;
  if (cookie.partitionKey) details.partitionKey = cookie.partitionKey;
  return details;
}

export function installSignInPersistence(api) {
  let queue = Promise.resolve();
  async function preserve(cookie) {
    const details = persistentCookie(cookie);
    if (!details) return;
    const { settings = {} } = await api.storage.local.get('settings');
    if (settings.rememberSignIn === false) return;
    // Recheck the cookie to avoid putting back a removed or rotated login cookie.
    const query = { url: details.url, name: cookie.name, storeId: cookie.storeId };
    if (cookie.partitionKey) query.partitionKey = cookie.partitionKey;
    const live = await api.cookies.get(query);
    if (!live?.session || live.value !== cookie.value || live.path !== cookie.path || live.domain !== cookie.domain) return;
    const saved = await api.cookies.set(details);
    if (!saved) throw new Error('Cookie persistence unavailable');
    await api.storage.local.set({ signInStatus: { state: 'saved', updatedAt: Date.now() } });
  }
  function run(work) {
    queue = queue.then(work).catch(async () => {
      // Do not include browser errors: they may contain cookie details.
      await api.storage.local.set({ signInStatus: { state: 'unavailable', updatedAt: Date.now() } });
    });
    return queue;
  }
  function scan() {
    return run(async () => {
      const cookies = await api.cookies.getAll({ url: STUDENT });
      for (const cookie of cookies) await preserve(cookie);
    });
  }
  api.cookies.onChanged.addListener(change => {
    if (!change.removed) return run(() => preserve(change.cookie));
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings?.newValue?.rememberSignIn && !changes.settings.oldValue?.rememberSignIn) scan();
  });
  return { scan };
}
