// StudyFlow data model: validation, migration and derived statistics.
// Everything that is shown as progress is derived from recorded user actions only.
import { splitCards } from './content.mjs';

export const VERSION = 3;
export const COLORS = ['blue', 'purple', 'teal', 'amber', 'pink', 'green'];
export const ICONS = ['chart', 'flask', 'brain', 'people', 'book', 'code', 'globe', 'calc'];
export const TASK_KINDS = ['assignment', 'study', 'exam', 'break'];
export const NOTE_KINDS = ['summary', 'slides', 'podcast', 'import'];
const LISTS = { courses: 100, notes: 1000, materials: 200, tasks: 2000, questions: 2000, sessions: 10000, reviews: 10000, glossary: 2000, reads: 40000 };

export const uid = () => crypto.randomUUID();

export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00');
  return Number.isFinite(+d) && today(d) === s;
}
const validTime = s => s === '' || (typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s));
export function validURL(s) {
  try { const u = new URL(s); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}
function addDays(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return today(d);
}

export function defaultSettings() {
  return { font: 20, contrast: false, minutes: 20, dailyGoal: 30, address: 'n', name: '', institution: '', speechRate: 1, theme: 'dark', motion: 'system', continuous: false };
}
export function emptyState() {
  return { version: VERSION, courses: [], notes: [], materials: [], tasks: [], questions: [], sessions: [], reviews: [], glossary: [], reads: [], settings: defaultSettings() };
}

const fail = () => { throw Error('מבנה הנתונים אינו תקין. הנתונים הקיימים לא הוחלפו.'); };
const str = (s, max = 200) => typeof s === 'string' && s.length <= max;
const num = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const list = (d, k, max) => Array.isArray(d[k]) && d[k].length <= max;
const pick = (x, keys) => Object.fromEntries(keys.filter(k => x[k] !== undefined).map(k => [k, x[k]]));

/** Upgrade a version 2 object in place to version 3 defaults (no information is invented). */
function upgradeV2(d) {
  d.glossary ??= [];
  d.reads = [];
  d.courses = (d.courses || []).map((c, i) => ({ instructor: '', color: COLORS[i % COLORS.length], icon: ICONS[i % ICONS.length], archived: false, examDate: '', ...c }));
  d.tasks = (d.tasks || []).map(t => ({ kind: 'assignment', time: '', doneAt: '', ...t }));
  const s = d.settings || {};
  d.settings = { ...defaultSettings(), ...s, address: s.address ?? 'n', name: s.name ?? '', institution: s.institution ?? '', speechRate: s.speechRate ?? 1 };
  d.version = 3;
  return d;
}

export function validate(input) {
  let d = structuredClone(input);
  if (d?.version === 2) d = upgradeV2(d);
  if (!d || d.version !== VERSION) fail();
  d.reads ??= [];
  for (const [k, max] of Object.entries(LISTS)) if (!list(d, k, max)) fail();
  const ids = new Set();
  for (const k of Object.keys(LISTS)) for (const x of d[k]) {
    if (!x || !str(x.id, 100) || !x.id || ids.has(x.id)) fail();
    ids.add(x.id);
  }
  const courses = new Set(d.courses.map(c => c.id));
  const belongs = x => courses.has(x.courseId);

  for (const c of d.courses) {
    c.instructor ??= ''; c.color ??= 'blue'; c.icon ??= 'book'; c.archived ??= false; c.examDate ??= ''; c.ext ??= '';
    if (!str(c.ext, 300)) fail();
    if (!(str(c.name, 150) && c.name.trim() && str(c.description, 1000) && str(c.instructor, 150) && COLORS.includes(c.color) && ICONS.includes(c.icon) && typeof c.archived === 'boolean' && (c.examDate === '' || validDate(c.examDate)))) fail();
  }
  for (const n of d.notes) {
    n.position ??= 0; n.kind ??= 'summary';
    if (!NOTE_KINDS.includes(n.kind)) fail();
    const okVersions = !n.versions || (Array.isArray(n.versions) && n.versions.length <= 10 && n.versions.every(v => str(v.title, 200) && str(v.text, 200000) && str(v.updatedAt, 40) && Number.isFinite(Date.parse(v.updatedAt)) && (v.source === undefined || ['manual', 'review', 'ai', 'restore'].includes(v.source))));
    if (!(belongs(n) && str(n.title, 200) && n.title.trim() && str(n.text, 200000) && str(n.updatedAt, 40) && Number.isFinite(Date.parse(n.updatedAt)) && okVersions && Number.isInteger(n.position) && num(n.position, 0, 400))) fail();
  }
  for (const t of d.tasks) {
    t.kind ??= 'assignment'; t.time ??= ''; t.doneAt ??= ''; t.ext ??= '';
    if (!str(t.ext, 300)) fail();
    const courseOk = t.kind === 'break' ? (t.courseId === '' || belongs(t)) : belongs(t);
    if (!(courseOk && str(t.title, 200) && t.title.trim() && (!t.date || validDate(t.date)) && typeof t.done === 'boolean' && num(t.minutes, 5, 480) && (!t.planned || validDate(t.planned)) && TASK_KINDS.includes(t.kind) && validTime(t.time) && (t.doneAt === '' || validDate(t.doneAt)))) fail();
  }
  for (const m of d.materials) {
    if (!(belongs(m) && str(m.title, 200) && ['link', 'file'].includes(m.kind))) fail();
    if (m.kind === 'link' ? !validURL(m.url) : !(str(m.data, 2800000) && str(m.filename ?? '', 255))) fail();
    if (m.kind === 'file') attachmentBytes(m.data);
  }
  if (!d.glossary.every(g => belongs(g) && str(g.term, 200) && g.term.trim() && str(g.original, 200) && str(g.definition, 5000) && g.definition.trim())) fail();
  if (!d.questions.every(q => belongs(q) && str(q.prompt, 2000) && q.prompt.trim() && str(q.answer, 5000) && q.answer.trim())) fail();
  if (!d.sessions.every(s => belongs(s) && num(s.minutes, 0.01, 480) && validDate(s.date))) fail();
  const questions = new Set(d.questions.map(q => q.id));
  if (!d.reviews.every(r => questions.has(r.questionId) && typeof r.correct === 'boolean' && validDate(r.date))) fail();
  const notes = new Map(d.notes.map(n => [n.id, n]));
  if (!d.reads.every(r => notes.get(r.noteId)?.courseId === r.courseId && str(r.card, 16) && /^[0-9a-f]{8}$/.test(r.card) && validDate(r.date))) fail();

  const s = { ...defaultSettings(), ...(d.settings || {}) };
  if (!(num(s.font, 18, 40) && typeof s.contrast === 'boolean' && num(s.minutes, 5, 120) && num(s.dailyGoal, 5, 480) && ['m', 'f', 'n'].includes(s.address) && str(s.name, 150) && str(s.institution, 150) && num(s.speechRate, 0.5, 2) && ['dark', 'light'].includes(s.theme) && ['system', 'reduce'].includes(s.motion) && typeof s.continuous === 'boolean')) fail();

  // Copy only known fields. Unknown properties never reach application state.
  const keys = {
    courses: ['id', 'name', 'description', 'instructor', 'color', 'icon', 'archived', 'examDate', 'ext'],
    notes: ['id', 'courseId', 'title', 'text', 'updatedAt', 'versions', 'position', 'kind'],
    materials: ['id', 'courseId', 'title', 'kind', 'url', 'data', 'filename'],
    tasks: ['id', 'courseId', 'title', 'date', 'planned', 'minutes', 'done', 'kind', 'time', 'doneAt', 'ext'],
    questions: ['id', 'courseId', 'prompt', 'answer'],
    sessions: ['id', 'courseId', 'minutes', 'date'],
    reviews: ['id', 'questionId', 'correct', 'date'],
    glossary: ['id', 'courseId', 'term', 'original', 'definition'],
    reads: ['id', 'noteId', 'courseId', 'card', 'date'],
  };
  const out = { version: VERSION };
  for (const k of Object.keys(LISTS)) out[k] = d[k].map(x => {
    const y = pick(x, keys[k]);
    if (y.versions) y.versions = y.versions.map(v => pick(v, ['title', 'text', 'updatedAt', 'source']));
    return y;
  });
  out.settings = pick(s, Object.keys(defaultSettings()));
  return out;
}

export function migrate(old) {
  if (old?.version === VERSION || old?.version === 2) return validate(old);
  if (!old || !Array.isArray(old.courses) || old.courses.length > 100) fail();
  const d = emptyState();
  d.courses = old.courses.map((c, i) => {
    if (!Array.isArray(c) || !str(c[0], 150) || !c[0].trim()) fail();
    return { id: uid(), name: c[0], description: '', instructor: '', color: COLORS[i % COLORS.length], icon: ICONS[i % ICONS.length], archived: false, examDate: '' };
  });
  for (const [i, text] of Object.entries(old.notes || {})) {
    if (d.courses[i] && typeof text === 'string') d.notes.push({ id: uid(), courseId: d.courses[i].id, title: 'סיכום מהגרסה הקודמת', text, updatedAt: new Date().toISOString(), position: 0 });
  }
  for (const t of old.tasks || []) {
    if (d.courses[t.course] && typeof t.name === 'string') d.tasks.push({ id: uid(), courseId: d.courses[t.course].id, title: t.name, date: validDate(t.date) ? t.date : '', planned: '', done: !!t.done, minutes: 20, kind: 'assignment', time: '', doneAt: '' });
  }
  if (num(old.minutes, 5, 120)) d.settings.minutes = old.minutes;
  if (num(old.dailyGoal, 5, 480)) d.settings.dailyGoal = old.dailyGoal;
  if (['m', 'f', 'n'].includes(old.address)) d.settings.address = old.address;
  // Legacy sessions lack course/duration; preserve them separately in the original backup, never invent study time.
  return validate(d);
}

export function removeCourse(d, id) {
  const next = structuredClone(d);
  const qs = new Set(next.questions.filter(q => q.courseId === id).map(q => q.id));
  for (const k of ['courses', 'notes', 'materials', 'tasks', 'questions', 'sessions', 'glossary', 'reads']) {
    next[k] = next[k].filter(x => (k === 'courses' ? x.id !== id : x.courseId !== id));
  }
  next.reviews = next.reviews.filter(r => !qs.has(r.questionId));
  return validate(next);
}

export function removeNote(d, id) {
  const next = structuredClone(d);
  next.notes = next.notes.filter(n => n.id !== id);
  next.reads = next.reads.filter(r => r.noteId !== id);
  return validate(next);
}

// ---------- Dates ----------
export function weekDates(offset = 0, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay() + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return today(d); });
}
/** Weeks (Sunday first) of a month; days outside the month are null. */
export function monthGrid(offset = 0, now = new Date()) {
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let i = 1; i <= days; i++) cells.push(today(new Date(first.getFullYear(), first.getMonth(), i)));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year: first.getFullYear(), month: first.getMonth(), weeks };
}

export function formatMinutes(m) {
  const total = Math.round(m);
  const h = Math.floor(total / 60), r = total % 60;
  const hours = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  if (!h) return `${r} דקות`;
  return r ? `${hours} ו-${r} דקות` : hours;
}

// ---------- Derived learning data ----------
const cardCache = new Map();
export function noteCards(note) {
  const key = note.id + '\u0000' + note.title + '\u0000' + note.text;
  let cards = cardCache.get(key);
  if (!cards) {
    cards = splitCards(note.title, note.text);
    if (cardCache.size > 300) cardCache.clear();
    cardCache.set(key, cards);
  }
  return cards;
}
function readSet(d, noteId) {
  return new Set(d.reads.filter(r => r.noteId === noteId).map(r => r.card));
}
export function noteProgress(d, note) {
  const cards = noteCards(note), read = readSet(d, note.id);
  const done = cards.filter(c => read.has(c.id)).length;
  return { total: cards.length, read: done, ratio: cards.length ? done / cards.length : null };
}
export function courseProgress(d, courseId) {
  let total = 0, read = 0;
  for (const n of d.notes.filter(n => n.courseId === courseId)) { const p = noteProgress(d, n); total += p.total; read += p.read; }
  return { total, read, ratio: total ? read / total : null };
}
export function overallCoverage(d, includeArchived = false) {
  let total = 0, read = 0;
  for (const c of d.courses.filter(c => includeArchived || !c.archived)) { const p = courseProgress(d, c.id); total += p.total; read += p.read; }
  return { total, read, ratio: total ? read / total : null };
}
/** Returns a new state with a read mark for the card (no-op when already read). */
export function markRead(d, noteId, cardId, date = today()) {
  const note = d.notes.find(n => n.id === noteId);
  if (!note || d.reads.some(r => r.noteId === noteId && r.card === cardId)) return d;
  const next = structuredClone(d);
  next.reads.push({ id: uid(), noteId, courseId: note.courseId, card: cardId, date });
  return next;
}

export function stats(d, date = today()) {
  return {
    todayMinutes: d.sessions.filter(s => s.date === date).reduce((a, s) => a + s.minutes, 0),
    totalMinutes: d.sessions.reduce((a, s) => a + s.minutes, 0),
    done: d.tasks.filter(t => t.done).length,
    overdue: d.tasks.filter(t => !t.done && t.date && t.date < date).length,
  };
}

/** Consecutive days with any recorded learning (timed study, read cards or practice), ending today or yesterday. */
export function streak(d, date = today()) {
  const days = new Set([...d.sessions.map(s => s.date), ...d.reads.map(r => r.date), ...d.reviews.map(r => r.date)]);
  let day = days.has(date) ? date : addDays(date, -1), n = 0;
  while (days.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

export function periodRange(period, date = today()) {
  if (period === 'week') { const w = weekDates(0, new Date(date + 'T12:00:00')); return { start: w[0], end: w[6] }; }
  if (period === 'month') return { start: date.slice(0, 8) + '01', end: today(new Date(+date.slice(0, 4), +date.slice(5, 7), 0)) };
  return { start: '0000-01-01', end: '9999-12-31' };
}
export function periodStats(d, period, date = today()) {
  const { start, end } = periodRange(period, date);
  const inRange = x => x >= start && x <= end;
  const sessions = d.sessions.filter(s => inRange(s.date)), reviews = d.reviews.filter(r => inRange(r.date));
  const days = period === 'week' ? weekDates(0, new Date(date + 'T12:00:00')) : [];
  return {
    start, end,
    minutes: sessions.reduce((a, s) => a + s.minutes, 0),
    cardsRead: d.reads.filter(r => inRange(r.date)).length,
    answers: reviews.length,
    correct: reviews.filter(r => r.correct).length,
    tasksDone: d.tasks.filter(t => t.done && t.doneAt && inRange(t.doneAt)).length,
    openTasks: d.tasks.filter(t => !t.done && t.kind !== 'break').length,
    daily: days.map(day => ({ date: day, minutes: d.sessions.filter(s => s.date === day).reduce((a, s) => a + s.minutes, 0) })),
    byCourse: d.courses.map(c => ({ id: c.id, minutes: sessions.filter(s => s.courseId === c.id).reduce((a, s) => a + s.minutes, 0) })),
  };
}

export function reviewDue(d, questionId) {
  const rs = d.reviews.filter(r => r.questionId === questionId);
  if (!rs.length) return '';
  const last = rs.at(-1);
  let run = 0;
  for (let i = rs.length - 1; i >= 0 && rs[i].correct; i--) run++;
  const days = last.correct ? Math.min(30, [1, 3, 7, 14, 30][Math.min(run - 1, 4)]) : 0;
  return addDays(last.date, days);
}
export function reviewQueue(d, courseId = '', date = today()) {
  return d.questions
    .filter(q => (!courseId || q.courseId === courseId) && (!reviewDue(d, q.id) || reviewDue(d, q.id) <= date))
    .sort((a, b) => reviewDue(d, a.id).localeCompare(reviewDue(d, b.id)));
}

/** Items for one day in the planner: planned study items plus deadlines falling on that date. */
export function dayItems(d, date) {
  const items = d.tasks.filter(t => t.planned === date || (!t.planned && t.date === date));
  return items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99') || Number(a.done) - Number(b.done));
}

/**
 * Suggest the next study step from real data only.
 * Order: overdue or today's deadline → today's planned item → due review questions → unfinished lesson.
 */
export function recommend(d, date = today()) {
  const active = new Set(d.courses.filter(c => !c.archived).map(c => c.id));
  const open = d.tasks.filter(t => !t.done && t.kind !== 'break' && (t.courseId === '' || active.has(t.courseId)));
  const urgent = open.filter(t => t.date && t.date <= date).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (urgent) return { type: 'task', id: urgent.id, courseId: urgent.courseId, title: urgent.title, reason: urgent.date < date ? 'מועד ההגשה עבר' : 'להגשה היום', minutes: urgent.minutes };
  const planned = open.filter(t => t.planned === date).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))[0];
  if (planned) return { type: 'task', id: planned.id, courseId: planned.courseId, title: planned.title, reason: 'מתוכנן להיום', minutes: planned.minutes };
  const due = reviewQueue(d, '', date).filter(q => active.has(q.courseId) && reviewDue(d, q.id));
  if (due.length) return { type: 'review', courseId: due[0].courseId, title: `חזרה על ${due.length === 1 ? 'שאלה אחת' : due.length + ' שאלות'}`, reason: 'הגיע מועד החזרה', minutes: Math.min(30, Math.max(5, due.length * 2)) };
  const lessons = d.notes.filter(n => active.has(n.courseId)).map(n => ({ n, p: noteProgress(d, n) })).filter(x => x.p.total && x.p.read < x.p.total);
  lessons.sort((a, b) => Number(b.p.read > 0) - Number(a.p.read > 0) || b.n.updatedAt.localeCompare(a.n.updatedAt));
  const l = lessons[0];
  if (l) {
    const left = l.p.total - l.p.read;
    return { type: 'lesson', id: l.n.id, courseId: l.n.courseId, title: l.n.title, reason: l.p.read ? `${l.p.read} מתוך ${l.p.total} כרטיסים נקראו` : `${l.p.total} כרטיסים שטרם נקראו`, minutes: Math.min(d.settings.minutes, Math.max(5, left * 2)) };
  }
  const newQuestions = d.questions.filter(q => active.has(q.courseId) && !reviewDue(d, q.id));
  if (newQuestions.length) return { type: 'review', courseId: newQuestions[0].courseId, title: `תרגול ${newQuestions.length === 1 ? 'שאלה חדשה' : newQuestions.length + ' שאלות חדשות'}`, reason: 'שאלות שטרם תורגלו', minutes: Math.min(30, Math.max(5, newQuestions.length * 2)) };
  return null;
}

export function weeklyReport(d, now = new Date()) {
  const days = weekDates(0, now), start = days[0], end = days[6];
  const sessions = d.sessions.filter(s => s.date >= start && s.date <= end);
  const lines = ['StudyFlow - דוח שבועי', start + ' - ' + end,
    'זמן למידה שתועד: ' + Math.round(sessions.reduce((a, s) => a + s.minutes, 0)) + ' דקות',
    'יחידות למידה: ' + sessions.length,
    'כרטיסי שיעור שנקראו: ' + d.reads.filter(r => r.date >= start && r.date <= end).length,
    'סיכומים שמורים: ' + d.notes.length,
    'חומרי לימוד שמורים: ' + d.materials.length];
  for (const c of d.courses) {
    const mins = Math.round(sessions.filter(s => s.courseId === c.id).reduce((a, s) => a + s.minutes, 0));
    const p = courseProgress(d, c.id);
    lines.push(c.name + ': ' + mins + ' דקות; ' + d.notes.filter(n => n.courseId === c.id).length + ' סיכומים; ' + (p.total ? `${p.read}/${p.total} כרטיסים נקראו; ` : '') + d.tasks.filter(t => t.courseId === c.id && !t.done).length + ' משימות פתוחות');
  }
  lines.push('מועדי הגשה פתוחים:');
  for (const t of d.tasks.filter(t => !t.done && t.date).sort((a, b) => a.date.localeCompare(b.date))) lines.push(t.date + ' · ' + t.title);
  lines.push('הדוח מבוסס על תיעוד עצמי בלבד. אין כאן הערכת מוכנות למבחן.');
  return lines.join('\n');
}

/** iCalendar export of dated tasks so the user can import deadlines into any calendar app. */
export function toICS(d, now = new Date()) {
  const escText = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const name = id => d.courses.find(c => c.id === id)?.name || '';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//StudyFlow//HE', 'CALSCALE:GREGORIAN'];
  const ev = (uidv, date, summary, desc, alarm) => {
    const start = date.replace(/-/g, ''), end = addDays(date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${uidv}@studyflow`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${escText(summary)}`);
    if (desc) lines.push(`DESCRIPTION:${escText(desc)}`);
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escText(summary)}`, 'TRIGGER:-P1D', 'END:VALARM');
    lines.push('END:VEVENT');
  };
  for (const t of d.tasks.filter(t => !t.done)) {
    if (t.date) ev(t.id + '-due', t.date, (t.kind === 'exam' ? 'מבחן: ' : 'הגשה: ') + t.title, name(t.courseId), true);
    if (t.planned && t.planned !== t.date) ev(t.id + '-plan', t.planned, 'למידה: ' + t.title, `${name(t.courseId)} · ${t.minutes} דקות`, false);
  }
  for (const c of d.courses.filter(c => c.examDate && !c.archived)) ev(c.id + '-exam', c.examDate, 'מבחן: ' + c.name, c.instructor ? 'מרצה: ' + c.instructor : '', true);
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function lumiReply(d, text) {
  const s = stats(d), q = text.trim();
  if (/משימ|הגשה|דחוף/.test(q)) {
    const tasks = d.tasks.filter(t => !t.done && t.kind !== 'break').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999')).slice(0, 5);
    return tasks.length ? 'המשימות הקרובות שלך:\n' + tasks.map(t => `${t.title} · ${t.date || 'ללא מועד'}`).join('\n') : 'אין כרגע משימות פתוחות. אפשר להוסיף משימה במסך התוכנית.';
  }
  if (/התקדמ|כמה|מטרה/.test(q)) {
    const c = overallCoverage(d);
    return `היום תועדו ${Math.round(s.todayMinutes)} דקות מתוך יעד של ${d.settings.dailyGoal}. בסך הכול ${Math.round(s.totalMinutes)} דקות ו-${s.done} משימות הושלמו.` + (c.total ? ` נקראו ${c.read} מתוך ${c.total} כרטיסי שיעור.` : '');
  }
  if (/תרג|שאל|חזר/.test(q)) return d.questions.length ? `יש לך ${d.questions.length} שאלות חזרה. במסך התרגול מוצגות קודם שאלות שטרם תרגלת ושאלות שהיו קשות.` : 'עוד אין שאלות חזרה. אפשר להוסיף שאלה ותשובה מתוך חומרי הלימוד, במסך הקורס.';
  if (/סיכו|חומר/.test(q)) return `שמורים אצלך ${d.notes.length} סיכומים ו-${d.materials.length} חומרי לימוד. אפשר לחפש, לערוך ולהקריא סיכומים בקורסים.`;
  const next = recommend(d);
  return (next ? `ההמלצה שלי לעכשיו: ${next.title} (${next.reason}). ` : '') + 'במצב מקומי אני עונה מתוך הנתונים השמורים: משימות, התקדמות, תרגול וסיכומים. מענה חופשי באמצעות AI עדיין לא מחובר.';
}

export function attachmentBytes(data) {
  const match = /^data:(application\/pdf|image\/(?:png|jpeg|webp)|text\/plain);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(data);
  if (!match) throw Error('תוכן הקובץ אינו תקין.');
  return { type: match[1], bytes: Uint8Array.from(atob(match[2]), c => c.charCodeAt(0)) };
}

/**
 * Merge a Moodle snapshot into state. Courses are matched by external id; only selected items are imported.
 * snapshot: {site, courses:[{id, fullname}], items:[{id, courseId, name, due (YYYY-MM-DD)}]}; pick: {courses:Set, items:Set}
 */
export function mergeMoodle(d, snapshot, pick, now = new Date()) {
  const next = structuredClone(d);
  const site = new URL(snapshot.site).host;
  const extC = id => `moodle:${site}:course:${id}`, extT = id => `moodle:${site}:item:${id}`;
  let addedCourses = 0, addedTasks = 0, updatedTasks = 0;
  const local = new Map();
  for (const mc of snapshot.courses.filter(c => pick.courses.has(String(c.id)))) {
    let c = next.courses.find(x => x.ext === extC(mc.id));
    if (!c) {
      c = { id: uid(), name: String(mc.fullname).slice(0, 150) || 'קורס', description: 'יובא מ-Moodle', instructor: '', color: COLORS[next.courses.length % COLORS.length], icon: ICONS[next.courses.length % ICONS.length], archived: false, examDate: '', ext: extC(mc.id) };
      next.courses.push(c);
      addedCourses++;
    }
    local.set(String(mc.id), c.id);
  }
  for (const it of snapshot.items.filter(i => pick.items.has(String(i.id)))) {
    const courseId = local.get(String(it.courseId)) || next.courses.find(x => x.ext === extC(it.courseId))?.id;
    if (!courseId) continue;
    const existing = next.tasks.find(t => t.ext === extT(it.id));
    if (existing) {
      if (existing.date !== (it.due || '') || existing.title !== it.name.slice(0, 200)) { existing.date = it.due || ''; existing.title = it.name.slice(0, 200); updatedTasks++; }
    } else {
      next.tasks.push({ id: uid(), courseId, title: String(it.name).slice(0, 200), date: validDate(it.due) ? it.due : '', planned: '', minutes: 60, done: false, kind: 'assignment', time: '', doneAt: '', ext: extT(it.id) });
      addedTasks++;
    }
  }
  return { state: validate(next), addedCourses, addedTasks, updatedTasks };
}

/** Convert generated slides [{title, bullets[], notes}] into lesson markdown. */
export function slidesToMarkdown(slides) {
  return slides.map(s => `# ${s.title}\n${(s.bullets || []).map(b => '- ' + b).join('\n')}${s.notes ? '\n\n' + s.notes : ''}`).join('\n\n');
}
