import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { currentQuestion } from '../src/core.js';

async function adapter() {
  const context=vm.createContext({});
  vm.runInContext(await readFile(new URL('../src/poll-adapter.js',import.meta.url),'utf8'),context);
  return context.SkiplyPoll;
}
const storage=values=>({getItem(key){return values[key]??null;}});
function control(label, hidden=false) {
  return {textContent:label,disabled:false,clicked:0,classList:{contains(){return false;}},click(){this.clicked++;},getAttribute(){return null;},getClientRects(){return hidden?[]:[1];}};
}
function documentFor(buttons, number=3) {
  return {cookie:'',querySelector(){return null;},querySelectorAll(selector){
    if(selector.startsWith('h1')) return [{textContent:`Question ${number}`}];
    if(selector.startsWith('button')) return buttons;
    return [];
  }};
}
test('detects the current class poll and maps actual letter labels instead of button positions',async()=>{
  const poll=await adapter();
  const b=control('B'),a=control('A'),hidden=control('C',true);
  const result=poll.read(documentFor([b,a,hidden,control('Return to Course')]),'#/class/course1/poll',storage({activity:JSON.stringify({activityId:'session1'}),access_token:'test-only'}),storage({}));
  assert.equal(result.active,true);
  assert.equal(result.questionNumber,3);
  assert.equal(result.courseId,'course1');
  assert.equal(result.activityId,'session1');
  assert.equal(result.choices.get('B'),b);
  assert.equal(result.choices.get('A'),a);
  assert.equal(result.choices.has('C'),false);
});
test('a new question heading changes the key even when the poll URL stays the same',async()=>{
  const poll=await adapter(),buttons=[control('A'),control('B')], route='#/class/course1/poll';
  const store=storage({activity:'{"activityId":"s"}'});
  const before=poll.read(documentFor(buttons,3),route,store,storage({}));
  const after=poll.read(documentFor(buttons,4),route,store,storage({}));
  assert.notEqual(before.key,after.key);
});
test('course history does not activate voting even when answer letters are visible',async()=>{
  const poll=await adapter();
  assert.equal(poll.read(documentFor([control('A'),control('B')]),'#/course/course1/history',storage({}),storage({})).active,false);
});
test('question-number matching waits for the current report rather than using the previous question',()=>{
  const data={data:{questions:[{questionId:'one'},{questionId:'two'}]}};
  assert.equal(currentQuestion(data,null,3),null);
  assert.equal(currentQuestion(data,null,2).questionId,'two');
  assert.equal(currentQuestion(data,'wrong',2),null,'known ID takes precedence');
  assert.equal(currentQuestion({data:{questions:[{questionNumber:4,questionId:'four'}]}},null,4).questionId,'four');
});

test('a current poll snapshot and crowd response reach the correct answer click',async()=>{
  const buttons=[control('B'),control('A')], messages=[];
  const join=()=>false; join.observeRoute=()=>{};
  const context=vm.createContext({
    document:documentFor(buttons),location:{hash:'#/class/course1/poll'},
    sessionStorage:storage({activity:'{"activityId":"session1"}',access_token:'test-only'}),localStorage:storage({}),
    SkiplySession:{createAutoJoin:()=>join,createCourseScanner:()=>({check(){return '';},joined(){},observeRoute(){}})},
    chrome:{storage:{local:{get:async()=>({settings:{enabled:true,autoSelect:true}})},onChanged:{addListener(){}}},runtime:{
      onMessage:{addListener(){}},async sendMessage(message){messages.push(message);return message.type==='SNAPSHOT'?{leader:{answer:'B',share:80}}:{};}
    }},MutationObserver:class{observe(){}},addEventListener(){},setInterval(){},setTimeout(){},console
  });
  vm.runInContext(await readFile(new URL('../src/poll-adapter.js',import.meta.url),'utf8'),context);
  vm.runInContext(await readFile(new URL('../src/content.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(messages[0].snapshot.active,true);
  assert.equal(messages[0].snapshot.questionNumber,3);
  assert.equal(buttons[0].clicked,1);
  assert.equal(buttons[1].clicked,0);
  assert.equal(messages[1].type,'SELECTED');
  assert.equal(messages[1].answer,'B');
});
