// StudyFlow app controller: storage, routing, actions, speech, timer and the Lumi client.
import * as M from './model.mjs';
import { esc, speechText, diffWords, diffHTML, diffStats, retrieve } from './content.mjs';
import { icon } from './icons.mjs';
import * as V from './views.mjs';
import { pptxToMarkdown } from './importers.mjs';
import * as C from './cloud.mjs';

// Handle a Google sign-in redirect before anything reads the URL hash.
const oauthReturn = C.consumeOAuthReturn();
// Android/desktop Chrome: keep the install prompt so the app can offer a clear "install" button.
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (route().name === 'more') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; status('StudyFlow הותקנה כאפליקציה.'); });

const $ = id => document.getElementById(id);
const KEY = 'studyflow-v2'; // storage key kept for continuity; the stored object carries its own schema version
const AI_KEY = 'studyflow-lumi-code';
const MOODLE_KEY = 'studyflow-moodle'; // {site, token, siteName, user}; never included in backups

// ---------- Storage ----------
let state = M.emptyState(), raw = null, locked = false, undoStack = [];
function storageError(s) { $('storage-error').hidden = false; $('storage-error').textContent = s; }
try {
  raw = localStorage.getItem(KEY);
  const legacy = localStorage.getItem('studyflow');
  if (raw) {
    const parsed = JSON.parse(raw);
    state = M.validate(parsed);
    if (parsed.version !== M.VERSION) {
      // Keep an untouched copy of the previous schema before the first upgraded write.
      if (!localStorage.getItem(KEY + '-pre-v3')) localStorage.setItem(KEY + '-pre-v3', raw);
      raw = JSON.stringify(state);
      localStorage.setItem(KEY, raw);
    }
  } else if (legacy) {
    state = M.migrate(JSON.parse(legacy));
    raw = JSON.stringify(state);
    localStorage.setItem(KEY, raw);
    queueMicrotask(() => status('הסיכומים, הקורסים והמשימות הועברו מהגרסה הקודמת. נתוני המקור נשמרו ללא שינוי.'));
  }
} catch {
  locked = true;
  storageError('לא ניתן לקרוא את האחסון. הנתונים לא הוחלפו והעריכה נעולה כדי למנוע אובדן. אפשר להוריד עותק מקורי במסך "עוד", או לייבא גיבוי תקין.');
}

function commit(change, { undo = true, recovery = false } = {}) {
  if (locked && !recovery) throw Error('העריכה נעולה עקב בעיית אחסון.');
  if (localStorage.getItem(KEY) !== raw) throw Error('הנתונים השתנו בחלון אחר. יש לרענן לפני שמירה.');
  let next = structuredClone(state);
  const result = change(next);
  if (result) next = result;
  next = M.validate(next);
  const text = JSON.stringify(next);
  if (new Blob([text]).size > 4_500_000) throw Error('האחסון המקומי מתקרב למגבלה. כדאי לייצא גיבוי ולהסיר קובץ גדול לפני הוספה.');
  try {
    if (locked && recovery && raw) localStorage.setItem(KEY + '-recovery', raw);
    localStorage.setItem(KEY, text);
  } catch { throw Error('השמירה נכשלה. כדאי לבדוק מקום פנוי והרשאות אחסון. השינוי לא נשמר.'); }
  if (undo) { undoStack.push(state); undoStack = undoStack.slice(-15); }
  state = next; raw = text;
  if (C.session()) { C.setSyncMeta({ ...C.syncMeta(), dirty: true }); scheduleSync(); }
  if (recovery) { locked = false; $('storage-error').hidden = true; }
  applySettings();
  return true;
}

// ---------- UI state ----------
const ui = {
  courseTab: 'all', search: '', planView: 'day', planDate: M.today(), week: 0, month: 0, period: 'week',
  lessonTab: 'slides', lessonNote: '', card: 0, focus: false,
  quiz: null, quizCourse: '', quizSeen: new Set(), revealed: false,
  chat: [], lumiBusy: false, lumiScope: '',
  ai: { configured: null, verified: false, reason: '' },
  speech: { noteId: null, playing: false, error: '' },
  voice: { on: false, heard: '', error: '' },
};
let session = null;
let toastTimer = 0;

function status(text, { undo = false } = {}) {
  const t = $('toast');
  $('status').textContent = text;
  t.classList.toggle('idle', !text);
  $('undo').hidden = !undo || !undoStack.length;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.add('idle'); $('undo').hidden = true; }, undo ? 9000 : 6000);
}
function act(fn) {
  try {
    const r = fn();
    if (r instanceof Promise) r.catch(report);
  } catch (e) { report(e); }
}
function report(e) {
  if ($('editor').open) $('form-error').textContent = e.message;
  else status(e.message);
}

function applySettings() {
  const s = state.settings, root = document.documentElement;
  root.style.setProperty('--font', s.font + 'px');
  root.dataset.theme = s.theme;
  root.classList.toggle('reduce-motion', s.motion === 'reduce');
  document.body.classList.toggle('high-contrast', s.contrast);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'light' ? '#eef1fb' : '#070b1a');
}

// ---------- Routing ----------
const TABS = [['home', 'בית', 'home'], ['courses', 'קורסים', 'book'], ['plan', 'תוכנית', 'calendar'], ['progress', 'התקדמות', 'chart'], ['more', 'עוד', 'more']];
const TAB_OF = { home: 'home', lumi: 'home', courses: 'courses', course: 'courses', lesson: 'courses', plan: 'plan', progress: 'progress', more: 'more', practice: 'more', print: 'courses' };
function route() {
  const [name, id = '', extra = ''] = decodeURIComponent(location.hash.slice(1)).split('/');
  return { name: TAB_OF[name] ? name : 'home', id, extra };
}
const TITLES = { home: 'בית', lumi: 'לומי', courses: 'הקורסים שלי', course: 'קורס', lesson: 'שיעור', plan: 'התוכנית שלי', progress: 'ההתקדמות שלי', more: 'עוד', practice: 'תרגול', print: 'הדפסה' };

function renderNav() {
  const current = TAB_OF[route().name];
  $('tabbar').innerHTML = `<ul>${TABS.map(([r, label, ic]) => `<li><a href="#${r}" ${r === current ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a></li>`).join('')}</ul>`;
}

function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.id) return { id: el.id };
  if (el.dataset?.action) return { action: el.dataset.action, id: el.dataset.id || '' };
  if (el.dataset?.setting) return { setting: el.dataset.setting, value: el.value };
  return null;
}
function restoreFocus(key) {
  if (!key) return;
  let el = null;
  if (key.id) el = document.getElementById(key.id);
  else if (key.action) el = [...document.querySelectorAll(`[data-action="${CSS.escape(key.action)}"]`)].find(x => (x.dataset.id || '') === key.id);
  else if (key.setting) el = [...document.querySelectorAll(`[data-setting="${CSS.escape(key.setting)}"]`)].find(x => x.type !== 'radio' || x.value === key.value);
  if (el && !el.disabled) el.focus({ preventScroll: true });
  else $('main').querySelector('h1')?.focus({ preventScroll: true });
}

function render(focus = false) {
  const key = focus ? null : focusKey(document.activeElement);
  const r = route();
  if (r.name === 'lesson') syncLesson(r);
  if (r.name !== 'lesson' && ui.focus) { ui.focus = false; document.body.classList.remove('focus-mode'); }
  document.title = `${TITLES[r.name]} · StudyFlow`;
  renderNav();
  const env = { bytes: new Blob([raw || '']).size, canUndo: undoStack.length > 0, moodle: moodleConn(), account: C.session(), sync: { ...C.syncMeta(), ...cloud }, push: { support: C.pushSupport(), on: Boolean(C.pushState()) }, install: installPrompt ? 'prompt' : (window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone) ? 'installed' : /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'other' };
  const view = {
    home: () => V.home(state, ui), lumi: () => V.lumiView(state, ui), courses: () => V.courses(state, ui),
    course: () => V.courseDetail(state, ui, r.id), lesson: () => V.lesson(state, ui, r.id), plan: () => V.plan(state, ui),
    progress: () => V.progress(state, ui), print: () => V.printView(state, ui, r.id), more: () => V.more(state, ui, env), practice: () => V.practice(state, ui),
  }[r.name];
  $('main').innerHTML = view();
  renderTimer();
  if (focus) { window.scrollTo(0, 0); $('main').querySelector('h1')?.focus(); }
  else restoreFocus(key);
}

function syncLesson(r) {
  const n = state.notes.find(x => x.id === r.id);
  if (!n) return;
  if (ui.lessonNote !== n.id) {
    ui.lessonNote = n.id; ui.lessonTab = 'slides'; ui.quiz = null;
    ui.card = r.extra !== '' && Number.isInteger(+r.extra) ? +r.extra : n.position;
    stopSpeech();
  }
  const count = M.noteCards(n).length;
  ui.card = Math.max(0, Math.min(ui.card, count - 1));
}

// ---------- Editor dialog ----------
function openEditor(title, fields, submit, { submitLabel = 'שמירה', after } = {}) {
  stopSpeech();
  $('editor-title').textContent = title;
  $('editor-fields').innerHTML = fields;
  $('form-error').textContent = '';
  $('editor-submit').textContent = submitLabel;
  $('editor-submit').hidden = !submit;
  $('editor-form').onsubmit = async e => {
    e.preventDefault();
    if (!submit) return;
    const form = e.currentTarget;
    const invalid = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    if (invalid) { $('form-error').textContent = (invalid.labels?.[0]?.textContent || 'שדה') + ': ' + invalid.validationMessage; invalid.focus(); return; }
    const b = $('editor-submit');
    b.disabled = true;
    try {
      const msg = await submit(new FormData(form));
      closeEditor();
      render();
      status(msg || 'נשמר במכשיר זה.', { undo: true });
    } catch (err) { $('form-error').textContent = err.message; }
    finally { b.disabled = false; }
  };
  if (!$('editor').open) $('editor').showModal();
  after?.();
  $('editor-fields').querySelector('input:not([type=hidden]),select,textarea')?.focus();
}
function closeEditor() { if ($('editor').open) $('editor').close(); }
const findIndex = (list, id, msg) => { const i = list.findIndex(x => x.id === id); if (i < 0) throw Error(msg); return i; };
function requireCourse() { if (!state.courses.length) throw Error('יש להוסיף קורס לפני יצירת תוכן.'); }

function editCourse(id) {
  const c = state.courses.find(x => x.id === id);
  openEditor(c ? 'עריכת קורס' : 'קורס חדש', V.courseFields(state, c), f => {
    const v = { id: c?.id || M.uid(), name: f.get('name').trim(), instructor: f.get('instructor').trim(), description: f.get('description').trim(), color: f.get('color') || 'blue', icon: f.get('icon') || 'book', archived: c?.archived || false, examDate: f.get('examDate') || '' };
    if (!v.name) throw Error('יש להזין שם לקורס.');
    commit(d => { if (c) d.courses[findIndex(d.courses, c.id, 'הקורס הוסר בחלון אחר.')] = v; else d.courses.push(v); });
    if (!c) location.hash = 'course/' + v.id;
    return c ? 'הקורס עודכן.' : 'הקורס נוצר.';
  });
}
function editNote(courseId, id, prefill = null) {
  requireCourse();
  const n = state.notes.find(x => x.id === id) || (prefill ? { courseId, title: prefill.title, text: prefill.text, kind: prefill.kind, isPrefill: true } : undefined);
  const existing = n && !n.isPrefill;
  openEditor(existing ? 'עריכת סיכום' : 'סיכום חדש', V.courseSelect(state, n?.courseId || courseId) +
    `<label for="f-title">כותרת</label><input id="f-title" name="title" required maxlength="200" value="${esc(n?.title)}">
    <label for="f-text">תוכן הסיכום</label><textarea id="f-text" name="text" rows="12" required maxlength="200000" aria-describedby="text-hint">${esc(n?.text)}</textarea>
    <p class="hint" id="text-hint">שורה שמתחילה ב-"# " פותחת כרטיס חדש במצגת. "- " יוצר נקודה, ו-**טקסט** מודגש.</p>
    <label for="note-import">או ייבוא מקובץ: מצגת PowerPoint, TXT או Markdown</label><input id="note-import" type="file" accept=".pptx,.txt,.md,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.presentationml.presentation">
    <p class="hint">ממצגת PowerPoint נלקחים הכותרות, הנקודות והערות המרצה - כל שקופית הופכת לכרטיס. תמונות וגרפים לא מיובאים.</p>
    <input type="hidden" name="kind" id="f-kind-note" value="${esc(n?.kind || 'summary')}">`,
  f => {
    const v = { id: (existing && n.id) || M.uid(), courseId: f.get('courseId'), title: f.get('title').trim(), text: f.get('text').trim(), updatedAt: new Date().toISOString(), position: existing && n.text === f.get('text').trim() ? n.position : 0, kind: ['summary', 'slides', 'podcast', 'import'].includes(f.get('kind')) ? f.get('kind') : 'summary' };
    if (!v.title || !v.text) throw Error('יש להזין כותרת ותוכן.');
    commit(d => {
      if (existing) {
        const i = findIndex(d.notes, n.id, 'הסיכום הוסר בחלון אחר.'), old = d.notes[i];
        v.versions = [...(old.versions || []), { title: old.title, text: old.text, updatedAt: old.updatedAt, source: 'manual' }].slice(-10);
        if (old.courseId !== v.courseId) d.reads = d.reads.filter(r => r.noteId !== n.id);
        d.notes[i] = v;
      } else d.notes.push(v);
    });
    if (!existing) location.hash = 'lesson/' + v.id;
    return existing ? 'הסיכום עודכן. הגרסה הקודמת נשמרה.' : 'הסיכום נשמר.';
  });
}
function editTerm(courseId, id) {
  requireCourse();
  const g = state.glossary.find(x => x.id === id);
  openEditor(g ? 'עריכת מושג' : 'מושג חדש', V.courseSelect(state, g?.courseId || courseId) +
    `<label for="f-term">המושג בעברית</label><input id="f-term" name="term" required maxlength="200" value="${esc(g?.term)}">
    <label for="f-original">המונח בשפת המקור (רשות)</label><input id="f-original" name="original" maxlength="200" dir="auto" value="${esc(g?.original)}">
    <label for="f-definition">הסבר ודוגמה</label><textarea id="f-definition" name="definition" required maxlength="5000" rows="5">${esc(g?.definition)}</textarea>`,
  f => {
    const v = { id: g?.id || M.uid(), courseId: f.get('courseId'), term: f.get('term').trim(), original: f.get('original').trim(), definition: f.get('definition').trim() };
    commit(d => { if (g) d.glossary[findIndex(d.glossary, g.id, 'המושג הוסר בחלון אחר.')] = v; else d.glossary.push(v); });
  });
}
function editTask(id, preset = {}) {
  requireCourse();
  const t = state.tasks.find(x => x.id === id);
  const kind = t?.kind || preset.kind || 'assignment';
  const kinds = [['assignment', 'מטלה / הגשה'], ['study', 'זמן למידה'], ['exam', 'מבחן'], ['break', 'הפסקה']];
  openEditor(t ? 'עריכה' : preset.kind === 'break' ? 'הפסקה חדשה' : 'משימה חדשה',
    `<label for="f-kind">סוג</label><select id="f-kind" name="kind">${kinds.map(([v, l]) => `<option value="${v}" ${v === kind ? 'selected' : ''}>${l}</option>`).join('')}</select>` +
    V.courseSelect(state, t?.courseId ?? preset.courseId ?? '', true) +
    `<p class="hint">"ללא קורס" אפשרי רק להפסקה.</p>
    <label for="f-title">שם</label><input id="f-title" name="title" required maxlength="200" value="${esc(t?.title ?? (preset.kind === 'break' ? 'הפסקה' : ''))}">
    <label for="f-planned">יום ביצוע (רשות)</label><input id="f-planned" name="planned" type="date" value="${esc(t?.planned ?? preset.planned ?? '')}">
    <label for="f-time">שעה (רשות)</label><input id="f-time" name="time" type="time" value="${esc(t?.time)}">
    <label for="f-date">מועד הגשה / מבחן (רשות)</label><input id="f-date" name="date" type="date" value="${esc(t?.date)}">
    <label for="f-minutes">זמן מתוכנן בדקות</label><input id="f-minutes" name="minutes" type="number" inputmode="numeric" required min="5" max="480" value="${t?.minutes || (preset.kind === 'break' ? 10 : state.settings.minutes)}">
    ${t ? `<div class="actions">${`<button type="button" class="danger" data-action="delete-task" data-id="${esc(t.id)}">${icon('trash')} מחיקה</button>`}</div>` : ''}`,
  f => {
    const v = { id: t?.id || M.uid(), kind: f.get('kind'), courseId: f.get('courseId'), title: f.get('title').trim(), planned: f.get('planned'), time: f.get('time'), date: f.get('date'), minutes: Number(f.get('minutes')), done: t?.done || false, doneAt: t?.doneAt || '' };
    if (!v.courseId && v.kind !== 'break') throw Error('יש לבחור קורס (רק הפסקה יכולה להיות ללא קורס).');
    commit(d => { if (t) d.tasks[findIndex(d.tasks, t.id, 'המשימה הוסרה בחלון אחר.')] = v; else d.tasks.push(v); });
    return t ? 'עודכן.' : 'נוסף לתוכנית.';
  });
}
function editQuestion(courseId, id) {
  requireCourse();
  const q = state.questions.find(x => x.id === id);
  openEditor(q ? 'עריכת שאלה' : 'שאלת חזרה חדשה', V.courseSelect(state, q?.courseId || courseId) +
    `<label for="f-prompt">שאלה</label><textarea id="f-prompt" name="prompt" required maxlength="2000" rows="3">${esc(q?.prompt)}</textarea>
    <label for="f-answer">תשובה</label><textarea id="f-answer" name="answer" required maxlength="5000" rows="5">${esc(q?.answer)}</textarea>`,
  f => {
    const v = { id: q?.id || M.uid(), courseId: f.get('courseId'), prompt: f.get('prompt').trim(), answer: f.get('answer').trim() };
    commit(d => { if (q) d.questions[findIndex(d.questions, q.id, 'השאלה הוסרה בחלון אחר.')] = v; else d.questions.push(v); });
  });
}
function readFile(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('לא ניתן לקרוא את הקובץ')); r.readAsDataURL(file); });
}
const FILE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];
function editMaterial(courseId) {
  requireCourse();
  openEditor('חומר לימוד חדש', V.courseSelect(state, courseId) +
    `<label for="f-title">כותרת</label><input id="f-title" name="title" required maxlength="200">
    <label for="f-url">קישור לאתר (רשות)</label><input id="f-url" name="url" type="url" inputmode="url" dir="ltr">
    <label for="f-file">או קובץ PDF, תמונה או TXT (עד 1 MB)</label><input id="f-file" name="file" type="file" accept="${FILE_TYPES.join(',')}">
    <p class="hint">הקובץ נשמר במכשיר ונכלל בגיבוי. אין עדיין חילוץ טקסט מ-PDF או מתמונות; כדי להקריא, מוסיפים סיכום טקסט.</p>`,
  async f => {
    const file = f.get('file'), url = f.get('url').trim();
    if (url && file?.size) throw Error('יש לבחור קישור או קובץ - לא את שניהם.');
    let v = { id: M.uid(), courseId: f.get('courseId'), title: f.get('title').trim() };
    if (url) { if (!M.validURL(url)) throw Error('יש להזין קישור שמתחיל ב-https:// או http://'); v = { ...v, kind: 'link', url }; }
    else {
      if (!file?.size) throw Error('יש לבחור קובץ או להזין קישור.');
      if (file.size > 1_000_000) throw Error('גודל הקובץ המרבי הוא 1 MB.');
      if (!FILE_TYPES.includes(file.type)) throw Error('סוג הקובץ אינו נתמך.');
      v = { ...v, kind: 'file', data: await readFile(file), filename: file.name.slice(0, 255) };
    }
    commit(d => { d.materials.push(v); });
  });
}
function noteVersions(id) {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  const src = { manual: 'עריכה ידנית', review: 'שינוי שאושר', ai: 'הצעת לומי שאושרה', restore: 'לפני שחזור' };
  openEditor('גרסאות קודמות - ' + n.title, `<p>נשמרות עד עשר גרסאות, והן נכללות בגיבוי. שחזור שומר גם את המצב הנוכחי כגרסה.</p>${(n.versions || []).slice().reverse().map((v, ri) => { const i = n.versions.length - 1 - ri; return `<article class="item"><h3>${esc(v.title)}</h3><p class="muted">${new Date(v.updatedAt).toLocaleString('he-IL')}${v.source ? ' · ' + (src[v.source] || '') : ''}</p><details><summary>הצגת התוכן</summary><p class="note-body">${esc(v.text)}</p></details><button type="button" data-restore-note="${esc(id)}" data-version="${i}">שחזור הגרסה הזו</button></article>`; }).join('') || '<p>אין עדיין גרסאות קודמות. הן נשמרות אחרי עריכה.</p>'}`, null);
}

// ---------- Review workflow (manual or AI proposals; never overwrites without approval) ----------
function reviewNote(id, proposed, source = 'review') {
  const n = state.notes.find(x => x.id === id);
  if (!n) return;
  openEditor(source === 'ai' ? 'הצעת השיפור של לומי' : 'הצעת שינויים לסיכום', V.reviewFields(n.text, proposed ?? n.text, source), f => {
    const text = f.get('proposed').trim();
    if (!text) throw Error('הגרסה המוצעת ריקה.');
    if (text === n.text) throw Error('אין שינויים לאישור.');
    commit(d => {
      const x = d.notes.find(y => y.id === id);
      if (!x) throw Error('הסיכום הוסר בחלון אחר.');
      if (x.text !== f.get('original')) throw Error('הסיכום השתנה מאז שההצעה נפתחה. יש לסגור ולפתוח מחדש.');
      x.versions = [...(x.versions || []), { title: x.title, text: x.text, updatedAt: x.updatedAt, source: f.get('source') === 'ai' ? 'ai' : 'review' }].slice(-10);
      x.text = text; x.updatedAt = new Date().toISOString(); x.position = 0;
    });
    return 'השינויים אושרו ונשמרו. הגרסה הקודמת זמינה בגרסאות.';
  }, { submitLabel: 'אישור ושמירת השינויים', after: refreshDiff });
}
function refreshDiff() {
  const ta = $('f-proposed'), out = $('diff');
  if (!ta || !out) return;
  const original = $('editor-form').elements.original.value;
  const parts = diffWords(original, ta.value), s = diffStats(parts);
  out.innerHTML = diffHTML(parts);
  $('diff-stats').textContent = s.added || s.removed ? `${s.added} מילים נוספו, ${s.removed} מילים נמחקו` : 'אין שינויים';
}

// ---------- Speech ----------
const sp = { chunks: [], i: 0, token: 0, cardId: '' };
function heVoice() {
  if (!('speechSynthesis' in window)) throw Error('הדפדפן אינו תומך בהקראה.');
  const voices = speechSynthesis.getVoices();
  const v = voices.find(x => /^he([-_]|$)/i.test(x.lang)) || voices.find(x => /^iw/i.test(x.lang));
  if (!v && voices.length) throw Error('לא נמצא קול עברי במכשיר. אפשר להתקין קול עברי בהגדרות הנגישות של המכשיר.');
  return v || null;
}
function stopSpeech() {
  sp.token++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  ui.speech.playing = false;
}
function currentLesson() {
  const n = state.notes.find(x => x.id === ui.lessonNote);
  return n ? { n, cards: M.noteCards(n) } : null;
}
function speakCard(resume = false) {
  const L = currentLesson();
  if (!L) return;
  const card = L.cards[ui.card];
  const voice = heVoice();
  if (!resume || sp.cardId !== card.id || sp.i >= sp.chunks.length) {
    sp.chunks = speechText(card).match(/[\s\S]{1,200}(?:[.!?,;:]\s|\s|$)|[\s\S]{1,200}/g) || [];
    sp.i = 0; sp.cardId = card.id;
  }
  sp.token++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const token = sp.token;
  ui.speech = { noteId: L.n.id, playing: true, error: '' };
  const next = () => {
    if (token !== sp.token) return;
    if (sp.i >= sp.chunks.length) return cardSpoken(token);
    const u = new SpeechSynthesisUtterance(sp.chunks[sp.i]);
    if (voice) u.voice = voice;
    u.lang = 'he-IL';
    u.rate = state.settings.speechRate;
    u.onend = () => { if (token === sp.token) { sp.i++; next(); } };
    u.onerror = e => {
      if (token !== sp.token || e.error === 'canceled' || e.error === 'interrupted') return;
      ui.speech.playing = false; ui.speech.error = 'ההקראה נעצרה (' + e.error + ')'; render();
    };
    speechSynthesis.speak(u);
  };
  next();
}
function cardSpoken(token) {
  const L = currentLesson();
  if (!L || token !== sp.token) return;
  markCard(L, ui.card);
  if (state.settings.continuous && ui.card < L.cards.length - 1) {
    setCard(ui.card + 1, { keepSpeech: true });
    speakCard();
    render();
    status(`כרטיס ${ui.card + 1} מתוך ${L.cards.length}`);
  } else {
    ui.speech.playing = false;
    render();
    status(ui.card === L.cards.length - 1 ? 'השיעור הוקרא עד הסוף.' : 'הכרטיס הוקרא וסומן כנקרא.');
  }
}
function markCard(L, i, read = true) {
  const card = L.cards[i];
  if (!card) return;
  const has = state.reads.some(r => r.noteId === L.n.id && r.card === card.id);
  if (read && !has) commit(d => M.markRead(d, L.n.id, card.id), { undo: false });
  if (!read && has) commit(d => { d.reads = d.reads.filter(r => !(r.noteId === L.n.id && r.card === card.id)); }, { undo: false });
}
function setCard(i, { keepSpeech = false } = {}) {
  const L = currentLesson();
  if (!L) return;
  if (!keepSpeech) stopSpeech();
  ui.card = Math.max(0, Math.min(i, L.cards.length - 1));
  if (L.n.position !== ui.card && !locked) commit(d => { const n = d.notes.find(x => x.id === L.n.id); if (n) n.position = ui.card; }, { undo: false });
  history.replaceState(null, '', `#lesson/${L.n.id}/${ui.card}`);
}

// ---------- Study timer ----------
function elapsed() { return session ? session.elapsed + (session.paused ? 0 : Math.max(0, (Date.now() - session.started) / 1000)) : 0; }
function startSession(courseId, minutes = state.settings.minutes) {
  if (!state.courses.some(c => c.id === courseId)) throw Error('יש לבחור קורס כדי לתעד זמן למידה.');
  if (session && !confirm('כבר פועל שעון. להתחיל מחדש בלי לשמור את הזמן הקודם?')) return false;
  session = { courseId, kind: 'study', started: Date.now(), elapsed: 0, target: Math.min(120, Math.max(5, minutes)) * 60, paused: false, notified: false };
  status('זמן הלמידה התחיל. בסיום נשמר רק הזמן שעבר בפועל.');
  renderTimer();
  return true;
}
function renderTimer() {
  const bar = $('timer-bar');
  if (!session) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  const name = state.courses.find(c => c.id === session.courseId)?.name || '';
  bar.innerHTML = `<span class="grow">${session.kind === 'break' ? 'הפסקה' : 'זמן למידה'} · ${esc(name)} · <span class="t" id="timer-value" role="timer"></span>${session.paused ? ' (מושהה)' : ''}</span>
    <button type="button" data-action="pause-timer">${session.paused ? 'המשך' : 'השהיה'}</button>
    <button type="button" class="primary" data-action="finish-session">${session.kind === 'break' ? 'סיום ההפסקה' : 'סיום ושמירה'}</button>
    <button type="button" class="ghost icon-btn" data-action="cancel-session" aria-label="ביטול השעון בלי לשמור">${icon('x')}</button>`;
  updateTimer();
}
function updateTimer() {
  if (!session) return;
  const left = Math.max(0, session.target - elapsed()), el = $('timer-value');
  if (el) el.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  if (left === 0 && !session.notified) {
    session.notified = true;
    status(session.kind === 'break' ? 'ההפסקה הסתיימה. אפשר לחזור ללמוד.' : 'הזמן שתוכנן הסתיים. "סיום ושמירה" יתעד את הזמן.');
  }
}
setInterval(updateTimer, 1000);

// ---------- Lumi client ----------
const AI_ERRORS = { not_configured: 'השרת לא הוגדר עם ספק AI.', unauthorized: 'קוד הגישה שגוי.', rate_limited: 'יותר מדי בקשות. כדאי לנסות שוב בעוד כמה דקות.', provider_busy: 'שירות ה-AI עמוס כרגע. כדאי לנסות שוב.', provider_error: 'שירות ה-AI החזיר שגיאה.', provider_unreachable: 'לא ניתן להגיע לשירות ה-AI.', invalid_request: 'הבקשה לא תקינה (ייתכן שהטקסט ארוך מדי).', too_large: 'הטקסט ארוך מדי לשליחה.', bad_format: 'התשובה של ה-AI לא הייתה בפורמט הצפוי.', empty_response: 'התקבלה תשובה ריקה.' };
const aiCode = () => { try { return localStorage.getItem(AI_KEY) || ''; } catch { return ''; } };
async function callLumi(body, code = aiCode()) {
  if (!navigator.onLine) throw Error('אין חיבור לרשת. לומי AI זמין רק כשיש אינטרנט.');
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 125_000);
  let r;
  try {
    r = await fetch('/api/lumi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, code, address: state.settings.address }), signal: ctrl.signal });
  } catch { throw Error('לא ניתן להגיע לשרת של לומי.'); } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { ui.ai.verified = false; try { localStorage.removeItem(AI_KEY); } catch {} }
  if (!r.ok) throw Error((AI_ERRORS[j.error] || 'לומי לא הצליח לענות כרגע.') + (j.upstream ? ` (קוד ${j.upstream}${j.detail ? ': ' + j.detail : ''})` : ''));
  return j;
}
async function aiInit() {
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('/api/lumi', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok || !/json/.test(r.headers.get('content-type') || '')) throw Error();
    const info = await r.json();
    ui.ai.configured = Boolean(info.configured);
    ui.ai.provider = info.provider === 'gemini' ? 'Gemini' : info.provider === 'anthropic' ? 'Claude' : '';
    if (ui.ai.configured && aiCode()) {
      try { await callLumi({ mode: 'ping' }); ui.ai.verified = true; } catch { ui.ai.verified = false; }
    }
  } catch {
    ui.ai.configured = false;
    ui.ai.reason = navigator.onLine ? 'שרת ה-AI לא נמצא בכתובת הזו.' : 'אין כרגע חיבור לרשת.';
  }
  if (['more', 'lumi', 'home', 'lesson'].includes(route().name) && !$('editor').open) render();
}
function lumiDocs() {
  const active = new Set(state.courses.filter(c => !c.archived && (!ui.lumiScope || c.id === ui.lumiScope)).map(c => c.id));
  return state.notes.filter(n => active.has(n.courseId)).map(n => ({ noteId: n.id, courseId: n.courseId, label: `${state.courses.find(c => c.id === n.courseId).name} · ${n.title}`, cards: M.noteCards(n) }));
}
async function sendChat(text) {
  ui.chat.push({ mine: true, text });
  if (!ui.ai.verified) {
    ui.chat.push({ mine: false, local: true, text: M.lumiReply(state, text) });
    ui.chat = ui.chat.slice(-40);
    render();
    $('message')?.focus();
    return;
  }
  ui.lumiBusy = true;
  render();
  const lastUser = ui.chat.filter(m => m.mine).slice(-3).map(m => m.text).join(' ');
  const sources = retrieve(lastUser, lumiDocs(), 6);
  const messages = ui.chat.filter(m => !m.error && !m.local).slice(-10).map(m => ({ role: m.mine ? 'user' : 'assistant', text: m.text.slice(0, 4000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  try {
    const j = await callLumi({ mode: 'chat', messages, sources: sources.map(s => ({ label: s.label, text: s.text.slice(0, 3000) })) });
    ui.chat.push({ mine: false, text: j.text, sources });
  } catch (e) {
    ui.chat.push({ mine: false, error: true, text: e.message });
  } finally {
    ui.lumiBusy = false;
    ui.chat = ui.chat.slice(-40);
    render();
    $('message')?.focus();
  }
}

// ---------- Quiz ----------
function startQuiz(courseId = '') {
  const pool = state.questions.filter(q => !courseId || q.courseId === courseId);
  if (!pool.length) throw Error('אין עדיין שאלות חזרה.');
  ui.quizCourse = courseId; ui.quizSeen = new Set(); ui.quiz = null;
  ui.quizAll = !M.reviewQueue(state, courseId).length;
  nextQuestion();
  if (ui.quizAll && ui.quiz) status('אין שאלות שמועד החזרה שלהן הגיע, אז מתרגלים את כל השאלות.');
}
function nextQuestion() {
  const pool = ui.quizAll ? state.questions.filter(q => !ui.quizCourse || q.courseId === ui.quizCourse) : M.reviewQueue(state, ui.quizCourse);
  const q = pool.find(x => !ui.quizSeen.has(x.id));
  ui.quiz = q ? { id: q.id, n: ui.quizSeen.size + 1 } : null;
  ui.revealed = false;
}
function grade(correct) {
  if (!ui.quiz || !ui.revealed) return;
  const id = ui.quiz.id;
  commit(d => { d.reviews.push({ id: M.uid(), questionId: id, correct, date: M.today() }); }, { undo: false });
  ui.quizSeen.add(id);
  nextQuestion();
  render();
  status(ui.quiz ? 'הדירוג נשמר. הנה השאלה הבאה.' : 'הסבב הסתיים והדירוגים נשמרו.');
  document.getElementById('quiz-q')?.focus?.();
}

// ---------- Files ----------
function download(data, name, type = 'application/json') {
  const u = URL.createObjectURL(new Blob([data], { type })), a = document.createElement('a');
  a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function exportBackup() {
  if (locked) throw Error('האחסון נעול. אפשר להשתמש ב"הורדת נתוני המקור".');
  download(JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2), 'studyflow-backup-' + M.today() + '.json');
  status('הגיבוי הוכן להורדה. כדאי לוודא שהקובץ נשמר.');
}
async function importBackup(file) {
  if (!file) return;
  if (file.size > 6_000_000) throw Error('גודל הגיבוי המרבי הוא 6 MB.');
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { throw Error('הקובץ אינו גיבוי JSON תקין.'); }
  const next = parsed?.version ? M.validate(parsed) : M.migrate(parsed);
  if (!confirm(`הגיבוי תקין ומכיל ${next.courses.length} קורסים, ${next.notes.length} סיכומים ו-${next.tasks.length} משימות. הייבוא יחליף את כל הנתונים במכשיר. מומלץ לייצא גיבוי קודם. להמשיך?`)) return;
  commit(() => next, { undo: !locked, recovery: true });
  session = null; ui.quiz = null; ui.lessonNote = '';
  render(true);
  status('הגיבוי נבדק ויובא בהצלחה.', { undo: true });
}
function deleteItem(key, id, title) {
  if (!confirm(`למחוק את ${title}? אפשר לבטל מיד אחרי המחיקה, או לשחזר מגיבוי.`)) return;
  commit(d => {
    if (key === 'notes') return M.removeNote(d, id);
    d[key] = d[key].filter(x => x.id !== id);
    if (key === 'questions') d.reviews = d.reviews.filter(r => r.questionId !== id);
  });
  closeEditor();
  if (key === 'notes' && route().name === 'lesson') history.back();
  render();
  status('נמחק.', { undo: true });
}

// ---------- Actions ----------
const actions = {
  go: h => { location.hash = h.replace(/^#/, ''); },
  'edit-course': id => editCourse(id),
  'archive-course': id => {
    const c = state.courses.find(x => x.id === id);
    commit(d => { const x = d.courses.find(y => y.id === id); if (x) x.archived = !x.archived; });
    render(); status(c.archived ? 'הקורס הוחזר מהארכיון.' : 'הקורס הועבר לארכיון. הנתונים נשמרו.', { undo: true });
  },
  'delete-course': id => {
    const c = state.courses.find(x => x.id === id);
    if (!c || !confirm(`למחוק את הקורס "${c.name}" ואת כל הסיכומים, החומרים, המשימות, השאלות וההיסטוריה שלו?`)) return;
    commit(d => M.removeCourse(d, id));
    if (session?.courseId === id) session = null;
    location.hash = 'courses';
    status('הקורס נמחק.', { undo: true });
  },
  'edit-note': id => editNote(id),
  'edit-note-existing': id => editNote('', id),
  'note-versions': noteVersions,
  'delete-note': id => deleteItem('notes', id, 'הסיכום'),
  'review-note': id => reviewNote(id),
  'refresh-diff': refreshDiff,
  'edit-term': id => editTerm(id), 'edit-term-existing': id => editTerm('', id), 'delete-term': id => deleteItem('glossary', id, 'המושג'),
  'edit-material': id => editMaterial(id), 'delete-material': id => deleteItem('materials', id, 'חומר הלימוד'),
  'open-material': id => {
    const m = state.materials.find(x => x.id === id);
    if (!m) return;
    if (m.kind === 'link') { if (!M.validURL(m.url)) throw Error('הקישור אינו תקין.'); window.open(m.url, '_blank', 'noopener,noreferrer'); }
    else { const f = M.attachmentBytes(m.data); download(f.bytes, m.filename || m.title, f.type); }
  },
  'edit-task': id => editTask(id),
  'new-task-course': id => editTask('', { courseId: id }),
  'task-on-date': d => editTask('', { planned: d || '' }),
  'break-on-date': d => editTask('', { planned: d, kind: 'break' }),
  'delete-task': id => deleteItem('tasks', id, 'המשימה'),
  'toggle-task': id => {
    commit(d => { const t = d.tasks.find(x => x.id === id); if (t) { t.done = !t.done; t.doneAt = t.done ? M.today() : ''; } });
    const t = state.tasks.find(x => x.id === id);
    render(); status(t?.done ? `"${t.title}" סומנה כבוצעה.` : 'הסימון בוטל.', { undo: true });
  },
  'plan-here': id => { commit(d => { const t = d.tasks.find(x => x.id === id); if (t) t.planned = ui.planDate; }); render(); status('שובץ ליום הזה.', { undo: true }); },
  'edit-question': id => editQuestion(id), 'edit-question-existing': id => editQuestion('', id), 'delete-question': id => deleteItem('questions', id, 'השאלה'),
  'start-quiz': id => {
    startQuiz(id || '');
    const r = route().name;
    if (r !== 'lesson' && r !== 'practice') location.hash = 'practice'; else render();
    setTimeout(() => document.getElementById('quiz-q')?.closest('section')?.querySelector('[data-action="reveal"]')?.focus(), 0);
  },
  reveal: () => { ui.revealed = true; render(); document.querySelector('[data-action="grade-correct"]')?.focus(); },
  'grade-correct': () => grade(true), 'grade-wrong': () => grade(false),
  'end-quiz': () => { ui.quiz = null; render(); status('התרגול הסתיים.'); },
  'course-tab': v => { ui.courseTab = v; render(); },
  'plan-view': v => { ui.planView = v; render(); },
  'day-prev': () => { ui.planDate = shiftDate(ui.planDate, -1); render(); },
  'day-next': () => { ui.planDate = shiftDate(ui.planDate, 1); render(); },
  'day-today': () => { ui.planDate = M.today(); render(); },
  'week-prev': () => { ui.week--; render(); }, 'week-next': () => { ui.week++; render(); }, 'week-now': () => { ui.week = 0; render(); },
  'month-prev': () => { ui.month--; render(); }, 'month-next': () => { ui.month++; render(); },
  'pick-day': d => { ui.planDate = d; ui.planView = 'day'; render(); $('main').querySelector('h2')?.setAttribute('tabindex', '-1'); $('main').querySelector('h2')?.focus(); },
  period: v => { ui.period = v; render(); },
  'lesson-tab': v => { stopSpeech(); ui.lessonTab = v; render(); },
  'card-prev': () => { setCard(ui.card - 1); render(); },
  'card-next': () => { const L = currentLesson(); if (!L) return; markCard(L, ui.card); setCard(ui.card + 1); render(); },
  'card-finish': () => { const L = currentLesson(); if (!L) return; markCard(L, ui.card); render(); status('כל הכבוד! הכרטיס האחרון סומן כנקרא.'); },
  'toggle-read': () => { const L = currentLesson(); if (!L) return; const card = L.cards[ui.card]; const has = state.reads.some(r => r.noteId === L.n.id && r.card === card.id); markCard(L, ui.card, !has); render(); status(has ? 'הכרטיס סומן כלא נקרא.' : 'הכרטיס סומן כנקרא.'); },
  'speech-play': () => { try { speakCard(true); } catch (e) { ui.speech.error = e.message; render(); throw e; } render(); },
  'speech-pause': () => { stopSpeech(); render(); status('ההקראה הושהתה.'); },
  'speech-rate': () => {
    const rates = [0.75, 0.9, 1, 1.25, 1.5], cur = rates.indexOf(state.settings.speechRate), next = rates[(cur + 1) % rates.length];
    commit(d => { d.settings.speechRate = next; }, { undo: false });
    if (ui.speech.playing) speakCard(true);
    render(); status(`מהירות ההקראה: ${next}`);
  },
  'focus-mode': () => { ui.focus = !ui.focus; document.body.classList.toggle('focus-mode', ui.focus); render(); status(ui.focus ? 'מצב מיקוד: רק הכרטיס וההקראה מוצגים.' : 'יציאה ממצב מיקוד.'); },
  'start-session': id => { if (startSession(id)) render(); },
  'start-reco': () => {
    const rec = M.recommend(state);
    if (!rec) return;
    if (rec.courseId) startSession(rec.courseId, rec.minutes);
    if (rec.type === 'lesson') location.hash = 'lesson/' + rec.id;
    else if (rec.type === 'review') { startQuiz(rec.courseId); location.hash = 'practice'; }
    else location.hash = rec.courseId ? 'course/' + rec.courseId : 'plan';
  },
  'pause-timer': () => { if (!session) return; session.elapsed = elapsed(); session.started = Date.now(); session.paused = !session.paused; renderTimer(); },
  'cancel-session': () => { if (confirm('לבטל את השעון בלי לתעד זמן?')) { session = null; renderTimer(); status('השעון בוטל.'); } },
  'finish-session': () => {
    if (!session) return;
    if (session.kind === 'study') {
      const mins = Math.min(elapsed(), session.target) / 60;
      if (mins < 0.01) throw Error('עוד לא עברה דקה של למידה לתיעוד.');
      const cid = session.courseId;
      commit(d => { d.sessions.push({ id: M.uid(), courseId: cid, minutes: Math.round(mins * 100) / 100, date: M.today() }); });
      session = { courseId: cid, kind: 'break', started: Date.now(), elapsed: 0, target: 300, paused: false, notified: false };
      status(`נשמרו ${M.formatMinutes(mins)} למידה. מתחילה הפסקה של 5 דקות.`, { undo: true });
    } else { session = null; status('ההפסקה הסתיימה.'); }
    render();
  },
  'lumi-chip': q => sendChat(q),
  'ai-forget': () => { try { localStorage.removeItem(AI_KEY); } catch {} ui.ai.verified = false; render(); status('לומי AI נותק במכשיר הזה.'); },
  'ai-improve': async id => {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    if (n.text.length > 30000) throw Error('הסיכום ארוך מדי לשיפור אוטומטי (עד 30,000 תווים).');
    status('לומי מכין הצעה… זה יכול לקחת כחצי דקה.');
    const j = await callLumi({ mode: 'improve', title: n.title, text: n.text });
    reviewNote(id, j.text, 'ai');
    status('ההצעה מוכנה לבדיקה. שום דבר לא נשמר עדיין.');
  },
  'ai-questions': async id => {
    const L = currentLesson();
    if (!L || L.n.id !== id) return;
    const sources = L.cards.slice(ui.card, ui.card + 3).map(c => ({ label: `${L.n.title} · כרטיס ${c.index + 1}`, text: ((c.title ? c.title + '\n' : '') + c.body).slice(0, 3000) }));
    status('לומי מנסח שאלות מהכרטיס…');
    const j = await callLumi({ mode: 'questions', sources });
    openEditor('שאלות שלומי הציע', `<p>אלה הצעות בלבד. מסמנים את השאלות שרוצים להוסיף למאגר, ואפשר לערוך אותן אחר כך.</p>${j.questions.map((q, i) => `<div class="item"><label class="check"><input type="checkbox" name="pick" value="${i}" checked> ${esc(q.prompt)}</label><p class="muted">תשובה: ${esc(q.answer)}</p></div>`).join('')}`, f => {
      const picks = f.getAll('pick').map(Number);
      if (!picks.length) throw Error('לא נבחרו שאלות.');
      commit(d => { for (const i of picks) d.questions.push({ id: M.uid(), courseId: L.n.courseId, prompt: j.questions[i].prompt, answer: j.questions[i].answer }); });
      return `${picks.length} שאלות נוספו למאגר.`;
    }, { submitLabel: 'הוספת השאלות שנבחרו' });
  },
  'font-step': n => { const v = Math.max(18, Math.min(40, state.settings.font + Number(n))); commit(d => { d.settings.font = v; }, { undo: false }); render(); status(`גודל טקסט: ${v}`); },
  'test-voice': () => {
    const v = heVoice();
    const u = new SpeechSynthesisUtterance('שלום, זה הקול שיקריא לך את השיעורים.');
    u.lang = 'he-IL'; if (v) u.voice = v; u.rate = state.settings.speechRate;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
    status(v ? `קול: ${v.name}` : 'מנסה להקריא בעברית עם קול ברירת המחדל.');
  },
  'weekly-report': () => download(M.weeklyReport(state), 'studyflow-week-' + M.today() + '.txt', 'text/plain;charset=utf-8'),
  'export-pptx': async id => {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    status('מכין קובץ PowerPoint…');
    await exportPptx(n);
  },
  print: () => window.print(),
  'ai-slides': async id => {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    status('לומי בונה מצגת מהסיכום…');
    const j = await callLumi({ mode: 'slides', title: n.title, text: n.text.slice(0, 30000) });
    const v = { id: M.uid(), courseId: n.courseId, title: ('מצגת: ' + n.title).slice(0, 200), text: M.slidesToMarkdown(j.slides), updatedAt: new Date().toISOString(), position: 0, kind: 'slides' };
    commit(d => { d.notes.push(v); });
    location.hash = 'lesson/' + v.id;
    status(`נוצרה מצגת של ${j.slides.length} שקופיות. אפשר לערוך אותה או לייצא ל-PowerPoint.`, { undo: true });
  },
  'ai-summary': async id => {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    status('לומי כותב סיכום מסודר… זה יכול לקחת עד דקה.');
    const j = await callLumi({ mode: 'summary', title: n.title, text: n.text.slice(0, 30000) });
    const v = { id: M.uid(), courseId: n.courseId, title: ('סיכום: ' + n.title.replace(/^(מצגת|פודקאסט|סיכום): /, '')).slice(0, 200), text: j.text.slice(0, 200000), updatedAt: new Date().toISOString(), position: 0, kind: 'summary' };
    commit(d => { d.notes.push(v); });
    location.hash = 'lesson/' + v.id;
    status('הסיכום מוכן ונשמר כשיעור חדש. כדאי לעבור עליו ולתקן אם צריך.', { undo: true });
  },
  'ai-podcast': async id => {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    status('לומי כותב פרק פודקאסט… זה יכול לקחת כחצי דקה.');
    const j = await callLumi({ mode: 'podcast', title: n.title, text: n.text.slice(0, 30000) });
    const v = { id: M.uid(), courseId: n.courseId, title: ('פודקאסט: ' + n.title).slice(0, 200), text: j.text.slice(0, 200000), updatedAt: new Date().toISOString(), position: 0, kind: 'podcast' };
    commit(d => { d.notes.push(v); d.settings.continuous = true; });
    location.hash = 'lesson/' + v.id;
    status('הפודקאסט מוכן. לוחצים על הקראה; האזנה רציפה הופעלה.', { undo: true });
  },
  'voice-toggle': () => toggleVoice(),
  'moodle-connect': () => moodleConnect(),
  'moodle-sync': () => moodleSync(),
  'moodle-forget': () => { if (!confirm('לנתק את Moodle מהדפדפן הזה? הקורסים והמשימות שיובאו נשארים.')) return; try { localStorage.removeItem(MOODLE_KEY); } catch {} render(); status('Moodle נותק.'); },
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const r = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    render();
    status(r?.outcome === 'accepted' ? 'מתקין את StudyFlow…' : 'ההתקנה בוטלה.');
  },
  login: () => C.startGoogleAuth('login', [], '#more'),
  logout: () => {
    if (!confirm('להתנתק מהחשבון במכשיר הזה? הנתונים נשארים במכשיר ובענן.')) return;
    C.disablePush().catch(() => {}); C.signOut(); render(); status('התנתקת. הנתונים נשארו במכשיר ובענן.');
  },
  'sync-now': () => syncNow({ interactive: true }),
  'drive-import': async id => {
    const token = C.accessToken(C.SCOPES.drive);
    if (!token) { C.startGoogleAuth('drive', [C.SCOPES.drive], location.hash, { action: 'drive-import', id }); return; }
    await drivePicker(token, id);
  },
  'calendar-sync': async () => {
    const token = C.accessToken(C.SCOPES.calendar);
    if (!token) { C.startGoogleAuth('calendar', [C.SCOPES.calendar], '#more', { action: 'calendar-sync' }); return; }
    status('מסנכרן ל-Google Calendar…');
    const r = await C.calendarSync(token, state);
    status(`היומן עודכן: ${r.created} נוספו, ${r.updated} עודכנו, ${r.removed} הוסרו (${r.total} אירועים של StudyFlow).`);
  },
  'push-enable': async () => {
    if (!C.session()) throw Error('צריך להתחבר עם Google ולהפעיל סנכרון, כי התזכורת נשלחת מהשרת לפי הנתונים בענן.');
    await C.enablePush(); render(); status('תזכורת הבוקר הופעלה במכשיר הזה.');
  },
  'push-disable': async () => { await C.disablePush(); render(); status('התזכורות כבויות במכשיר הזה.'); },
  'push-test': async () => { await syncNow({}); const n = await C.testPush(); status(n ? 'נשלחה התראת בדיקה. היא אמורה להופיע בעוד כמה שניות.' : 'ההתראה לא נשלחה.'); },
  'export-ics': () => { download(M.toICS(state), 'studyflow-' + M.today() + '.ics', 'text/calendar;charset=utf-8'); status('קובץ היומן מוכן. פותחים אותו כדי להוסיף את המועדים ליומן.'); },
  export: exportBackup,
  'export-raw': () => { const get = k => { try { return localStorage.getItem(k); } catch { return null; } }; download(JSON.stringify({ current: get(KEY), previousSchema: get(KEY + '-pre-v3'), legacy: get('studyflow'), recovery: get(KEY + '-recovery') }, null, 2), 'studyflow-original-data.json'); status('עותק נתוני המקור הוכן להורדה.'); },
  persist: async () => { try { const ok = await navigator.storage?.persist?.(); status(ok ? 'הדפדפן אישר אחסון מתמשך. עדיין מומלץ לגבות.' : 'אחסון מתמשך לא אושר או אינו נתמך. מומלץ לייצא גיבוי.'); } catch { status('לא ניתן לבקש אחסון מתמשך. מומלץ לייצא גיבוי.'); } },
  undo: () => undo(),
  'delete-all': () => {
    if (!confirm('למחוק את כל הנתונים מהמכשיר: קורסים, סיכומים, קבצים, משימות והתקדמות? מומלץ לייצא גיבוי קודם.')) return;
    if (!confirm('אישור אחרון: המחיקה סופית ולא ניתן לבטל אותה.' + (C.session() ? ' גם העותק בענן יימחק, והחשבון ינותק מהמכשיר.' : ''))) return;
    if (C.session()) { C.deleteCloud().catch(() => {}); C.disablePush().catch(() => {}); C.signOut(); }
    for (const k of [KEY, KEY + '-pre-v3', KEY + '-recovery', 'studyflow', AI_KEY, MOODLE_KEY]) try { localStorage.removeItem(k); } catch {}
    state = M.emptyState(); raw = null; locked = false; undoStack = []; session = null; ui.chat = []; ui.quiz = null; ui.ai.verified = false;
    $('storage-error').hidden = true;
    applySettings(); location.hash = 'home'; render(true);
    status('כל הנתונים נמחקו מהמכשיר.');
  },
};
function shiftDate(date, n) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); return M.today(d); }
function undo() {
  if (!undoStack.length) return;
  const prev = undoStack.at(-1);
  commit(() => prev, { undo: false });
  undoStack.pop();
  ui.quiz = null;
  render();
  status('השינוי האחרון בוטל.');
}

// ---------- PowerPoint export (vendored pptxgenjs, loaded only when needed) ----------
function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.PptxGenJS) return res();
    const sc = document.createElement('script');
    sc.src = src; sc.onload = res; sc.onerror = () => rej(Error('לא ניתן לטעון את רכיב הייצוא. צריך חיבור לרשת.'));
    document.head.append(sc);
  });
}
async function exportPptx(n) {
  await loadScript('/vendor/pptxgen.bundle.js');
  const pptx = new window.PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.rtlMode = true;
  pptx.title = n.title;
  const courseName = state.courses.find(c => c.id === n.courseId)?.name || '';
  const font = 'Arial';
  const cover = pptx.addSlide();
  cover.background = { color: '0B1233' };
  cover.addText(n.title, { x: 0.6, y: 2.2, w: 12.1, h: 1.4, fontFace: font, fontSize: 40, bold: true, color: 'FFFFFF', align: 'right', rtlMode: true });
  cover.addText(courseName, { x: 0.6, y: 3.7, w: 12.1, h: 0.8, fontFace: font, fontSize: 22, color: 'B9C3E3', align: 'right', rtlMode: true });
  for (const card of M.noteCards(n)) {
    const sl = pptx.addSlide();
    sl.background = { color: 'FFFFFF' };
    sl.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: '7B93FF' } });
    sl.addText(card.title || n.title, { x: 0.6, y: 0.4, w: 12.1, h: 1, fontFace: font, fontSize: 30, bold: true, color: '0B1330', align: 'right', rtlMode: true });
    const lines = card.body.split('\n').filter(l => l.trim());
    const notes = [];
    const runs = [];
    for (const l of lines) {
      if (/^הערות המרצה:/.test(l)) { notes.push(l.replace(/^הערות המרצה:\s*/, '')); continue; }
      const m = /^(\s*)[-*•]\s+(.*)$/.exec(l);
      const text = (m ? m[2] : l).replace(/\*\*/g, '');
      runs.push({ text, options: { bullet: !!m, indentLevel: m ? Math.min(2, Math.floor(m[1].length / 2)) : 0, breakLine: true } });
    }
    if (runs.length) sl.addText(runs, { x: 0.6, y: 1.5, w: 12.1, h: 5.6, fontFace: font, fontSize: runs.length > 7 ? 18 : 22, color: '1A2240', align: 'right', valign: 'top', rtlMode: true, paraSpaceAfter: 8 });
    if (notes.length) sl.addNotes(notes.join('\n'));
  }
  const blob = await pptx.write({ outputType: 'blob' });
  download(blob, (n.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'studyflow') + '.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  status('קובץ PowerPoint מוכן להורדה.');
}

// ---------- Voice commands (Web Speech recognition, Hebrew) ----------
let rec = null;
const VOICE = [
  [/הבא|קדימה|הלאה/, 'card-next'], [/הקודם|אחורה|חזור/, 'card-prev'], [/עצור|השהה|הפסק|שקט/, 'speech-pause'],
  [/הקרא|נגן|המשך|תקריא/, 'speech-play'], [/סמן|נקרא/, 'toggle-read'], [/מהר/, 'faster'], [/לאט/, 'slower'], [/סיום|סגור|די/, 'voice-stop'],
];
function stopVoice() { if (rec) { ui.voice.on = false; try { rec.stop(); } catch {} rec = null; } }
function toggleVoice() {
  if (ui.voice.on) { stopVoice(); render(); status('הפקודות הקוליות כבויות.'); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { ui.voice.error = 'הדפדפן הזה לא תומך בזיהוי דיבור. בכרום ובספארי העדכניים זה זמין.'; render(); return; }
  rec = new SR();
  rec.lang = 'he-IL'; rec.continuous = true; rec.interimResults = false;
  rec.onresult = e => {
    const said = e.results[e.results.length - 1][0].transcript.trim();
    ui.voice.heard = said;
    const hit = VOICE.find(([re]) => re.test(said));
    if (!hit) { render(); return; }
    const cmd = hit[1];
    act(() => {
      if (cmd === 'voice-stop') { stopVoice(); render(); status('הפקודות הקוליות כבויות.'); return; }
      if (cmd === 'faster' || cmd === 'slower') {
        const rates = [0.75, 0.9, 1, 1.25, 1.5], i = rates.indexOf(state.settings.speechRate);
        const v = rates[Math.max(0, Math.min(rates.length - 1, (i < 0 ? 2 : i) + (cmd === 'faster' ? 1 : -1)))];
        commit(d => { d.settings.speechRate = v; }, { undo: false });
        if (ui.speech.playing) speakCard(true);
        render(); status(`מהירות ${v}`); return;
      }
      actions[cmd]();
    });
  };
  rec.onerror = e => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    ui.voice.error = e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אפשר לאשר בהגדרות האתר.' : 'זיהוי הדיבור נעצר (' + e.error + ').';
    stopVoice(); render();
  };
  rec.onend = () => { if (ui.voice.on && rec) { try { rec.start(); } catch {} } };
  try { rec.start(); } catch { ui.voice.error = 'לא ניתן להפעיל את המיקרופון.'; render(); return; }
  ui.voice = { on: true, heard: '', error: '' };
  render();
  status('מקשיב לפקודות קוליות.');
}

// ---------- Moodle ----------
function moodleConn() { try { return JSON.parse(localStorage.getItem(MOODLE_KEY) || 'null'); } catch { return null; } }
const MOODLE_ERRORS = { bad_site: 'הכתובת לא תקינה. צריך כתובת https של אתר ה-Moodle, למשל https://moodle.example.ac.il', unreachable: 'לא הצלחתי להגיע לאתר. כדאי לבדוק את הכתובת.', redirected: 'האתר הפנה לכתובת אחרת. כדאי להזין את הכתובת הסופית של ה-Moodle.', not_moodle: 'הכתובת לא נראית כמו אתר Moodle, או שהשירות לנייד חסום.', login_failed: 'שם המשתמש או הסיסמה שגויים. אם המוסד נכנס דרך Google או Microsoft, צריך להשתמש במפתח (token).', service_disabled: 'המוסד לא מאפשר חיבור מאפליקציות. אפשר לנסות עם מפתח (token).', invalid_token: 'מפתח הגישה ל-Moodle לא תקף יותר. צריך להתחבר מחדש.', rate_limited: 'יותר מדי ניסיונות. כדאי לנסות שוב בעוד כמה דקות.', moodle_error: 'Moodle החזיר שגיאה.' };
async function moodleCall(body) {
  if (!navigator.onLine) throw Error('אין חיבור לרשת.');
  let r;
  try { r = await fetch('/api/moodle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch { throw Error('לא ניתן להגיע לשרת.'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && j.error === 'invalid_token') { try { localStorage.removeItem(MOODLE_KEY); } catch {} }
  if (!r.ok) throw Error((MOODLE_ERRORS[j.error] || 'החיבור ל-Moodle נכשל.') + (j.message ? ` (${j.message})` : ''));
  return j;
}
function moodleConnect() {
  openEditor('חיבור ל-Moodle', `<p>מזינים את כתובת ה-Moodle של המוסד ואת פרטי הכניסה. הסיסמה נשלחת פעם אחת ל-Moodle דרך השרת כדי לקבל מפתח גישה, ולא נשמרת בשום מקום.</p>
    <label for="m-site">כתובת האתר</label><input id="m-site" name="site" type="url" inputmode="url" dir="ltr" required placeholder="https://moodle.example.ac.il" maxlength="300">
    <label for="m-user">שם משתמש</label><input id="m-user" name="username" autocomplete="username" dir="ltr" maxlength="200">
    <label for="m-pass">סיסמה</label><input id="m-pass" name="password" type="password" autocomplete="current-password" maxlength="300">
    <details><summary>המוסד נכנס דרך Google / Microsoft? אפשר מפתח (token)</summary><p class="hint">ב-Moodle: תפריט המשתמש > העדפות > מפתחות אבטחה (Security keys) > מעתיקים את המפתח של "Moodle mobile web service". לא בכל מוסד זה זמין.</p><label for="m-token">מפתח גישה (token)</label><input id="m-token" name="token" dir="ltr" autocomplete="off" maxlength="200"></details>`,
  async f => {
    const site = f.get('site').trim(), token = f.get('token').trim();
    let conn;
    if (token) {
      const j = await moodleCall({ action: 'sync', site, token });
      conn = { site: j.site, token, siteName: j.siteName, user: '' };
    } else {
      if (!f.get('username').trim() || !f.get('password')) throw Error('יש להזין שם משתמש וסיסמה, או מפתח גישה.');
      const j = await moodleCall({ action: 'token', site, username: f.get('username').trim(), password: f.get('password') });
      conn = { site: j.site, token: j.token, siteName: j.siteName, user: j.user };
    }
    try { localStorage.setItem(MOODLE_KEY, JSON.stringify(conn)); } catch { throw Error('לא ניתן לשמור את החיבור בדפדפן.'); }
    setTimeout(() => act(moodleSync), 50);
    return `מחובר ל-${conn.siteName || 'Moodle'}. עכשיו בוחרים מה לייבא.`;
  }, { submitLabel: 'התחברות' });
}
async function moodleSync() {
  const conn = moodleConn();
  if (!conn) return moodleConnect();
  status('מושך קורסים ומועדים מ-Moodle…');
  const snap = await moodleCall({ action: 'sync', site: conn.site, token: conn.token });
  if (!snap.courses.length) { status('לא נמצאו קורסים פעילים בחשבון ה-Moodle.'); return; }
  const host = new URL(snap.site).host, t = M.today();
  const known = new Set(state.tasks.map(x => x.ext).filter(Boolean));
  const byCourse = c => snap.items.filter(i => i.courseId === c.id).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  openEditor('ייבוא מ-' + (snap.siteName || 'Moodle'), `<p>מסמנים מה לייבא. קורסים קיימים לא ייווצרו פעמיים, ומועדים שהשתנו יתעדכנו.</p>
    ${snap.courses.map(c => { const items = byCourse(c), exists = state.courses.some(x => x.ext === `moodle:${host}:course:${c.id}`); return `<fieldset><legend><label class="check" style="margin:0"><input type="checkbox" name="course" value="${esc(String(c.id))}" ${exists || items.some(i => !i.due || i.due >= t) ? 'checked' : ''}> ${esc(c.fullname)}${exists ? ' <span class="badge ok">קיים</span>' : ''}</label></legend>
      ${items.length ? items.map(i => `<label class="check"><input type="checkbox" name="item" value="${esc(i.id)}" ${!i.due || i.due >= t ? 'checked' : ''}> ${esc(i.name)} · ${esc(i.kind || '')} ${i.due ? '· ' + esc(V.fmtDate(i.due, { day: 'numeric', month: 'numeric', year: '2-digit' })) : '· ללא מועד'}${known.has(`moodle:${host}:item:${i.id}`) ? ' <span class="badge">קיים</span>' : ''}</label>`).join('') : '<p class="muted small">אין מטלות עם מועד.</p>'}</fieldset>`; }).join('')}`,
  f => {
    const pick = { courses: new Set(f.getAll('course')), items: new Set(f.getAll('item')) };
    if (!pick.courses.size) throw Error('לא נבחר אף קורס.');
    let res;
    commit(d => { res = M.mergeMoodle(d, snap, pick); return res.state; });
    return `יובאו ${res.addedCourses} קורסים ו-${res.addedTasks} מטלות. ${res.updatedTasks ? res.updatedTasks + ' מועדים עודכנו.' : ''}`;
  }, { submitLabel: 'ייבוא הנבחרים' });
}

// ---------- Cloud sync ----------
const cloud = { busy: false, error: '' };
let syncTimer = 0;
function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow({}), 2500); }
function replaceFromCloud(data, version) {
  const next = M.validate(data);
  const text = JSON.stringify(next);
  try { if (raw) localStorage.setItem(KEY + '-before-cloud', raw); localStorage.setItem(KEY, text); } catch { throw Error('לא ניתן לשמור את הנתונים מהענן במכשיר.'); }
  state = next; raw = text; undoStack = []; ui.lessonNote = '';
  C.setSyncMeta({ version, dirty: false, at: new Date().toISOString() });
  applySettings();
}
function isEmpty(d) { return !d.courses.length && !d.notes.length && !d.tasks.length && !d.questions.length; }
async function syncNow({ interactive = false } = {}) {
  if (!C.session() || cloud.busy || locked) return;
  cloud.busy = true; cloud.error = '';
  try {
    const meta = C.syncMeta();
    const remote = await C.pullCloud();
    if (remote.status !== 200) throw Error('הסנכרון נכשל.');
    const rv = remote.body.version || 0;
    if (rv > meta.version) {
      if (!meta.dirty || isEmpty(state)) {
        replaceFromCloud(remote.body.data, rv);
        render();
        if (interactive || meta.version) status('הנתונים עודכנו מהענן.');
        return;
      }
      if (!remote.body.data) { /* fall through to push */ }
      else { cloud.busy = false; return conflict(remote.body); }
    }
    if (meta.dirty || rv === 0) {
      const r = await C.pushCloud(rv, state);
      if (r.status === 409) { cloud.busy = false; return conflict(r.body); }
      if (r.status !== 200) throw Error(r.status === 413 ? 'הנתונים גדולים מדי לסנכרון (מעל 4.5 MB). כדאי להסיר קבצים גדולים.' : 'שמירה בענן נכשלה.');
      C.setSyncMeta({ version: r.body.version, dirty: false, at: new Date().toISOString() });
      if (interactive) status('הנתונים נשמרו בענן.');
    } else {
      C.setSyncMeta({ ...meta, at: new Date().toISOString() });
      if (interactive) status('הכול מסונכרן.');
    }
  } catch (e) {
    cloud.error = e.offline ? 'אין חיבור - יסונכרן כשהרשת תחזור.' : e.message;
    if (interactive) status(cloud.error);
  } finally {
    cloud.busy = false;
    if (route().name === 'more' && !$('editor').open) render();
  }
}
function conflict(remote) {
  const when = remote.updatedAt ? new Date(remote.updatedAt).toLocaleString('he-IL') : '';
  const count = d => `${d.courses?.length || 0} קורסים, ${d.notes?.length || 0} סיכומים, ${d.tasks?.length || 0} משימות`;
  openEditor('יש שינויים בשני מכשירים', `<p>הנתונים בענן השתנו ממכשיר אחר${when ? ' (' + esc(when) + ')' : ''}, וגם כאן יש שינויים שלא נשמרו. צריך לבחור איזו גרסה תישאר. הגרסה שלא תיבחר נשמרת כגיבוי בדפדפן הזה.</p>
    <fieldset><legend>איזו גרסה לשמור?</legend>
    <label class="check"><input type="radio" name="keep" value="cloud" checked> הגרסה מהענן: ${esc(count(remote.data || {}))}</label>
    <label class="check"><input type="radio" name="keep" value="local"> הגרסה מהמכשיר הזה: ${esc(count(state))}</label></fieldset>`,
  async f => {
    if (f.get('keep') === 'cloud') { replaceFromCloud(remote.data, remote.version); return 'נטענה הגרסה מהענן. הגרסה הקודמת של המכשיר נשמרה כגיבוי.'; }
    try { localStorage.setItem(KEY + '-cloud-backup', JSON.stringify(remote.data)); } catch {}
    const r = await C.pushCloud(remote.version, state);
    if (r.status !== 200) throw Error('השמירה בענן נכשלה. כדאי לנסות שוב.');
    C.setSyncMeta({ version: r.body.version, dirty: false, at: new Date().toISOString() });
    return 'הגרסה מהמכשיר הזה נשמרה בענן.';
  }, { submitLabel: 'שמירת הבחירה' });
}
async function afterOAuth(o) {
  if (!o) return;
  if (o.error) { status(o.error === 'access_denied' ? 'ההתחברות בוטלה.' : 'ההתחברות עם Google נכשלה. כדאי לנסות שוב.'); return; }
  if (o.purpose === 'login' || !C.session()) {
    if (!o.idToken) return;
    try { const j = await C.finishLogin(o.idToken, o.nonce); status(`מחובר כ-${j.email}. מסנכרן…`); }
    catch (e) { status(e.message); return; }
    const meta = C.syncMeta();
    const remote = await C.pullCloud().catch(() => null);
    if (remote?.status === 200 && remote.body.version && !isEmpty(state) && !meta.version && remote.body.data) { render(); return conflict(remote.body); }
    C.setSyncMeta({ ...C.syncMeta(), dirty: !isEmpty(state) });
    await syncNow({ interactive: true });
  }
  if (o.after?.action && actions[o.after.action]) act(() => actions[o.after.action](o.after.id));
}

// ---------- Google Drive picker ----------
async function drivePicker(token, courseId, query = '') {
  status('טוען קבצים מ-Google Drive…');
  let files;
  try { files = await C.driveList(token, query); }
  catch (e) { if (e.reauth) return C.startGoogleAuth('drive', [C.SCOPES.drive], location.hash, { action: 'drive-import', id: courseId }); throw e; }
  status('');
  openEditor('ייבוא מ-Google Drive', `<p>בוחרים קובץ: מסמך Google, מצגת Google או PowerPoint, או קובץ טקסט. מצגות הופכות לכרטיסים, כולל הערות המרצה.</p>
    <label for="drive-q">חיפוש לפי שם</label><div class="actions" style="margin:0"><input id="drive-q" value="${esc(query)}" style="flex:1"><button type="button" data-action="drive-search" data-id="${esc(courseId)}">חיפוש</button></div>
    <fieldset><legend>קבצים אחרונים (${files.length})</legend>${files.map((f, i) => `<label class="check"><input type="radio" name="file" value="${i}" ${i === 0 ? 'checked' : ''}> ${esc(f.name)} <span class="badge">${esc(f.typeLabel)}</span></label>`).join('') || '<p class="muted">לא נמצאו קבצים מתאימים.</p>'}</fieldset>`,
  async f => {
    const file = files[Number(f.get('file'))];
    if (!file) throw Error('לא נבחר קובץ.');
    $('form-error').textContent = 'מוריד את הקובץ…';
    const c = await C.driveContent(token, file);
    const text = c.kind === 'pptx' ? (await pptxToMarkdown(c.buffer)).markdown : c.text;
    if (!text.trim()) throw Error('הקובץ ריק או שלא נמצא בו טקסט.');
    setTimeout(() => editNote(courseId, '', { title: file.name.replace(/\.[^.]+$/, '').slice(0, 200), text: text.slice(0, 200000), kind: 'import' }), 0);
    return 'הקובץ נקרא. אפשר לבדוק את הטקסט לפני השמירה.';
  }, { submitLabel: 'ייבוא הקובץ' });
}
actions['drive-search'] = id => { const q = $('drive-q')?.value.trim() || ''; const token = C.accessToken(C.SCOPES.drive); if (token) return drivePicker(token, id, q); };

// ---------- Events ----------
document.addEventListener('click', e => {
  const restore = e.target.closest('[data-restore-note]');
  if (restore) {
    act(() => {
      if (!confirm('לשחזר את הגרסה הזו? המצב הנוכחי יישמר כגרסה קודמת.')) return;
      commit(d => {
        const n = d.notes.find(x => x.id === restore.dataset.restoreNote), v = n?.versions?.[Number(restore.dataset.version)];
        if (!v) throw Error('הגרסה לא נמצאה.');
        const prev = { title: n.title, text: n.text, updatedAt: n.updatedAt, source: 'restore' };
        Object.assign(n, { title: v.title, text: v.text, updatedAt: new Date().toISOString(), position: 0 });
        n.versions = [...n.versions, prev].slice(-10);
      });
      closeEditor(); render(); status('הגרסה שוחזרה.', { undo: true });
    });
    return;
  }
  const b = e.target.closest('[data-action]');
  if (b && !b.disabled) { e.preventDefault(); act(() => actions[b.dataset.action]?.(b.dataset.id)); }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'chat-form') {
    e.preventDefault();
    const box = $('message'), q = box.value.trim();
    if (q && !ui.lumiBusy) act(() => sendChat(q.slice(0, 2000)));
  } else if (e.target.id === 'ai-form') {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim();
    act(async () => {
      status('בודק את קוד הגישה…');
      await callLumi({ mode: 'ping' }, code);
      try { localStorage.setItem(AI_KEY, code); } catch {}
      ui.ai.verified = true; render(); status('לומי AI מחובר ומאומת.');
    });
  }
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'message' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('chat-form').requestSubmit(); return; }
  if (route().name !== 'lesson' || ui.lessonTab !== 'slides' || $('editor').open) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft') { e.preventDefault(); act(() => actions['card-next']()); }
  if (e.key === 'ArrowRight') { e.preventDefault(); act(() => actions['card-prev']()); }
});
const SETTING_TYPES = { font: Number, dailyGoal: Number, minutes: Number, speechRate: Number, contrast: 'bool', motion: 'motion', theme: String, address: String, name: 'text', institution: 'text' };
document.addEventListener('change', async e => {
  const el = e.target;
  try {
    if (el.dataset.setting) {
      const k = el.dataset.setting, type = SETTING_TYPES[k];
      let v = type === 'bool' ? el.checked : type === 'motion' ? (el.checked ? 'reduce' : 'system') : type === 'text' ? el.value.trim() : type(el.value);
      if (type === Number && !el.checkValidity()) throw Error(`הערך צריך להיות בין ${el.min} ל-${el.max}.`);
      commit(d => { d.settings[k] = v; }, { undo: false });
      render();
      status('ההגדרה נשמרה.');
      return;
    }
    if (el.id === 'continuous') { commit(d => { d.settings.continuous = el.checked; }, { undo: false }); status(el.checked ? 'האזנה רציפה פועלת.' : 'האזנה רציפה כבויה.'); return; }
    if (el.id === 'lumi-scope') { ui.lumiScope = el.value; return; }
    if (el.id === 'backup-file') await importBackup(el.files[0]);
    if (el.id === 'note-import') {
      const f = el.files[0];
      if (!f) return;
      if (/\.pptx$/i.test(f.name)) {
        if (f.size > 60_000_000) throw Error('המצגת גדולה מ-60 MB.');
        $('form-error').textContent = 'קורא את המצגת…';
        const r = await pptxToMarkdown(await f.arrayBuffer());
        $('f-text').value = r.markdown.slice(0, 200000);
        $('f-kind-note').value = 'import';
        if (!$('f-title').value) $('f-title').value = f.name.replace(/\.[^.]+$/, '');
        $('form-error').textContent = '';
        status(`יובאו ${r.slides} שקופיות. אפשר לעבור על הטקסט לפני השמירה.`);
        return;
      }
      if (f.size > 200_000) throw Error('הקובץ גדול מ-200 KB.');
      if (!/\.(txt|md)$/i.test(f.name)) throw Error('יש לבחור מצגת PowerPoint, קובץ TXT או Markdown.');
      $('f-text').value = await f.text();
      if (!$('f-title').value) $('f-title').value = f.name.replace(/\.[^.]+$/, '');
      $('form-error').textContent = '';
    }
  } catch (err) { report(err); render(); }
  finally { if (['backup-file', 'note-import'].includes(el.id)) el.value = ''; }
});
let diffTimer = 0;
document.addEventListener('input', e => {
  if (e.target.id === 'search') {
    const pos = e.target.selectionStart;
    ui.search = e.target.value;
    render();
    $('search').focus(); $('search').setSelectionRange(pos, pos);
  }
  if (e.target.id === 'font-size') $('font-value').value = e.target.value + ' פיקסלים';
  if (e.target.id === 'f-proposed') { clearTimeout(diffTimer); diffTimer = setTimeout(refreshDiff, 350); }
});
$('undo').onclick = () => act(undo);
$('close-editor').onclick = closeEditor;
$('cancel-editor').onclick = closeEditor;
$('editor').addEventListener('close', () => { $('editor-submit').hidden = false; });
window.addEventListener('hashchange', () => { stopSpeech(); if (route().name !== 'lesson') stopVoice(); if (route().name !== 'lesson') ui.lessonNote = ''; render(true); });
window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  try {
    const next = e.newValue ? M.validate(JSON.parse(e.newValue)) : M.emptyState();
    if ($('editor').open) { storageError('הנתונים השתנו בחלון אחר. כדאי לסגור את הטופס ולרענן לפני שמירה.'); return; }
    state = next; raw = e.newValue; applySettings(); render(); status('הנתונים עודכנו מחלון אחר.');
  } catch { locked = true; storageError('נתוני האחסון השתנו לפורמט לא תקין. העריכה נעולה עד בדיקה ורענון.'); }
});
window.addEventListener('beforeunload', e => { if (session || $('editor').open) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', stopSpeech);
window.addEventListener('online', () => { if (ui.ai.configured === false) aiInit(); });
if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => {});

applySettings();
$('toast').classList.add('idle');
render(true);
aiInit();
afterOAuth(oauthReturn).catch(report);
if (C.session() && !oauthReturn) syncNow({});
setInterval(() => { if (document.visibilityState === 'visible') syncNow({}); }, 60_000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow({}); });
window.addEventListener('online', () => syncNow({}));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) $('update').hidden = false; });
    });
  }).catch(() => {});
}
$('reload').onclick = () => location.reload();
