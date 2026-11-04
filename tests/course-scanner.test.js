import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function setup() {
  const context = vm.createContext({ SkiplySession: {} });
  vm.runInContext(await readFile(new URL('../src/course-scanner.js',import.meta.url),'utf8'),context);
  const clicks = [], navigation = [];
  const links = ['Course one', 'Course two'].map(label => ({
    textContent: label, getAttribute(){return 'javascript:void(0)';}, getClientRects(){return [1];}, closest(){return {};}, click(){clicks.push(label);}
  }));
  const doc = {body:{innerText:''},querySelectorAll(){return links;}};
  return {scanner:context.SkiplySession.createCourseScanner(),doc,links,clicks,navigation,navigate:hash=>navigation.push(hash)};
}
const enabled = {enabled:true,autoJoin:true};
test('opens enrolled courses, returns after an inactive course, and stops at a live class', async () => {
  const h=await setup();
  assert.match(h.scanner.check(h.doc,'#/courses',enabled,h.navigate,0),/Checking courses/);
  assert.deepEqual(h.clicks,['Course one']);
  h.scanner.check(h.doc,'#/course/one/overview',enabled,h.navigate,1000);
  assert.equal(h.navigation.length,0);
  h.scanner.check(h.doc,'#/course/one/overview',enabled,h.navigate,6000);
  assert.deepEqual(h.navigation,['#/courses']);
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,6100);
  assert.deepEqual(h.clicks,['Course one','Course two']);
  h.doc.body.innerText='Your instructor started class.';
  assert.match(h.scanner.check(h.doc,'#/course/two/overview',enabled,h.navigate,12000),/Joining/);
  assert.equal(h.navigation.length,1);
  h.scanner.joined();
  h.scanner.check(h.doc,'#/course/two/overview',enabled,h.navigate,20000);
  assert.equal(h.navigation.length,1,'joining ends navigation');
});
test('does not navigate away from manually opened courses, disabled automation or polls', async () => {
  const h=await setup();
  h.scanner.check(h.doc,'#/course/one/overview',enabled,h.navigate,10000);
  assert.equal(h.navigation.length,0);
  for(const settings of [{enabled:false,autoJoin:true},{enabled:true,autoJoin:false}]) h.scanner.check(h.doc,'#/courses',settings,h.navigate,10000);
  assert.equal(h.clicks.length,0);
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,11000);
  h.scanner.check(h.doc,'#/polling',enabled,h.navigate,12000);
  h.scanner.check(h.doc,'#/polling',enabled,h.navigate,30000);
  assert.equal(h.navigation.length,0);
});
test('waits between complete scans and never clicks add-course controls', async () => {
  const h=await setup();
  h.links.unshift({...h.links[0],textContent:'Add a course',click(){throw new Error('must not enroll');}});
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,0);
  h.scanner.check(h.doc,'#/course/one/overview',enabled,h.navigate,6000);
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,6100);
  h.scanner.check(h.doc,'#/course/two/overview',enabled,h.navigate,12000);
  assert.match(h.scanner.check(h.doc,'#/courses',enabled,h.navigate,12100),/No live sessions/);
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,25000);
  assert.equal(h.clicks.length,2);
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,43000);
  assert.equal(h.clicks.length,3);
});

test('returning from a class re-arms scanning even before a class tick runs', async () => {
  const h=await setup();
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,0);
  h.scanner.joined();
  h.scanner.observeRoute('#/class/one');
  h.scanner.observeRoute('#/courses');
  h.scanner.check(h.doc,'#/courses',enabled,h.navigate,1000);
  assert.deepEqual(h.clicks,['Course one','Course one']);
});
