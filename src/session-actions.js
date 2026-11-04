(() => {
  globalThis.SkiplySession = {
    createAutoJoin() {
      let attempts = new WeakMap();
      let lastClick = -Infinity, inSession = false;
      function observeRoute(hash) {
        if (/^#\/(?:class(?:\/|$)|polling(?:\/|$))/.test(hash)) inSession = true;
        else if (inSession && /^#\/(?:courses(?:\/|$)|course\/)/.test(hash)) {
          // A completed join followed by leaving is a fresh attempt, not a failed retry.
          attempts = new WeakMap(); lastClick = -Infinity; inSession = false;
        }
      }
      function autoJoin(doc, hash, settings, now = Date.now()) {
        observeRoute(hash);
        const courseRoute = /^#\/(?:courses(?:\/|$)|course\/[^/]+(?:\/|$))/.test(hash);
        const classRoute = /^#\/class\/[^/]+(?:\/|$)/.test(hash);
        if (!settings.enabled || settings.autoJoin === false || (!courseRoute && !classRoute) || now - lastClick < 10000) return false;
        const liveOverview = /^#\/course\/[^/]+\/overview(?:[/?]|$)/.test(hash) && /your instructor (?:has )?started class\.?/i.test(doc.body?.innerText || '');
        const candidates = doc.querySelectorAll('#btnJoin, [data-action="join-session"], button, [role="button"]');
        for (const button of candidates) {
          if (!button.getClientRects().length || button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
          const label = (button.textContent?.trim() || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
          const explicit = button.id === 'btnJoin' || button.getAttribute('data-action') === 'join-session';
          const sessionLabel = /^(?:join|rejoin) (?:live )?session$/i.test(label);
          const rejoinClass = classRoute && /^rejoin(?: class)?$/i.test(label);
          const contextualJoin = /^(?:join|rejoin)(?: class)?$/i.test(label) && (liveOverview || button.closest('[data-session-id], .session, #join-inner-container'));
          if (!explicit && !sessionLabel && !contextualJoin && !rejoinClass) continue;
          const previous = attempts.get(button) || { count: 0, start: now };
          if (now - previous.start >= 60000) { previous.count = 0; previous.start = now; }
          if (previous.count >= 3) continue;
          attempts.set(button, { count: previous.count + 1, start: previous.start });
          lastClick = now; button.click(); return true;
        }
        return false;
      }
      autoJoin.observeRoute = observeRoute;
      return autoJoin;
    }
  };
})();
