(() => {
  const visible = element => !!element && element.getClientRects().length > 0;
  function readJSON(storage, key) {
    try { return JSON.parse(storage?.getItem(key) || '{}') || {}; } catch { return {}; }
  }
  globalThis.SkiplyPoll = {
    read(doc, route, session, local) {
      const stored = readJSON(session, 'activity');
      const activity = stored.activityId ? stored : readJSON(local, 'activity');
      const poll = doc.querySelector('.polling-page-wrapper, [data-question-id]');
      const choices = new Map();
      for (const button of doc.querySelectorAll('button, [role="button"], [role="radio"], input[type="radio"], input[type="button"]')) {
        if (!visible(button)) continue;
        const label = (button.getAttribute('aria-label') || button.textContent || button.value || '').trim();
        const match = label.match(/^([A-E])[.)]?$/i);
        if (match) choices.set(match[1].toUpperCase(), button);
      }
      // Older iClicker buttons may have no accessible letter label.
      if (!choices.size) {
        [...doc.querySelectorAll('.btn-container')].forEach((element, index) => {
          const button = element.querySelector('button, input, [role="button"]') || element.firstElementChild;
          if (visible(button) && index < 5) choices.set(String.fromCharCode(65 + index), button);
        });
      }
      const heading = [...doc.querySelectorAll('h1, h2, [role="heading"]')].map(el => el.textContent?.trim() || '').find(text => /^Question\s+\d+$/i.test(text));
      const questionNumber = heading ? Number(heading.match(/\d+/)[0]) : null;
      const question = doc.querySelector('.question-text, .question-title, [data-question-text]')?.textContent?.trim() || heading || '';
      const questionId = poll?.dataset.questionId || activity.questionId || null;
      const classRoute = route.match(/^#\/class\/([^/?]+)\/poll(?:[/?]|$)/);
      const pollingRoute = !!classRoute || /^#\/polling(?:[/?]|$)/.test(route);
      const buttons = [...choices.values()];
      const active = pollingRoute && (visible(poll) || !!heading) && buttons.some(button => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
      let token;
      try { token = session?.getItem('access_token') || local?.getItem('access_token'); } catch {}
      if (!token) {
        const cookie = doc.cookie.split('; ').find(value => value.startsWith('access_token='));
        if (cookie) { try { token = decodeURIComponent(cookie.slice(13)); } catch {} }
      }
      const courseId = classRoute?.[1] || activity.courseId;
      const activityId = activity.activityId || doc.querySelector('[data-activity-id]')?.dataset.activityId;
      return { active, courseId, activityId, questionId, questionNumber, question, token, choices,
        key: active ? [courseId, activityId, questionId || questionNumber || question || 'current'].join(':') : '',
        session: /^#\/class\//.test(route) || active,
        title: doc.querySelector('.course-name, .course-title')?.textContent?.trim() || 'iClicker session'
      };
    }
  };
})();
