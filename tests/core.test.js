import test from 'node:test';
import assert from 'node:assert/strict';
import { crowdLeader, currentQuestion, csv } from '../src/core.js';
const vote = (answer, percentageOfTotalResponses) => ({ answer, percentageOfTotalResponses });
test('selects the highest share, independent of response order', () => {
  assert.deepEqual(crowdLeader([vote('A', 15), vote('C', 65), vote('B', 20)]), { answer: 'C', share: 65 });
});
test('ties, missing votes and unsupported choices do not produce a selection', () => {
  for (const rows of [null, [], [vote('A', 0)], [vote('A', 50), vote('B', 50)], [vote('F', 100)], [vote('A', 'oops')], [vote('A', 101)]]) assert.equal(crowdLeader(rows), null);
  assert.equal(crowdLeader([vote('C', 90)], ['A', 'B']), null);
});
test('matches live question IDs instead of silently using a previous result', () => {
  const data = { data: { questions: [{ questionId: 'old' }, { questionId: 'new' }] } };
  assert.equal(currentQuestion(data, 'absent'), null);
  assert.equal(currentQuestion(data, 'old').questionId, 'old');
  assert.equal(currentQuestion(data).questionId, 'new');
  assert.equal(currentQuestion({}), null);
});
test('exports multiline questions and quotes without spreadsheet formula execution', () => {
  const output = csv([{ question: '=HYPERLINK("x")\nnext', leader: 'A', share: 60 }]);
  assert.ok(output.includes('"\'=HYPERLINK(""x"")\nnext"'));
  assert.ok(output.startsWith('"time","question"'));
});
