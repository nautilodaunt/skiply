(() => {
  const isList = hash => /^#\/courses\/?(?:\?.*)?$/.test(hash);
  const isCourse = hash => /^#\/(?:course\/[^/]+\/overview|courses\/[^/]+\/tab\/default)(?:[/?]|$)/.test(hash);
  const liveClass = doc => /your instructor (?:has )?started class\.?/i.test(doc.body?.innerText || '');
  function courseLinks(doc) {
    const seen = new Set();
    return [...doc.querySelectorAll('a, [role="link"]')].filter(link => {
      if (!link.getClientRects().length) return false;
      const label = link.textContent?.trim().replace(/\s+/g, ' ');
      const href = link.getAttribute('href') || '';
      const route = /(?:^|\/)#\/(?:course\/[^/]+\/overview|courses\/[^/]+)/.test(href);
      const inList = link.closest('li, [role="listitem"], .course-card, .course-list-item, .course-wrapper, ul, [role="list"]');
      if (!label || (!route && !inList) || /^(?:add|find|search|enroll|join) (?:a )?course$/i.test(label)) return false;
      if (seen.has(label)) return false;
      seen.add(label); return true;
    });
  }
  globalThis.SkiplySession.createCourseScanner = () => {
    let scanning = false, stopped = false, openedAt = 0, cycleEndedAt = null, lastHash = '', opening = false;
    const visited = new Set();
    let inSession = false;
    function observeRoute(hash) {
      if (/^#\/(?:class(?:\/|$)|polling(?:\/|$))/.test(hash)) inSession = true;
      else if (inSession && (isCourse(hash) || isList(hash))) {
        // Re-arm after leaving a class; do not retain the previous scan's stop flag.
        scanning = false; stopped = false; opening = false; cycleEndedAt = null;
        visited.clear(); inSession = false;
      }
    }
    return {
      observeRoute,
      joined() { scanning = false; stopped = true; },
      check(doc, hash, settings, navigate, now = Date.now()) {
        observeRoute(hash);
        const enteredList = isList(hash) && hash !== lastHash;
        lastHash = hash;
        if (!settings.enabled || settings.autoJoin === false) {
          scanning = false; opening = false; visited.clear(); cycleEndedAt = null; stopped = false;
          return '';
        }
        if (isList(hash)) {
          if (enteredList && stopped) { stopped = false; visited.clear(); }
          if (stopped) return '';
          scanning = true;
          if (cycleEndedAt !== null) {
            if (now - cycleEndedAt < 30000) return 'No live sessions found. Checking again shortly…';
            cycleEndedAt = null; visited.clear();
          }
          // Allow the SPA time to navigate after a course-card click.
          if (opening && now - openedAt < 5000) return 'Opening course…';
          const links = courseLinks(doc);
          if (!links.length) return 'Waiting for your course list…';
          const next = links.find(link => !visited.has(link.textContent.trim().replace(/\s+/g, ' ')));
          if (!next) { cycleEndedAt = now; opening = false; return 'No live sessions found. Checking again shortly…'; }
          visited.add(next.textContent.trim().replace(/\s+/g, ' '));
          openedAt = now; opening = true; next.click();
          return 'Checking courses for a live session…';
        }
        if (!scanning || stopped) return '';
        if (!isCourse(hash)) {
          // A successful join can navigate before the click is acknowledged.
          scanning = false; stopped = true;
          return '';
        }
        if (liveClass(doc)) return 'Live session found. Joining…';
        if (now - openedAt < 5000) return 'Checking this course…';
        opening = false; navigate('#/courses');
        return 'Checking the next course…';
      }
    };
  };
})();
