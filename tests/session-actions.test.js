import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function setup(buttons) {
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL('../src/session-actions.js', import.meta.url), 'utf8'), context);
  return { join: context.SkiplySession.createAutoJoin(), doc: { querySelectorAll() { return buttons; } } };
}
function button(label, options = {}) {
  return { id:'', textContent:label, disabled:false, clicked:0, getClientRects(){return options.hidden ? [] : [1];}, getAttribute(){return null;}, closest(){return false;}, click(){this.clicked++;}, ...options };
}
test('joins an available session, waits between attempts, and limits retries', async () => {
  const target=button('Join session'); const {join,doc}=await setup([target]);
  const settings={enabled:true,autoJoin:true};
  assert.equal(join(doc,'#/courses/1/tab/default',settings,0),true);
  assert.equal(join(doc,'#/courses/1/tab/default',settings,5000),false);
  assert.equal(join(doc,'#/courses/1/tab/default',settings,10000),true);
  assert.equal(join(doc,'#/courses/1/tab/default',settings,20000),true);
  assert.equal(join(doc,'#/courses/1/tab/default',settings,30000),false);
  assert.equal(target.clicked,3);
  assert.equal(join(doc,'#/courses/1/tab/default',settings,61000),true);
});
test('skips hidden, disabled, non-session, login and polling controls', async () => {
  const targets=[button('Join session',{hidden:true}),button('Join session',{disabled:true}),button('Join class'),button('Join'),button('Sign in'),button('Vote')];
  const {join,doc}=await setup(targets);
  assert.equal(join(doc,'#/courses',{enabled:true,autoJoin:true},0),false);
  const available=button('Join session');
  const other=await setup([available]);
  for (const route of ['#/login','#/polling']) assert.equal(other.join(other.doc,route,{enabled:true,autoJoin:true},0),false);
  assert.equal(other.join(other.doc,'#/courses',{enabled:false,autoJoin:true},0),false);
  assert.equal(other.join(other.doc,'#/courses',{enabled:true,autoJoin:false},0),false);
  assert.equal(available.clicked,0);
});
test('recognizes the reference iClicker join control and newly available sessions', async () => {
  const hidden=button('Join',{id:'btnJoin',hidden:true}); const list=[hidden];
  const {join,doc}=await setup(list);
  assert.equal(join(doc,'#/courses',{enabled:true},0),false);
  const live=button('',{id:'btnJoin'}); list.push(live);
  assert.equal(join(doc,'#/courses',{enabled:true},1000),true);
  assert.equal(live.clicked,1);
});

test('joins the current singular course overview with its live class banner', async () => {
  const target = button('Join');
  const {join, doc} = await setup([target]);
  doc.body = {innerText:'Fall 2026 CS 18000-GLD\nYour instructor started class.\nJoin'};
  assert.equal(join(doc,'#/course/845e295c-2aeb-4abd-b5fd-43f82881abf6/overview',{enabled:true,autoJoin:true},0),true);
  assert.equal(target.clicked,1);
});

test('plain Join on a course overview requires a live class banner', async () => {
  const target = button('Join'); const {join,doc} = await setup([target]);
  doc.body = {innerText:'Add a course\nJoin'};
  assert.equal(join(doc,'#/course/test/overview',{enabled:true,autoJoin:true},0),false);
  assert.equal(target.clicked,0);
});

test('leaving a joined class resets the cooldown and attempt budget immediately', async () => {
  const target=button('Join'); const {join,doc}=await setup([target]);
  doc.body={innerText:'Your instructor started class.'};
  const settings={enabled:true,autoJoin:true}, overview='#/course/test/overview';
  for(let cycle=0;cycle<5;cycle++) {
    assert.equal(join(doc,overview,settings,cycle*1000),true);
    // The route can change while a background request is still pending.
    join.observeRoute('#/class/test/poll');
    join.observeRoute(overview);
  }
  assert.equal(target.clicked,5);
});

test('leaving legacy polling re-arms rejoin but still respects the toggle', async () => {
  const target=button('Rejoin session'); const {join,doc}=await setup([target]);
  assert.equal(join(doc,'#/courses/test/tab/default',{enabled:true},0),true);
  join.observeRoute('#/polling');
  assert.equal(join(doc,'#/courses/test/tab/default',{enabled:true,autoJoin:false},1000),false);
  assert.equal(join(doc,'#/courses/test/tab/default',{enabled:true,autoJoin:true},2000),true);
});

test('periodic checks can recover a visible Rejoin control without changing class routes', async () => {
  const target=button('Rejoin',{hidden:true}); const list=[target]; const {join,doc}=await setup(list);
  const route='#/class/test/poll', settings={enabled:true,autoJoin:true};
  assert.equal(join(doc,route,settings,0),false);
  list[0]=button('Rejoin');
  assert.equal(join(doc,route,settings,5000),true);
  assert.equal(list[0].clicked,1);
  assert.equal(join(doc,route,settings,10000),false,'retry cooldown still applies');
  assert.equal(join(doc,route,{...settings,autoJoin:false},20000),false);
});

test('periodic recovery leaves active class controls alone', async () => {
  const controls=[button('A'),button('B'),button('Return to Course'),button('Leave class')];
  const {join,doc}=await setup(controls);
  assert.equal(join(doc,'#/class/test/poll',{enabled:true},5000),false);
  assert.ok(controls.every(control=>control.clicked===0));
});
