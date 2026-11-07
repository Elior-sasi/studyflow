import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, validate, migrate, validDate, validURL, weekDates, monthGrid, stats, reviewQueue, reviewDue, removeCourse, removeNote, weeklyReport, attachmentBytes, lumiReply, noteCards, noteProgress, courseProgress, overallCoverage, markRead, streak, periodStats, recommend, dayItems, toICS, formatMinutes } from '../model.mjs';

function fixture() {
  const d = emptyState();
  d.courses.push({ id: 'c1', name: 'סטטיסטיקה', description: '', instructor: 'ד״ר כהן', color: 'blue', icon: 'chart', archived: false, examDate: '' });
  d.notes.push({ id: 'n1', courseId: 'c1', title: 'סיכום', text: '# התפלגות נורמלית\nמוגדרת על ידי ממוצע וסטיית תקן\n\n# משפט הגבול המרכזי\nממוצעים של מדגמים גדולים מתקרבים להתפלגות נורמלית', updatedAt: '2026-11-04T10:00:00Z', position: 0 });
  d.questions.push({ id: 'q1', courseId: 'c1', prompt: 'שאלה', answer: 'תשובה' });
  d.tasks.push({ id: 't1', courseId: 'c1', title: 'מטלה', date: '2026-11-05', planned: '2026-11-04', minutes: 20, done: false, kind: 'assignment', time: '', doneAt: '' });
  d.glossary.push({ id: 'g1', courseId: 'c1', term: 'ממוצע', original: 'Mean', definition: 'סכום חלקי מספר ערכים' });
  return d;
}

test('empty installation has no fabricated courses or progress', () => {
  const d = validate(emptyState());
  assert.equal(d.courses.length, 0);
  assert.equal(stats(d).totalMinutes, 0);
  assert.equal(overallCoverage(d).ratio, null);
  assert.equal(recommend(d), null);
  assert.equal(streak(d), 0);
});

test('backup roundtrip preserves Hebrew notes, tasks, glossary, versions, reads and files', () => {
  const d = fixture();
  d.materials.push({ id: 'm1', courseId: 'c1', title: 'קובץ', kind: 'file', data: 'data:text/plain;base64,SGVsbG8=', filename: 'a.txt' });
  d.notes[0].versions = [{ title: 'ישן', text: 'טקסט ישן', updatedAt: '2026-11-03T10:00:00Z', source: 'manual' }];
  const read = markRead(d, 'n1', noteCards(d.notes[0])[0].id, '2026-11-04');
  assert.deepEqual(validate(JSON.parse(JSON.stringify(read))), read);
});

test('version 2 data upgrades without inventing progress and keeps preferences', () => {
  const v2 = { version: 2, courses: [{ id: 'c1', name: 'קורס', description: 'x' }], notes: [{ id: 'n1', courseId: 'c1', title: 't', text: 'טקסט', updatedAt: '2026-11-03T10:00:00Z' }], materials: [], tasks: [{ id: 't1', courseId: 'c1', title: 'מטלה', date: '', planned: '', minutes: 20, done: true }], questions: [], sessions: [{ id: 's1', courseId: 'c1', minutes: 3, date: '2026-11-02' }], reviews: [], glossary: [], settings: { font: 24, contrast: true, minutes: 25, dailyGoal: 45, address: 'f', name: 'אליאור', institution: '', speechRate: 0.9 } };
  const d = validate(v2);
  assert.equal(d.version, 3);
  assert.equal(d.reads.length, 0);
  assert.equal(d.tasks[0].kind, 'assignment');
  assert.equal(d.tasks[0].doneAt, '');
  assert.equal(d.settings.font, 24);
  assert.equal(d.settings.address, 'f');
  assert.equal(d.settings.theme, 'dark');
  assert.equal(courseProgress(d, 'c1').read, 0);
  assert.equal(v2.version, 2, 'input must not be mutated');
});

test('migration preserves legacy user content and leaves input untouched', () => {
  const old = { courses: [['קורס שלי', 90, 15]], notes: { 0: 'הסיכום המקורי' }, tasks: [{ name: 'להגיש', course: 0, date: '2026-11-05', done: true }], minutes: 25, dailyGoal: 40, history: [1, 2], sessions: 2 };
  const before = JSON.stringify(old), d = migrate(old);
  assert.equal(d.notes[0].text, old.notes[0]);
  assert.equal(d.tasks[0].courseId, d.courses[0].id);
  assert.equal(d.sessions.length, 0);
  assert.equal(JSON.stringify(old), before);
  assert.doesNotThrow(() => validate(d));
});

test('rejects corrupt payloads and invalid values', () => {
  for (const modify of [
    d => d.settings.font = '20;display:none', d => d.settings.dailyGoal = -1, d => d.tasks[0].minutes = Infinity,
    d => d.courses.push({ ...d.courses[0] }), d => d.notes[0].courseId = 'missing', d => d.tasks[0].date = '2026-02-30',
    d => d.notes[0].versions = [{ text: 5 }], d => d.reviews.push({ id: 'r', questionId: 'no', correct: true, date: '2026-11-04' }),
    d => d.courses[0].color = 'red;}', d => d.courses[0].icon = '<svg>', d => d.tasks[0].time = '25:00', d => d.tasks[0].kind = 'x',
    d => d.settings.theme = 'neon', d => d.reads.push({ id: 'r', noteId: 'n1', courseId: 'c1', card: '<b>', date: '2026-11-04' }),
    d => d.reads.push({ id: 'r', noteId: 'nope', courseId: 'c1', card: 'abcdef12', date: '2026-11-04' }),
  ]) {
    const d = fixture();
    modify(d);
    assert.throws(() => validate(d));
  }
});

test('unknown fields are stripped from imported data', () => {
  const d = fixture();
  d.courses[0].evil = '<img onerror=alert(1)>';
  d.settings.injected = true;
  const v = validate(d);
  assert.equal('evil' in v.courses[0], false);
  assert.equal('injected' in v.settings, false);
});

test('rejects executable URLs and active attachment MIME types', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html;base64,AAA', 'file:///etc/passwd']) {
    assert.equal(validURL(url), false);
    const d = fixture();
    d.materials.push({ id: 'm', courseId: 'c1', title: 'bad', kind: 'link', url });
    assert.throws(() => validate(d));
  }
  const d = fixture();
  d.materials.push({ id: 'm', courseId: 'c1', title: 'bad', kind: 'file', data: 'data:text/html;base64,AAAA' });
  assert.throws(() => validate(d));
  assert.equal(validURL('https://example.com'), true);
});

test('Sunday-based weeks and month grids cross boundaries', () => {
  assert.deepEqual(weekDates(0, new Date(2027, 0, 1)), ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(weekDates(-1, new Date(2027, 0, 1))[0], '2026-12-20');
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-02-29'), false);
  const m = monthGrid(0, new Date(2026, 10, 7));
  assert.equal(m.weeks[0][0], '2026-11-01'); // Nov 1 2026 is a Sunday
  assert.equal(m.weeks.flat().filter(Boolean).length, 30);
  assert.equal(monthGrid(2, new Date(2026, 10, 7)).year, 2027);
});

test('statistics use recorded durations and real task state', () => {
  const d = fixture();
  d.sessions.push({ id: 's1', courseId: 'c1', minutes: 2.5, date: '2026-11-04' }, { id: 's2', courseId: 'c1', minutes: 3, date: '2026-11-03' });
  assert.deepEqual(stats(d, '2026-11-04'), { todayMinutes: 2.5, totalMinutes: 5.5, done: 0, overdue: 0 });
  assert.equal(stats(d, '2026-11-06').overdue, 1);
  assert.match(weeklyReport(d, new Date(2026, 10, 4)), /6 דקות/);
  const p = periodStats(d, 'week', '2026-11-04');
  assert.equal(p.minutes, 5.5);
  assert.equal(p.daily.length, 7);
  assert.equal(p.daily.find(x => x.date === '2026-11-04').minutes, 2.5);
  assert.equal(formatMinutes(110), 'שעה ו-50 דקות');
  assert.equal(formatMinutes(20), '20 דקות');
});

test('lesson coverage is derived only from read cards and survives unrelated edits', () => {
  let d = fixture();
  const cards = noteCards(d.notes[0]);
  assert.equal(cards.length, 2);
  assert.deepEqual(noteProgress(d, d.notes[0]), { total: 2, read: 0, ratio: 0 });
  d = markRead(d, 'n1', cards[0].id, '2026-11-04');
  d = markRead(d, 'n1', cards[0].id, '2026-11-04');
  assert.equal(d.reads.length, 1, 'marking twice does not double count');
  assert.equal(courseProgress(d, 'c1').ratio, 0.5);
  // Editing the second card keeps the first card's read state but not a stale second card.
  d.notes[0].text = d.notes[0].text.replace('גדולים', 'גדולים מאוד');
  assert.equal(noteProgress(d, d.notes[0]).read, 1);
  d.notes[0].text = 'טקסט חדש לגמרי';
  assert.equal(noteProgress(d, d.notes[0]).read, 0);
});

test('streak counts consecutive learning days and tolerates today not started', () => {
  const d = fixture();
  d.sessions.push({ id: 's1', courseId: 'c1', minutes: 5, date: '2026-11-04' }, { id: 's2', courseId: 'c1', minutes: 5, date: '2026-11-05' });
  d.reviews.push({ id: 'r1', questionId: 'q1', correct: true, date: '2026-11-06' });
  assert.equal(streak(d, '2026-11-06'), 3);
  assert.equal(streak(d, '2026-11-07'), 3);
  assert.equal(streak(d, '2026-11-08'), 0);
});

test('recommendation follows real priorities', () => {
  let d = fixture();
  assert.equal(recommend(d, '2026-11-05').reason, 'להגשה היום');
  assert.equal(recommend(d, '2026-11-04').reason, 'מתוכנן להיום');
  d.tasks[0].done = true;
  assert.equal(recommend(d, '2026-11-04').type, 'lesson');
  for (const c of noteCards(d.notes[0])) d = markRead(d, 'n1', c.id, '2026-11-04');
  assert.equal(recommend(d, '2026-11-04').type, 'review');
  d.courses[0].archived = true;
  assert.equal(recommend(d, '2026-11-04'), null, 'archived courses are not recommended');
});

test('day items include planned work and unplanned deadlines in time order', () => {
  const d = fixture();
  d.tasks.push({ id: 't2', courseId: '', title: 'הפסקה', date: '', planned: '2026-11-04', minutes: 10, done: false, kind: 'break', time: '09:00', doneAt: '' });
  d.tasks.push({ id: 't3', courseId: 'c1', title: 'הגשה', date: '2026-11-04', planned: '', minutes: 30, done: false, kind: 'assignment', time: '', doneAt: '' });
  assert.deepEqual(dayItems(validate(d), '2026-11-04').map(t => t.id), ['t2', 't1', 't3']);
});

test('spaced repetitions use 1/3/7-day successful intervals; failures return today', () => {
  const d = fixture();
  assert.equal(reviewQueue(d, '', '2026-11-04').length, 1);
  d.reviews.push({ id: 'r1', questionId: 'q1', correct: true, date: '2026-11-04' });
  assert.equal(reviewDue(d, 'q1'), '2026-11-05');
  assert.equal(reviewQueue(d, '', '2026-11-04').length, 0);
  d.reviews.push({ id: 'r2', questionId: 'q1', correct: true, date: '2026-11-05' });
  assert.equal(reviewDue(d, 'q1'), '2026-11-08');
  d.reviews.push({ id: 'r3', questionId: 'q1', correct: false, date: '2026-11-08' });
  assert.equal(reviewDue(d, 'q1'), '2026-11-08');
});

test('deleting a course or note cascades without dangling records', () => {
  let d = fixture();
  d.reviews.push({ id: 'r1', questionId: 'q1', correct: true, date: '2026-11-04' });
  d = markRead(d, 'n1', noteCards(d.notes[0])[0].id, '2026-11-04');
  const next = removeCourse(d, 'c1');
  for (const key of ['courses', 'notes', 'tasks', 'questions', 'reviews', 'glossary', 'reads']) assert.equal(next[key].length, 0);
  assert.equal(d.courses.length, 1);
  assert.equal(removeNote(d, 'n1').reads.length, 0);
});

test('calendar export escapes text and includes alarms for deadlines', () => {
  const d = fixture();
  d.tasks[0].title = 'מטלה, חלק; 1';
  const ics = toICS(d, new Date('2026-11-04T10:00:00Z'));
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261105/);
  assert.match(ics, /SUMMARY:הגשה: מטלה\\, חלק\\; 1/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /SUMMARY:למידה: /);
});

test('Lumi local mode uses stored facts and clearly discloses it is not AI', () => {
  const d = fixture();
  assert.match(lumiReply(d, 'משימות'), /מטלה/);
  assert.match(lumiReply(d, 'שלום'), /AI עדיין לא מחובר/);
  assert.match(lumiReply(d, 'סיכומים'), /1 סיכומים/);
});

test('attachment export reconstructs exact UTF-8 bytes and rejects malformed base64', () => {
  const original = 'סיכום לימודי בעברית';
  const data = 'data:text/plain;base64,' + Buffer.from(original).toString('base64');
  const decoded = attachmentBytes(data);
  assert.equal(decoded.type, 'text/plain');
  assert.equal(new TextDecoder().decode(decoded.bytes), original);
  assert.throws(() => attachmentBytes('data:text/plain;base64,===='));
  const d = fixture();
  d.materials.push({ id: 'bad', courseId: 'c1', kind: 'file', title: 'קובץ פגום', data: 'data:text/plain;base64,====' });
  assert.throws(() => validate(d));
});
