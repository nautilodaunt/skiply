(() => {
  let settings = { enabled: false }, scheduled, running = false, pending = false;
  let lastKey = '', generation = 0;
  const autoJoin = SkiplySession.createAutoJoin();
  const scanner = SkiplySession.createCourseScanner();
  let autoJoinStatus = '';
  function snapshot() {
    return SkiplyPoll.read(document, location.hash, sessionStorage, localStorage);
  }
  function checkSession() {
    if (!settings.enabled) return;
    const joined = autoJoin(document, location.hash, settings);
    if (joined) scanner.joined();
    autoJoinStatus = joined ? 'Joining session…' : scanner.check(document, location.hash, settings, hash => { location.hash = hash; });
  }
  function heartbeat() {
    // Session recovery must not wait behind a slow reporting request.
    checkSession();
    tick();
  }
  async function tick() {
    if (running) { pending = true; return; }
    if (!settings.enabled) return;
    running = true;
    try {
      checkSession();
      const s = snapshot();
      if (s.key !== lastKey) { lastKey = s.key; generation++; }
      const pollGeneration = generation;
      const response = await chrome.runtime.sendMessage({ type: 'SNAPSHOT', snapshot: {
        active: s.active, session: s.session, key: s.key, courseId: s.courseId, activityId: s.activityId,
        questionId: s.questionId, questionNumber: s.questionNumber, question: s.question, title: s.title,
        options: [...s.choices.keys()], token: s.token, autoJoinStatus
      }});
      if (!settings.enabled || settings.autoSelect === false || !response?.leader || generation !== pollGeneration) return;
      const fresh = snapshot();
      if (!fresh.active || fresh.key !== s.key) return;
      const button = fresh.choices.get(response.leader.answer);
      if (button && !button.disabled && button.getAttribute('aria-pressed') !== 'true' && !button.classList.contains('selected')) {
        button.click();
        await chrome.runtime.sendMessage({ type: 'SELECTED', key: s.key, answer: response.leader.answer });
      }
    } catch (error) { console.debug('Skiply:', error.message); }
    finally { running = false; if (pending) { pending = false; schedule(); } }
  }
  function schedule() { if (!scheduled) scheduled = setTimeout(() => { scheduled = null; tick(); }, 200); }
  chrome.runtime.onMessage.addListener(message => { if (message.type === 'CHECK') { heartbeat(); } });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) { settings = changes.settings.newValue; generation++; schedule(); }
  });
  chrome.storage.local.get('settings').then(result => { settings = result.settings || { enabled: true }; tick(); });
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'disabled', 'aria-disabled'] });
  addEventListener('hashchange', () => {
    // Record class entry/exit even while a prior background request is pending.
    autoJoin.observeRoute(location.hash);
    scanner.observeRoute(location.hash);
    generation++;
    schedule();
  });
  // Fast path while the page is running; the worker alarm also checks background tabs.
  setInterval(heartbeat, 5000);
})();
