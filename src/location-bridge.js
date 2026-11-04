(() => {
  const send = value => window.postMessage({ channel: 'skiply-location-v1', config: value || { enabled: false } }, location.origin);
  chrome.storage.local.get('location').then(({ location: value }) => send(value));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.location) send(changes.location.newValue);
  });
})();
