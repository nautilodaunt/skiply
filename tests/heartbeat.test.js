import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

test('periodic session recovery continues while a poll reporting request is stalled', async () => {
  let interval, checks=0, onSettings, onMessage;
  const join=()=>{checks++;return false;}; join.observeRoute=()=>{};
  const context={
    SkiplyPoll:{read:()=>({active:false,choices:new Map()})},
    localStorage:{},
    SkiplySession:{createAutoJoin:()=>join,createCourseScanner:()=>({joined(){},check(){return '';},observeRoute(){}})},
    chrome:{
      storage:{local:{get:async()=>({settings:{enabled:true,autoJoin:true}})},onChanged:{addListener(fn){onSettings=fn;}}},
      runtime:{sendMessage:()=>new Promise(()=>{}),onMessage:{addListener(fn){onMessage=fn;}}}
    },
    document:{querySelector(){return null;},querySelectorAll(){return [];},cookie:'',documentElement:{}},
    sessionStorage:{getItem(){return null;}},location:{hash:'#/courses'},
    MutationObserver:class{observe(){}},addEventListener(){},
    setInterval(fn,ms){assert.equal(ms,5000);interval=fn;},setTimeout(){},console
  };
  vm.runInNewContext(await readFile(new URL('../src/content.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const initial=checks;
  interval(); interval();
  assert.equal(checks,initial+2,'heartbeat bypasses the in-flight reporting request');
  onMessage({type:'CHECK'});
  assert.equal(checks,initial+3,'background alarm also checks session recovery');
  onSettings({settings:{newValue:{enabled:false}}},'local');
  interval();
  assert.equal(checks,initial+3,'disabled monitoring stops recovery');
});
