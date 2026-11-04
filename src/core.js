export const defaults = { enabled: true, autoJoin: true, autoSelect: true, notifications: true, rememberSignIn: true, minimumShare: 0 };

// A tied or empty result never causes an arbitrary answer submission.
export function crowdLeader(overview, allowed = ['A', 'B', 'C', 'D', 'E']) {
  if (!Array.isArray(overview)) return null;
  const rows = overview.map(row => ({
    answer: String(row.answer ?? '').trim().toUpperCase(),
    share: Number(row.percentageOfTotalResponses)
  })).filter(row => allowed.includes(row.answer) && Number.isFinite(row.share) && row.share > 0 && row.share <= 100);
  rows.sort((a, b) => b.share - a.share);
  if (!rows.length || (rows[1] && rows[0].share === rows[1].share)) return null;
  return rows[0];
}

export function currentQuestion(data, expectedId, expectedNumber) {
  const questions = data?.data?.questions;
  if (!Array.isArray(questions) || !questions.length) return null;
  // Never silently apply a previous question's results when a live ID is known.
  if (expectedId) return questions.find(q => String(q.questionId ?? q.id) === String(expectedId)) ?? null;
  if (Number.isInteger(expectedNumber) && expectedNumber > 0) {
    const numbered = questions.filter(q => q.questionNumber !== undefined);
    if (numbered.length) return numbered.find(q => Number(q.questionNumber) === expectedNumber) ?? null;
    // The report is chronological. A shorter report is still on a previous poll.
    return questions.length === expectedNumber ? questions.at(-1) : null;
  }
  return questions.at(-1);
}

export function csv(rows) {
  const fields = ['time', 'question', 'leader', 'share', 'selected'];
  const quote = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
  return [fields, ...rows.map(r => fields.map(f => r[f]))].map(r => r.map(quote).join(',')).join('\r\n');
}
