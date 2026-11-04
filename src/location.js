import { coordinates, locationDefaults, pointToCoordinates, parseLocation } from './location-core.js';
const $ = id => document.getElementById(id);
let state;
const message = text => { $('status').textContent = text; };
function formValues() { return coordinates($('latitude').value, $('longitude').value, $('accuracy').value); }
function drawPoint() {
  try {
    const point = formValues();
    $('pin').style.left = `${(point.longitude + 180) / 360 * 100}%`;
    $('pin').style.top = `${(90 - point.latitude) / 180 * 100}%`;
    $('map').setAttribute('aria-label', `Coordinate grid. Latitude ${point.latitude}, longitude ${point.longitude}. Arrow keys move one degree.`);
  } catch {}
}
function fill(point) { for (const key of ['latitude','longitude','accuracy']) $(key).value = point[key]; drawPoint(); }
async function persist() { await chrome.storage.local.set({ location: state }); }
async function apply(profileId = null) {
  Object.assign(state, formValues(), { selectedProfileId: profileId }); await persist();
  message(state.enabled ? `Simulation active: ${state.latitude}, ${state.longitude} (±${state.accuracy} m).` : 'Coordinates saved. Simulation is off.');
}
function renderProfiles() {
  $('profiles').replaceChildren();
  if (!state.profiles.length) { const empty = document.createElement('p'); empty.className = 'note'; empty.textContent = 'Save your first location above.'; $('profiles').append(empty); }
  for (const profile of [...state.profiles].sort((a,b) => Number(!!b.starred)-Number(!!a.starred))) {
    const row = document.createElement('div'); row.className = 'profile-row';
    const name = document.createElement('span'); name.textContent = profile.name;
    const detail = document.createElement('small'); detail.textContent = `${profile.latitude}, ${profile.longitude} · ±${profile.accuracy} m`; name.append(detail);
    const star = document.createElement('button'); star.textContent = profile.starred ? '★' : '☆'; star.setAttribute('aria-label', `${profile.starred ? 'Unstar' : 'Star'} ${profile.name}`); star.setAttribute('aria-pressed', String(!!profile.starred));
    star.addEventListener('click', async () => { profile.starred = !profile.starred; await persist(); renderProfiles(); });
    const use = document.createElement('button'); use.textContent = state.selectedProfileId === profile.id ? 'Selected' : 'Use'; use.addEventListener('click', async () => { fill(profile); await apply(profile.id); renderProfiles(); });
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${profile.name}`);
    remove.addEventListener('click', async () => { state.profiles = state.profiles.filter(p => p.id !== profile.id); if (state.selectedProfileId === profile.id) state.selectedProfileId = null; await persist(); renderProfiles(); });
    row.append(star, name, use, remove); $('profiles').append(row);
  }
}
$('coordinates').addEventListener('submit', async event => { event.preventDefault(); try { await apply(); } catch (error) { message(error.message); } });
$('simulation').addEventListener('change', async () => {
  try { const point = $('simulation').checked ? formValues() : {}; Object.assign(state, point, { enabled: $('simulation').checked }); await persist(); message(state.enabled ? 'Simulation active on iClicker and local tabs.' : 'Simulation off. Native location restored for new calls.'); }
  catch (error) { $('simulation').checked = state.enabled; message(error.message); }
});
$('save-profile').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const name = $('profile-name').value.trim();
    if (!name) throw new Error('Enter a profile name.');
    if (state.profiles.length >= 100) throw new Error('Delete a profile before adding more (100 maximum).');
    state.profiles.push({ id: crypto.randomUUID(), name, starred: true, ...formValues() });
    await persist(); $('profile-name').value = ''; renderProfiles(); message(`Saved “${name}”.`);
  } catch (error) { message(error.message); }
});
$('import-location').addEventListener('submit', async event => {
  event.preventDefault();
  try { const point = parseLocation($('maps-input').value, $('accuracy').value || 10); fill(point); await apply(); renderProfiles(); }
  catch (error) { message(error.message); }
});
$('search-maps').addEventListener('click', () => {
  const query = $('maps-input').value.trim() || `${$('latitude').value},${$('longitude').value}`;
  chrome.tabs.create({ url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` });
});
for (const key of ['latitude','longitude','accuracy']) $(key).addEventListener('input', drawPoint);
$('map').addEventListener('pointerdown', event => {
  const rect = $('map').getBoundingClientRect();
  const point = pointToCoordinates((event.clientX-rect.left)/rect.width, (event.clientY-rect.top)/rect.height);
  $('latitude').value = point.latitude; $('longitude').value = point.longitude; drawPoint();
});
$('map').addEventListener('keydown', event => {
  const shifts = { ArrowLeft: [0,-1], ArrowRight: [0,1], ArrowUp: [1,0], ArrowDown: [-1,0] };
  if (!shifts[event.key]) return; event.preventDefault();
  const [lat, lon] = shifts[event.key];
  $('latitude').value = Math.max(-90,Math.min(90,Number($('latitude').value)+lat));
  $('longitude').value = Math.max(-180,Math.min(180,Number($('longitude').value)+lon)); drawPoint();
});
async function refreshTabs() {
  const tabs = await chrome.tabs.query({ url: ['https://student.iclicker.com/*','http://localhost/*','http://127.0.0.1/*'] });
  $('test-tab').replaceChildren();
  for (const tab of tabs) { const option = document.createElement('option'); option.value = tab.id; option.textContent = tab.title || tab.url; $('test-tab').append(option); }
  $('test').disabled = !tabs.length;
  if (!tabs.length) $('result').textContent = 'Open iClicker or a local test website, then refresh this list.';
}
$('refresh-tabs').addEventListener('click', refreshTabs);
$('test').addEventListener('click', async () => {
  $('test').disabled = true; $('result').textContent = 'Checking…';
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: Number($('test-tab').value) }, world: 'MAIN', func: async () => {
      const permission = await navigator.permissions.query({ name: 'geolocation' }).then(p => p.state).catch(() => 'unknown');
      return new Promise(resolve => {
        const timer = setTimeout(() => resolve({ permission, error: 'Location request timed out.' }), 10000);
        navigator.geolocation.getCurrentPosition(position => { clearTimeout(timer); resolve({ permission, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }); }, error => { clearTimeout(timer); resolve({ permission, error: error.message }); }, { timeout: 8000, maximumAge: 0 });
      });
    } });
    $('result').textContent = JSON.stringify(result, null, 2);
  } catch (error) { $('result').textContent = error.message; }
  finally { $('test').disabled = false; }
});
const saved = await chrome.storage.local.get('location');
state = { ...locationDefaults, ...saved.location }; fill(state); $('simulation').checked = state.enabled;
renderProfiles(); message(state.enabled ? 'Simulation active on iClicker and local tabs.' : 'Simulation is off.'); refreshTabs();
