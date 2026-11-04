import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { coordinates, pointToCoordinates, parseLocation } from '../src/location-core.js';

test('imports coordinates and Google Maps pins, query links, and map centers', () => {
  assert.equal(parseLocation('40.4237, -86.9212').latitude,40.4237);
  assert.equal(parseLocation('https://www.google.com/maps/search/?api=1&query=40.4237%2C-86.9212').longitude,-86.9212);
  assert.equal(parseLocation('https://www.google.com/maps/@10,20,15z').latitude,10);
  assert.equal(parseLocation('https://www.google.com/maps/place/Test/@10,20,15z/data=!3d40!4d-86').latitude,40);
  for (const input of ['not a point','91, 20','https://maps.app.goo.gl/short','https://evil.example/maps/@10,20','https://www.google.com/maps/search/?q=Somewhere']) assert.throws(() => parseLocation(input));
});

test('validates coordinates, including zero and bounds', () => {
  assert.deepEqual(coordinates('0','0','10'), { latitude: 0, longitude: 0, accuracy: 10 });
  assert.equal(coordinates(-90,180,1).latitude,-90);
  for (const values of [['',0,10],[91,0,10],[0,-181,10],[0,0,0],[0,0,Infinity],[NaN,0,1]]) assert.throws(() => coordinates(...values));
});
test('coordinate grid maps poles, center, and clamped edges', () => {
  assert.deepEqual(pointToCoordinates(0.5,0.5), { latitude:0, longitude:0 });
  assert.deepEqual(pointToCoordinates(0,0), { latitude:90, longitude:-180 });
  assert.deepEqual(pointToCoordinates(2,2), { latitude:-90, longitude:180 });
});
for (const [hostname, origin] of [['localhost', 'http://localhost:8080'], ['student.iclicker.com', 'https://student.iclicker.com']]) test(`simulates and restores location on ${hostname}`, async () => {
  const code = await readFile(new URL('../src/location-simulator.js', import.meta.url),'utf8');
  const listeners = {}, native = [], timers = new Map();
  let nextTimer = 1;
  const geo = {
    getCurrentPosition(success) { native.push('get'); success({ coords:{ latitude:1, longitude:2 } }); },
    watchPosition(success) { native.push('watch'); return 42; },
    clearWatch(id) { native.push(`clear:${id}`); }
  };
  const win = { addEventListener(type, fn) { listeners[type] = fn; } };
  const context = { window:win, location:{ hostname, origin }, navigator:{ geolocation:geo }, Date, Number, Map, TypeError,
    setTimeout(fn) { fn(); }, queueMicrotask(fn) { fn(); },
    setInterval(fn) { const id = nextTimer++; timers.set(id,fn); return id; }, clearInterval(id) { timers.delete(id); }
  };
  vm.runInNewContext(code, context);
  const config = (value, messageOrigin=origin) => listeners.message({ source:win, origin: messageOrigin, data:{ channel:'skiply-location-v1',config:value } });
  config({ enabled:true,latitude:40,longitude:-86,accuracy:10 });
  let result;
  geo.getCurrentPosition(p => result=p);
  assert.equal(result.coords.latitude,40); assert.equal(native.length,0);
  assert.equal(result.coords.altitude,null);
  const positions=[];
  const id=geo.watchPosition(p => positions.push(p.coords.latitude));
  assert.deepEqual(positions,[40]);
  config({ enabled:true,latitude:45,longitude:90,accuracy:5 });
  assert.deepEqual(positions,[40,45]);
  assert.equal(timers.size,1,'profile changes replace existing watch timers');
  config({ enabled:true,latitude:60,longitude:90,accuracy:5 },'http://evil.example');
  geo.getCurrentPosition(p => result=p); assert.equal(result.coords.latitude,45);
  config({ enabled:false });
  assert.equal(timers.size,0); assert.ok(native.includes('watch'));
  geo.getCurrentPosition(p => result=p); assert.equal(result.coords.latitude,1);
  geo.clearWatch(id); assert.ok(native.includes('clear:42'));
  config({ enabled:true,latitude:999,longitude:90,accuracy:5 });
  geo.getCurrentPosition(p => result=p); assert.equal(result.coords.latitude,1,'invalid simulation uses native location');
  assert.throws(() => geo.getCurrentPosition(null));
});
test('simulator does not patch geolocation on unrelated websites', async () => {
  const code = await readFile(new URL('../src/location-simulator.js',import.meta.url),'utf8');
  const original = () => {};
  const geo = { getCurrentPosition:original };
  vm.runInNewContext(code,{ location:{hostname:'example.org'},navigator:{geolocation:geo} });
  assert.equal(geo.getCurrentPosition,original);
});

test('early iClicker requests wait for saved settings before using location', async () => {
  const code = await readFile(new URL('../src/location-simulator.js',import.meta.url),'utf8');
  const timers = [], calls = [], listeners = {};
  const geo = { getCurrentPosition() { calls.push('native'); }, watchPosition() { calls.push('watch'); }, clearWatch() {} };
  const win = { addEventListener(name,fn) { listeners[name]=fn; } };
  vm.runInNewContext(code, {
    window:win, navigator:{geolocation:geo}, location:{hostname:'student.iclicker.com',origin:'https://student.iclicker.com'},
    setTimeout(fn,delay) { timers.push({fn,delay}); }, setInterval(){}, clearInterval(){}, queueMicrotask(fn){fn();}, Date
  });
  let result;
  geo.getCurrentPosition(position => { result=position; });
  assert.equal(calls.length,0,'initial native request must not race saved settings');
  listeners.message({source:win,origin:'https://student.iclicker.com',data:{channel:'skiply-location-v1',config:{enabled:true,latitude:40,longitude:-86,accuracy:10}}});
  for (const timer of timers.filter(t=>t.delay===0)) timer.fn();
  assert.equal(result.coords.latitude,40);
  timers.find(t=>t.delay===1500).fn();
  assert.equal(calls.length,0,'fallback must not replace a loaded simulated point');
});

test('manifest installs both location scripts on iClicker at document start', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
  for (const file of ['src/location-simulator.js','src/location-bridge.js']) {
    const script = manifest.content_scripts.find(entry=>entry.js.includes(file));
    assert.ok(script.matches.includes('https://student.iclicker.com/*'));
    assert.equal(script.run_at,'document_start');
    if (file.includes('simulator')) assert.equal(script.world,'MAIN');
  }
});
