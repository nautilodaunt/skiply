import { defaults, csv } from './core.js';
const $ = id => document.getElementById(id);
let history = [], settings = defaults;
const toggleKeys = ['enabled', 'autoJoin', 'autoSelect', 'notifications', 'rememberSignIn'];
const relative = time => new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function renderHistory() {
  const query = $('search').value.toLowerCase();
  const rows = history.filter(row => row.question.toLowerCase().includes(query));
  $('history').replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = query ? 'No matching questions.' : 'Your next session starts a story.\nQuestions will appear here as polls open.';
    $('history').append(empty);
  }
  for (const row of rows.slice(0, 50)) {
    const entry = document.createElement('article'); entry.className = 'entry';
    const question = document.createElement('p'); question.textContent = row.question;
    const detail = document.createElement('small');
    detail.textContent = `${relative(row.time)} · ${row.leader ? `Crowd ${row.leader} (${row.share}%)` : 'Waiting for votes'}${row.selected ? ` · Selected ${row.selected}` : ''}`;
    entry.append(question, detail); $('history').append(entry);
  }
}
async function render() {
  const [data, tabs] = await Promise.all([
    chrome.storage.local.get(['settings', 'sessions', 'history', 'signInStatus', 'location']),
    chrome.tabs.query({ active: true, currentWindow: true, url: 'https://student.iclicker.com/*' })
  ]);
  const currentTab = tabs[0]?.id;
  const onIClicker = currentTab !== undefined;
  $('controls').hidden = !onIClicker;
  $('open').textContent = onIClicker ? 'Open iClicker ↗' : 'Go to iClicker ↗';
  settings = { ...defaults, ...data.settings }; history = data.history || [];
  for (const key of toggleKeys) $(key).checked = settings[key];
  $('sign-in-note').textContent = !settings.rememberSignIn ? 'Future login cookies keep their original browser lifetime.' : data.signInStatus?.state === 'unavailable' ? 'Could not retain login cookies. Check Skiply’s cookie permission in Chrome.' : 'Keeps browser-session cookies for up to 7 days. Expired school/iClicker sessions still require sign-in.';
  $('minimumShare').value = String(settings.minimumShare);
  const sessions = Object.values(data.sessions || {}).sort((a,b) => b.checkedAt - a.checkedAt);
  const state = onIClicker ? sessions.find(s => s.tabId === currentTab) : null;
  const fresh = state && Date.now() - state.checkedAt < 90000;
  $('leader').textContent = fresh && settings.enabled && state.leader ? `Crowd: ${state.leader.answer}` : '';
  const connected = settings.enabled && fresh;
  $('dot').classList.toggle('live', connected && state.session);
  $('status').textContent = !onIClicker ? 'Go to iClicker to use Skiply.' : !settings.enabled ? 'Monitoring paused' : connected ? state.active ? 'Poll in progress' : state.autoJoinStatus || (state.session ? 'Session connected' : 'Waiting for a poll') : 'Waiting for a session';
  $('notice').textContent = connected && state.error ? state.error : '';
  renderLocations(data.location);
  renderHistory();
}
for (const key of [...toggleKeys, 'minimumShare']) {
  $(key).addEventListener('change', async () => {
    const { settings: saved = defaults } = await chrome.storage.local.get('settings');
    await chrome.storage.local.set({ settings: { ...saved, [key]: key === 'minimumShare' ? Number($(key).value) : $(key).checked } });
  });
}
$('search').addEventListener('input', renderHistory);
$('open').addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ url: 'https://student.iclicker.com/*' });
  if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true }); await chrome.windows.update(tabs[0].windowId, { focused: true }); }
  else await chrome.tabs.create({ url: 'https://student.iclicker.com/' });
});
function download(format) {
  const blob = new Blob([format === 'csv' ? csv(history) : JSON.stringify(history, null, 2)], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `skiply-questions-${new Date().toISOString().slice(0,10)}.${format}`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('csv').addEventListener('click', () => download('csv'));
$('json').addEventListener('click', () => download('json'));
chrome.storage.onChanged.addListener((_, area) => { if (area === 'local') render(); });
render();
setInterval(render, 10000);


function renderLocations(location) {
  const select = $('starred-location'); select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '★ Starred locations'; select.append(placeholder);
  for (const profile of (location?.profiles || []).filter(p => p.starred)) {
    const option = document.createElement('option'); option.value = profile.id; option.textContent = `★ ${profile.name}`; select.append(option);
  }
  select.value = location?.selectedProfileId || '';
  $('location-status').textContent = location?.enabled ? 'Simulation on · iClicker + local sites' : 'Simulation off · iClicker + local sites';
}
$('starred-location').addEventListener('change', async () => {
  const id = $('starred-location').value;
  const { location } = await chrome.storage.local.get('location');
  const profile = location?.profiles.find(p => p.id === id && p.starred);
  if (!profile) return;
  await chrome.storage.local.set({ location: { ...location, selectedProfileId: id, latitude: profile.latitude, longitude: profile.longitude, accuracy: profile.accuracy } });
});
