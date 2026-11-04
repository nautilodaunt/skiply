(() => {
  if (!['student.iclicker.com', 'localhost', '127.0.0.1'].includes(location.hostname) || !navigator.geolocation) return;
  const geo = navigator.geolocation;
  const native = {
    get: geo.getCurrentPosition.bind(geo), watch: geo.watchPosition.bind(geo), clear: geo.clearWatch.bind(geo)
  };
  let config = { enabled: false }, nextId = -1;
  const watches = new Map();
  let ready = false;
  const pending = [];
  function release() { ready = true; for (const request of pending.splice(0)) request(); }
  // Allow the storage bridge to load before the site's first location request.
  setTimeout(() => {
    if (ready) return;
    release();
    for (const watch of watches.values()) begin(watch);
  }, 1500);
  function valid(value) {
    return value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && Number.isFinite(value.accuracy) && value.accuracy > 0 && value.accuracy <= 100000;
  }
  const position = () => ({ coords: { latitude: config.latitude, longitude: config.longitude, accuracy: config.accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
  function begin(watch) {
    if (!ready) return;
    if (watch.nativeId !== undefined) native.clear(watch.nativeId);
    clearInterval(watch.timer);
    if (config.enabled) {
      queueMicrotask(() => { if (watches.has(watch.id) && config.enabled) watch.success(position()); });
      watch.timer = setInterval(() => watch.success(position()), 1000);
    } else watch.nativeId = native.watch(watch.success, watch.error, watch.options);
  }
  geo.getCurrentPosition = (success, error, options) => {
    if (typeof success !== 'function') throw new TypeError('A success callback is required.');
    const request = () => {
      if (!config.enabled) { native.get(success, error, options); return; }
      const result = position();
      setTimeout(() => success(result), 0);
    };
    if (ready) request(); else pending.push(request);
  };
  geo.watchPosition = (success, error, options) => {
    if (typeof success !== 'function') throw new TypeError('A success callback is required.');
    const id = nextId--, watch = { id, success, error, options };
    watches.set(id, watch); begin(watch); return id;
  };
  geo.clearWatch = id => {
    const watch = watches.get(id);
    if (!watch) { native.clear(id); return; }
    clearInterval(watch.timer);
    if (watch.nativeId !== undefined) native.clear(watch.nativeId);
    watches.delete(id);
  };
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== 'skiply-location-v1') return;
    const value = event.data.config;
    config = value?.enabled && valid(value) ? { enabled: true, latitude: value.latitude, longitude: value.longitude, accuracy: value.accuracy } : { enabled: false };
    release();
    for (const watch of watches.values()) begin(watch);
  });
})();
