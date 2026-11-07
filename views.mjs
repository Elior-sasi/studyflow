// Screen renderers. Pure functions of (state, ui) that return HTML strings.
// Every user-supplied value passes through esc(); formatted lesson text passes through formatBody().
import { esc, formatBody, diffHTML } from './content.mjs';
import { icon, lumi, ICON_LABELS, COLOR_LABELS } from './icons.mjs';
import {
  COLORS, ICONS, today, weekDates, monthGrid, formatMinutes, noteCards, noteProgress, courseProgress, overallCoverage,
  streak, periodStats, recommend, dayItems, reviewQueue, reviewDue, weeklyReport, stats,
} from './model.mjs';

// ---------- small helpers ----------
export const say = (st, m, f, n) => ({ m, f, n: n ?? m })[st.settings.address] ?? n ?? m;
const pct = r => `${Math.round(r * 100)}%`;
export function fmtDate(s, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(s + 'T12:00:00').toLocaleDateString('he-IL', opts);
}
const shortDate = s => fmtDate(s, { weekday: 'short', day: 'numeric', month: 'numeric' });
const btn = (label, action, id = '', cls = '', extra = '') => `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
const course = (st, id) => st.courses.find(c => c.id === id);
const courseName = (st, id) => course(st, id)?.name || (id ? 'קורס שהוסר' : 'כללי');
export function tile(c, name = c?.icon || 'book') {
  return `<span class="tile c-${esc(c?.color || 'blue')}">${icon(name)}</span>`;
}
const KIND = { assignment: { label: 'מטלה', icon: 'doc' }, study: { label: 'למידה', icon: 'book' }, exam: { label: 'מבחן', icon: 'exam' }, break: { label: 'הפסקה', icon: 'coffee' } };
function head(title, { back = '', action = '', sub = '' } = {}) {
  return `<div class="page-head">${back ? `<a class="button icon-btn ghost" href="${back}" aria-label="חזרה">${icon('back')}</a>` : ''}<div class="grow" style="flex:1"><h1 tabindex="-1">${title}</h1>${sub ? `<p class="muted lead">${sub}</p>` : ''}</div>${action}</div>`;
}
function seg(label, action, options, current) {
  return `<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) => `<button type="button" data-action="${action}" data-id="${v}" aria-pressed="${v === current}">${t}</button>`).join('')}</div>`;
}
function progressBar(ratio, label, cls = '') {
  return `<progress class="${cls}" max="100" value="${Math.round(ratio * 100)}" aria-label="${esc(label)}">${pct(ratio)}</progress>`;
}
function greeting(st) {
  const h = new Date().getHours();
  const g = h < 5 ? 'לילה טוב' : h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : h < 21 ? 'ערב טוב' : 'לילה טוב';
  return st.settings.name ? `${g}, ${esc(st.settings.name)}!` : `${g}!`;
}
function coverageText(p) {
  return p.total ? `כיסוי חומר ${pct(p.ratio)} · ${p.read} מתוך ${p.total} כרטיסים` : 'אין עדיין סיכומים לקריאה';
}

// ---------- Home ----------
export function home(st, ui) {
  const rec = recommend(st);
  const recCourse = rec && course(st, rec.courseId);
  const d = today();
  const items = dayItems(st, d).filter(t => !t.done && !(rec?.type === 'task' && rec.id === t.id));
  const due = reviewQueue(st, '', d).filter(q => reviewDue(st, q.id));
  const s = stats(st);
  const active = st.courses.filter(c => !c.archived);
  const start = say(st, 'בוא נתחיל', 'בואי נתחיל', 'מתחילים');
  return `
  <header class="hero-top">${lumi(130)}<div class="greet"><p class="brand">StudyFlow</p><h1 tabindex="-1">${greeting(st)}</h1><p>אני לומי. ${say(st, 'מוכן ללמוד היום?', 'מוכנה ללמוד היום?', 'מתחילים ללמוד היום?')}</p></div></header>
  <section class="card reco" aria-labelledby="reco-h">
    <h2 id="reco-h">המשימה המומלצת להיום</h2>
    ${rec ? `<div class="course-hero">${tile(recCourse, rec.type === 'review' ? 'repeat' : recCourse?.icon)}<div><p style="margin:0"><b style="font-size:1.15rem">${esc(recCourse?.name || rec.title)}</b></p><p class="muted" style="margin:0">${esc(rec.type === 'lesson' ? rec.title + ' · ' + rec.reason : rec.title + ' · ' + rec.reason)}</p></div></div>
      <button type="button" class="primary start" data-action="start-reco">${start} · ${rec.minutes} דקות</button>`
    : `<p>${st.courses.length ? 'אין כרגע משימה פתוחה, שיעור שלא נקרא או חזרה שהגיע מועדה.' : 'עוד אין נתונים. אחרי שמוסיפים קורס וסיכום, לומי ימליץ על הצעד הבא לפי החומר, המשימות והחזרות שלך.'}</p>
      <div class="actions">${st.courses.length ? btn(icon('plus') + ' משימה חדשה', 'edit-task', '', 'primary') + btn('הוספת סיכום', 'edit-note', '') : btn(icon('plus') + ' הוספת קורס ראשון', 'edit-course', '', 'primary')}</div>`}
  </section>
  <h2 class="section-title">מה עוד חשוב היום?</h2>
  ${items.length || due.length ? `<ul class="rows">
    ${items.map(t => `<li>${taskRow(st, t)}</li>`).join('')}
    ${due.length && rec?.type !== 'review' ? `<li><a class="row-link" href="#practice">${tile({ color: 'teal' }, 'repeat')}<span class="grow"><span class="title">חזרה על ${due.length} שאלות</span><span class="sub">הגיע מועד החזרה</span></span>${icon('chevron')}</a></li>` : ''}
  </ul>` : `<div class="empty">אין עוד משימות להיום. אפשר להוסיף משימה במסך התוכנית.</div>`}
  <section class="card" aria-labelledby="goal-h"><h2 id="goal-h">היעד היומי</h2><p>${Math.round(s.todayMinutes)} מתוך ${st.settings.dailyGoal} דקות למידה מתועדות היום</p>${progressBar(Math.min(1, s.todayMinutes / st.settings.dailyGoal), 'התקדמות ליעד היומי')}</section>
  <a class="row-link" href="#lumi">${lumi(48)}<span class="grow"><span class="title">לשוחח עם לומי</span><span class="sub">${ui.ai.verified ? 'שאלות על החומר שלך, עם הפניה למקור' : 'מצב מקומי: משימות, התקדמות ותרגול'}</span></span>${icon('chevron')}</a>
  ${active.length ? `<h2 class="section-title">הקורסים שלי</h2><ul class="rows">${active.slice(0, 4).map(c => `<li>${courseRow(st, c)}</li>`).join('')}</ul>` : ''}
  <div class="actions">${btn(icon('plus') + ' קורס', 'edit-course')}${btn(icon('plus') + ' משימה', 'edit-task')}${btn(icon('repeat') + ' תרגול', 'go', '#practice')}</div>`;
}

function taskRow(st, t) {
  const c = course(st, t.courseId), k = KIND[t.kind] || KIND.assignment;
  const late = !t.done && t.date && t.date < today();
  const sub = [t.kind === 'break' ? '' : courseName(st, t.courseId), t.time, `${t.minutes} דקות`, t.date ? 'הגשה ' + shortDate(t.date) : '', late ? 'באיחור' : ''].filter(Boolean).join(' · ');
  return `<button type="button" class="row-link ${t.done ? 'done' : ''}" data-action="edit-task" data-id="${esc(t.id)}">${tile(t.kind === 'break' ? { color: 'amber' } : c, t.kind === 'assignment' || t.kind === 'study' ? (c?.icon || k.icon) : k.icon)}<span class="grow"><span class="title">${esc(t.title)}</span><span class="sub">${esc(k.label)} · ${esc(sub)}</span></span>${late ? '<span class="badge warn">באיחור</span>' : ''}</button>`;
}
function courseRow(st, c) {
  const p = courseProgress(st, c.id);
  return `<a class="row-link c-${esc(c.color)}" href="#course/${esc(c.id)}">${tile(c)}<span class="grow"><span class="title">${esc(c.name)}</span><span class="sub">${coverageText(p)}${c.archived ? ' · בארכיון' : ''}</span>${p.total ? progressBar(p.ratio, 'כיסוי חומר ' + c.name) : ''}</span>${icon('chevron')}</a>`;
}

// ---------- Lumi ----------
export function lumiView(st, ui) {
  const ai = ui.ai;
  const status = ai.verified ? `מחובר ל-AI${ai.provider ? ' (' + ai.provider + ')' : ''}` : ai.configured ? 'AI זמין - נדרש קוד גישה' : 'מצב מקומי, ללא AI';
  const chips = ai.verified
    ? [['הסבר פשוט יותר', 'תסביר את זה שוב בפשטות, עם דוגמה'], ['דוגמה', 'תן דוגמה מתוך החומר שלי'], ['תרגול', 'שאל אותי שאלה אחת לבדיקת הבנה על הנושא האחרון']]
    : [['המשימות שלי', 'מה המשימות הקרובות שלי?'], ['ההתקדמות שלי', 'מה ההתקדמות שלי?'], ['איך לתרגל?', 'איך לתרגל?']];
  return `
  <div class="page-head chat-head"><a class="button icon-btn ghost" href="#home" aria-label="חזרה לבית">${icon('back')}</a>${lumi(56)}<div style="flex:1"><h1 tabindex="-1" style="font-size:1.4rem;margin:0">לומי</h1><p class="muted" style="margin:0">${status}</p></div></div>
  ${ai.verified ? '' : `<div class="card honest"><p style="margin:0">${ai.configured ? 'השרת מוגדר עם מודל AI. כדי להשתמש בו יש להזין קוד גישה במסך "עוד".' : 'כרגע לומי עונה מתוך הנתונים השמורים במכשיר בלבד. לא מחובר מודל AI, ולכן אין הסברים חופשיים או ניתוח של החומר.'}</p>${ai.configured ? `<a class="button" href="#more" style="margin-top:.5rem">להזנת קוד גישה</a>` : ''}</div>`}
  ${ai.verified && st.courses.length ? `<label for="lumi-scope">לחפש תשובות בחומר של</label><select id="lumi-scope"><option value="">כל הקורסים</option>${st.courses.map(c => `<option value="${esc(c.id)}" ${ui.lumiScope === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
  <div class="chat" id="chat-log" role="log" aria-live="polite" aria-label="השיחה עם לומי" aria-busy="${ui.lumiBusy}">
    <div class="bubble bot"><span class="who">לומי</span><p>היי! ${ai.verified ? 'אפשר לשאול אותי על החומר שלך. אענה מתוך הסיכומים ואציין מאיזה כרטיס התשובה.' : 'במה אפשר לעזור היום?'}</p></div>
    ${ui.chat.map(m => bubble(m)).join('')}
    ${ui.lumiBusy ? '<div class="bubble bot"><span class="who">לומי</span><p>חושב על תשובה…</p></div>' : ''}
  </div>
  <div class="chips">${chips.map(([t, q]) => btn(esc(t), 'lumi-chip', q)).join('')}</div>
  <form id="chat-form" class="composer"><label for="message" class="sr-only">הודעה ללומי</label><textarea id="message" name="message" maxlength="2000" rows="1" placeholder="כתיבת הודעה ללומי…" required></textarea><button class="primary icon-btn" aria-label="שליחה" ${ui.lumiBusy ? 'disabled' : ''}>${icon('send')}</button></form>`;
}
function bubble(m) {
  if (m.mine) return `<div class="bubble mine"><span class="who">אני</span><p>${esc(m.text)}</p></div>`;
  const text = esc(m.text).replace(/\[(\d)\]/g, (all, n) => (m.sources?.[n - 1] ? `<span class="cite">[${n}]</span>` : all));
  const src = m.sources?.length ? `<p class="small"><b>מקורות:</b></p><ul class="small">${m.sources.map((s, i) => `<li><a href="#lesson/${esc(s.noteId)}/${s.card}">[${i + 1}] ${esc(s.label)}</a></li>`).join('')}</ul>` : '';
  return `<div class="bubble bot ${m.error ? 'error-bubble' : ''}"><span class="who">לומי${m.local ? ' · מקומי' : ''}</span><p>${text}</p>${src}</div>`;
}

// ---------- Courses ----------
export function courses(st, ui) {
  const filter = ui.courseTab;
  const q = ui.search.trim().toLocaleLowerCase();
  let list = st.courses.filter(c => {
    const p = courseProgress(st, c.id);
    if (filter === 'archived') return c.archived;
    if (c.archived) return false;
    if (filter === 'done') return p.total > 0 && p.read === p.total;
    if (filter === 'active') return !(p.total > 0 && p.read === p.total);
    return true;
  });
  if (q) list = list.filter(c => (c.name + ' ' + c.instructor + ' ' + c.description).toLocaleLowerCase().includes(q) || st.notes.some(n => n.courseId === c.id && (n.title + ' ' + n.text).toLocaleLowerCase().includes(q)));
  const hits = q ? st.notes.filter(n => (n.title + ' ' + n.text).toLocaleLowerCase().includes(q)).slice(0, 20) : [];
  return `${head('הקורסים שלי', { action: `<button type="button" class="icon-btn primary" data-action="edit-course" aria-label="קורס חדש">${icon('plus')}</button>` })}
  ${seg('סינון קורסים', 'course-tab', [['all', 'הכל'], ['active', 'בתהליך'], ['done', 'הושלמו'], ['archived', 'בארכיון']], filter)}
  <label for="search" class="sr-only">חיפוש בקורסים ובסיכומים</label><input id="search" type="search" value="${esc(ui.search)}" placeholder="חיפוש בקורסים ובסיכומים" autocomplete="off">
  ${!st.courses.length ? `<div class="empty"><p>עוד אין קורסים. כל קורס מחזיק סיכומים, משימות, שאלות חזרה וחומרי לימוד.</p>${btn(icon('plus') + ' הוספת הקורס הראשון', 'edit-course', '', 'primary')}</div>`
    : list.length ? `<ul class="rows" aria-label="רשימת קורסים">${list.map(c => `<li>${courseRow(st, c)}</li>`).join('')}</ul>` : `<div class="empty">אין קורסים בתצוגה הזו.</div>`}
  ${hits.length ? `<h2 class="section-title">סיכומים שמתאימים לחיפוש</h2><ul class="rows">${hits.map(n => `<li><a class="row-link" href="#lesson/${esc(n.id)}">${tile(course(st, n.courseId), 'doc')}<span class="grow"><span class="title">${esc(n.title)}</span><span class="sub">${esc(courseName(st, n.courseId))}</span></span>${icon('chevron')}</a></li>`).join('')}</ul>` : ''}`;
}

export function courseDetail(st, ui, id) {
  const c = course(st, id);
  if (!c) return notFound('הקורס לא נמצא. ייתכן שנמחק.');
  const p = courseProgress(st, id);
  const minutes = st.sessions.filter(s => s.courseId === id).reduce((a, s) => a + s.minutes, 0);
  const notes = st.notes.filter(n => n.courseId === id);
  const tasks = st.tasks.filter(t => t.courseId === id).sort((a, b) => Number(a.done) - Number(b.done) || (a.date || '9999').localeCompare(b.date || '9999'));
  const qs = st.questions.filter(q => q.courseId === id), due = reviewQueue(st, id).length;
  const terms = st.glossary.filter(g => g.courseId === id), mats = st.materials.filter(m => m.courseId === id);
  return `<div class="page-head"><a class="button icon-btn ghost" href="#courses" aria-label="חזרה לקורסים">${icon('back')}</a><div class="course-hero c-${esc(c.color)}" style="flex:1">${tile(c)}<div><h1 tabindex="-1" style="margin:0">${esc(c.name)}</h1><p class="muted" style="margin:0">${[c.instructor && 'מרצה: ' + esc(c.instructor), c.examDate && 'מבחן: ' + fmtDate(c.examDate), c.archived && 'בארכיון'].filter(Boolean).join(' · ') || 'קורס'}</p></div></div></div>
  ${c.description ? `<p>${esc(c.description)}</p>` : ''}
  <section class="card c-${esc(c.color)}" aria-labelledby="cov-h"><h2 id="cov-h">התקדמות בקורס</h2><p>${coverageText(p)}</p>${p.total ? progressBar(p.ratio, 'כיסוי חומר בקורס') : ''}<p class="muted">${formatMinutes(minutes)} למידה מתועדת · ${tasks.filter(t => !t.done).length} משימות פתוחות · ${qs.length} שאלות חזרה</p>
  <div class="actions">${btn(icon('timer') + ' התחלת זמן למידה', 'start-session', id, 'primary')}${btn(icon('edit') + ' עריכה', 'edit-course', id)}${btn(icon('archive') + (c.archived ? ' החזרה מארכיון' : ' העברה לארכיון'), 'archive-course', id)}${btn(icon('trash') + ' מחיקה', 'delete-course', id, 'danger')}</div></section>

  <div class="page-head" style="margin-bottom:0"><h2 class="section-title">שיעורים וסיכומים</h2><div class="actions" style="margin:0">${btn(icon('plus') + ' סיכום', 'edit-note', id)}${btn(icon('download') + ' מ-Drive', 'drive-import', id, '', 'aria-label="ייבוא מ-Google Drive"')}</div></div>
  ${notes.length ? `<ul class="rows">${notes.map(n => { const np = noteProgress(st, n); return `<li><a class="row-link c-${esc(c.color)}" href="#lesson/${esc(n.id)}">${tile(c, 'doc')}<span class="grow"><span class="title">${esc(n.title)}</span><span class="sub">${np.total ? `${np.read} מתוך ${np.total} כרטיסים נקראו` : 'סיכום ריק'}</span>${np.total ? progressBar(np.ratio, 'התקדמות בשיעור ' + n.title) : ''}</span>${icon('chevron')}</a></li>`; }).join('')}</ul>` : `<div class="empty"><p>אין עדיין שיעורים. שלוש דרכים להתחיל:</p><ul style="text-align:start"><li><b>סיכום</b> - כותבים או מדביקים טקסט, או מייבאים מצגת PowerPoint, TXT או Markdown.</li><li><b>מ-Drive</b> - מסמך או מצגת מ-Google Drive.</li><li>אחר כך, בתוך השיעור, <b>לומי</b> יכול ליצור ממנו סיכום מסודר, מצגת או פודקאסט.</li></ul></div>`}

  <div class="page-head" style="margin-bottom:0"><h2 class="section-title">משימות ומועדים</h2>${btn(icon('plus') + ' משימה', 'new-task-course', id)}</div>
  ${tasks.length ? `<ul class="timeline">${tasks.map(t => timelineItem(st, t)).join('')}</ul>` : '<div class="empty">אין משימות לקורס הזה.</div>'}

  <section class="card"><div class="page-head" style="margin:0"><h2 style="margin:0">שאלות חזרה</h2>${btn(icon('plus') + ' שאלה', 'edit-question', id)}</div>
  <p>${qs.length ? `${qs.length} שאלות · ${due} ממתינות לחזרה היום` : 'אין עדיין שאלות. שאלה טובה בודקת הבנה של רעיון אחד.'}</p>
  ${qs.length ? `<div class="actions">${btn(icon('repeat') + ' תרגול הקורס', 'start-quiz', id, 'primary')}</div><details><summary>כל השאלות (${qs.length})</summary>${qs.map(q => `<div class="item"><h3>${esc(q.prompt)}</h3><p class="muted">חזרה הבאה: ${reviewDue(st, q.id) ? shortDate(reviewDue(st, q.id)) : 'טרם תורגלה'}</p><div class="actions">${btn('עריכה', 'edit-question-existing', q.id)}${btn('מחיקה', 'delete-question', q.id, 'danger')}</div></div>`).join('')}</details>` : ''}</section>

  <details class="card"><summary>מילון מושגים (${terms.length})</summary>${btn(icon('plus') + ' מושג', 'edit-term', id)}${terms.map(g => `<div class="item"><h3>${esc(g.term)} ${g.original ? `<span dir="auto" class="muted">(${esc(g.original)})</span>` : ''}</h3><p>${esc(g.definition)}</p><div class="actions">${btn('עריכה', 'edit-term-existing', g.id)}${btn('מחיקה', 'delete-term', g.id, 'danger')}</div></div>`).join('') || '<p class="muted">אין מושגים.</p>'}</details>

  <details class="card"><summary>חומרי לימוד וקבצים (${mats.length})</summary>${btn(icon('plus') + ' חומר לימוד', 'edit-material', id)}${mats.map(m => `<div class="item"><h3>${esc(m.title)}</h3><p class="muted">${m.kind === 'link' ? 'קישור חיצוני' : 'קובץ שמור במכשיר' + (m.filename ? ' · ' + esc(m.filename) : '')}</p><div class="actions">${btn(m.kind === 'link' ? icon('link') + ' פתיחה' : icon('download') + ' הורדה', 'open-material', m.id)}${btn('מחיקה', 'delete-material', m.id, 'danger')}</div></div>`).join('') || '<p class="muted">אין חומרים. קבצי PDF ותמונות נשמרים להורדה בלבד; אין עדיין חילוץ טקסט מהם.</p>'}</details>`;
}
function notFound(text) {
  return `${head('לא נמצא', { back: '#courses' })}<div class="empty">${esc(text)}</div>`;
}

// ---------- Lesson ----------
function toolsCard(n, ui) {
  const ai = ui.ai.verified;
  return `<section class="card" aria-labelledby="tools-h"><h2 id="tools-h">יצירה וייצוא מהשיעור</h2>
    <div class="actions">${ai ? btn(icon('sparkle') + ' לומי: סיכום', 'ai-summary', n.id, 'primary') + btn(icon('sparkle') + ' לומי: מצגת', 'ai-slides', n.id) + btn(icon('headphones') + ' לומי: פודקאסט', 'ai-podcast', n.id) : ''}${btn(icon('download') + ' PowerPoint', 'export-pptx', n.id)}${btn(icon('doc') + ' הדפסה / PDF', 'go', '#print/' + n.id)}</div>
    <p class="hint">${ai ? 'כל יצירה של לומי נשמרת כשיעור חדש באותו קורס. המקור לא משתנה.' : 'כדי שלומי ייצור סיכום, מצגת או פודקאסט צריך לחבר את לומי AI במסך "עוד".'}</p></section>`;
}

export function lesson(st, ui, noteId) {
  const n = st.notes.find(x => x.id === noteId);
  if (!n) return notFound('הסיכום לא נמצא. ייתכן שנמחק.');
  const c = course(st, n.courseId), cards = noteCards(n), np = noteProgress(st, n);
  const idx = Math.min(ui.card, Math.max(0, cards.length - 1)), card = cards[idx];
  const read = new Set(st.reads.filter(r => r.noteId === n.id).map(r => r.card));
  const tab = ui.lessonTab;
  let body = '';
  if (!cards.length) body = `<div class="empty">הסיכום ריק. ${btn('עריכת הסיכום', 'edit-note-existing', n.id, 'primary')}</div>`;
  else if (tab === 'slides') {
    const sp = ui.speech, playing = sp.noteId === n.id && sp.playing;
    body = `<article class="slide ${read.has(card.id) ? 'read' : ''}" aria-labelledby="card-title" aria-roledescription="כרטיס" tabindex="-1" id="card">
      <h2 id="card-title">${esc(card.title || n.title)}</h2>${formatBody(card.body)}</article>
    <div class="pager card" style="padding:.4rem .6rem">${btn(icon('back'), 'card-prev', '', 'icon-btn', `aria-label="הכרטיס הקודם" ${idx === 0 ? 'disabled' : ''}`)}<output aria-live="polite">כרטיס ${idx + 1} מתוך ${cards.length}</output>${idx < cards.length - 1 ? btn(icon('chevron'), 'card-next', '', 'icon-btn', 'aria-label="הכרטיס הבא (מסמן את הנוכחי כנקרא)"') : btn(icon('check') + ' סיום', 'card-finish', '', 'primary', 'aria-label="סיום השיעור וסימון הכרטיס האחרון כנקרא"')}</div>
    <section class="card player hide-in-focus-not" aria-labelledby="player-h">
      <div class="player-head">${icon('headphones')}<h2 id="player-h" style="margin:0;font-size:1.05rem">הקראה בעברית</h2></div>
      ${progressBar((idx + (read.has(card.id) ? 1 : 0)) / cards.length, 'מיקום בשיעור')}
      <p class="muted small" style="margin:.3rem 0 0">${np.read} מתוך ${np.total} כרטיסים נקראו${sp.error ? ' · ' + esc(sp.error) : ''}</p>
      <div class="controls">
        ${btn(icon('prev'), 'card-prev', '', 'icon-btn', `aria-label="כרטיס קודם" ${idx === 0 ? 'disabled' : ''}`)}
        <button type="button" class="play" data-action="${playing ? 'speech-pause' : 'speech-play'}" aria-label="${playing ? 'השהיית ההקראה' : 'הקראת הכרטיס'}">${icon(playing ? 'pause' : 'play')}</button>
        ${btn(icon('next'), 'card-next', '', 'icon-btn', `aria-label="כרטיס הבא" ${idx >= cards.length - 1 ? 'disabled' : ''}`)}
        ${btn(`${st.settings.speechRate}×`, 'speech-rate', '', '', `aria-label="מהירות הקראה ${st.settings.speechRate}. לחיצה משנה את המהירות"`)}
      </div>
      <label class="check"><input type="checkbox" id="continuous" ${st.settings.continuous ? 'checked' : ''}> האזנה רציפה - מעבר אוטומטי לכרטיס הבא (מתאים לנסיעה או לאימון)</label>
      <div class="actions">${btn(icon('check') + (read.has(card.id) ? ' סימון כלא נקרא' : ' סימון כנקרא'), 'toggle-read', '', '')}${btn(icon('focus') + (ui.focus ? ' יציאה ממצב מיקוד' : ' מצב מיקוד'), 'focus-mode', '', '', `aria-pressed="${ui.focus}"`)}${btn(icon('mic') + (ui.voice.on ? ' הפסקת פקודות קוליות' : ' פקודות קוליות'), 'voice-toggle', '', ui.voice.on ? 'primary' : '', `aria-pressed="${ui.voice.on}"`)}</div>
      ${ui.voice.on ? `<p class="small" role="status">מקשיב. אפשר לומר: "הבא", "הקודם", "הקרא", "עצור", "מהר יותר", "לאט יותר", "סמן כנקרא", "סיום". ${ui.voice.heard ? 'שמעתי: ' + esc(ui.voice.heard) : ''}</p>` : ui.voice.error ? `<p class="small error">${esc(ui.voice.error)}</p>` : ''}
    </section>`;
  } else if (tab === 'text') {
    body = `<section class="card"><div class="actions">${btn(icon('edit') + ' עריכה', 'edit-note-existing', n.id)}${btn(icon('sparkle') + ' הצעת שינויים ובדיקה', 'review-note', n.id)}${ui.ai.verified ? btn(icon('sparkle') + ' לומי: הצעת שיפור', 'ai-improve', n.id, 'primary') : ''}${btn('גרסאות קודמות', 'note-versions', n.id)}${btn(icon('trash') + ' מחיקה', 'delete-note', n.id, 'danger')}</div>
      <p class="muted small">עודכן ${new Date(n.updatedAt).toLocaleString('he-IL')} · ${n.versions?.length || 0} גרסאות שמורות. שינוי מוצע אף פעם לא מחליף את הסיכום בלי אישור.</p></section>
      <article class="card" aria-label="הסיכום המלא">${cards.map((cd, i) => `<h2 style="margin-top:${i ? '1.2rem' : 0}">${esc(cd.title || n.title)}</h2>${formatBody(cd.body)}`).join('')}</article>`;
  } else {
    const qs = st.questions.filter(q => q.courseId === n.courseId);
    body = `${quizCard(st, ui)}
    <section class="card"><h2>שאלות חזרה בקורס</h2><p>${qs.length ? `${qs.length} שאלות · ${reviewQueue(st, n.courseId).length} ממתינות היום` : 'אין עדיין שאלות לקורס הזה.'}</p>
    <div class="actions">${qs.length ? btn(icon('repeat') + ' תרגול עכשיו', 'start-quiz', n.courseId, 'primary') : ''}${btn(icon('plus') + ' שאלה מהכרטיס', 'edit-question', n.courseId)}${ui.ai.verified ? btn(icon('sparkle') + ' לומי: הצעת שאלות מהכרטיס', 'ai-questions', n.id) : ''}</div></section>`;
  }
  const kindLabel = { slides: 'מצגת שלומי יצר', podcast: 'פודקאסט שלומי כתב', import: 'יובא מקובץ' }[n.kind];
  return `${head(`למידה - ${esc(c?.name || '')}`, { back: '#course/' + esc(n.courseId), sub: esc(n.title) + (kindLabel ? ` · <span class="badge">${kindLabel}</span>` : '') })}
  ${seg('תצוגת השיעור', 'lesson-tab', [['slides', 'מצגת'], ['text', 'סיכום'], ['quiz', 'שאלות']], tab)}${body}${cards.length ? toolsCard(n, ui) : ''}`;
}

export function quizCard(st, ui) {
  const q = ui.quiz && st.questions.find(x => x.id === ui.quiz.id);
  if (!q) return '';
  return `<section class="card reco" aria-labelledby="quiz-q"><p class="muted" style="margin:0">${esc(courseName(st, q.courseId))} · שאלה ${ui.quiz.n}</p><h2 id="quiz-q">${esc(q.prompt)}</h2>
  ${ui.revealed ? `<div class="card" style="box-shadow:none"><p class="note-body" style="margin:0">${esc(q.answer)}</p></div><p>איך הלך?</p><div class="actions">${btn(icon('check') + ' ידעתי', 'grade-correct', '', 'primary')}${btn(icon('repeat') + ' צריך לחזור על זה', 'grade-wrong')}${btn('סיום התרגול', 'end-quiz', '', 'ghost')}</div>`
    : `<div class="actions">${btn('הצגת התשובה', 'reveal', '', 'primary')}${btn('סיום התרגול', 'end-quiz', '', 'ghost')}</div>`}</section>`;
}

// ---------- Practice ----------
export function practice(st, ui) {
  const due = reviewQueue(st);
  return `${head('תרגול וחזרה', { back: '#more', sub: 'שאלות שכתבת מתוך החומר. הדירוג העצמי קובע מתי השאלה חוזרת (1, 3, 7, 14, 30 ימים).' })}
  ${quizCard(st, ui)}
  ${ui.quiz ? '' : `<section class="card"><p>${st.questions.length ? `${due.length} שאלות ממתינות לחזרה היום מתוך ${st.questions.length}.` : 'אין עדיין שאלות חזרה.'}</p><div class="actions">${st.questions.length ? btn(icon('repeat') + ' התחלת סבב חזרה', 'start-quiz', '', 'primary') : ''}${btn(icon('plus') + ' שאלה חדשה', 'edit-question', '')}</div></section>`}
  ${st.courses.map(c => { const qs = st.questions.filter(q => q.courseId === c.id); return qs.length ? `<details class="card c-${esc(c.color)}"><summary>${esc(c.name)} (${qs.length})</summary>${qs.map(q => `<div class="item"><h3>${esc(q.prompt)}</h3><p class="muted">חזרה הבאה: ${reviewDue(st, q.id) ? shortDate(reviewDue(st, q.id)) : 'טרם תורגלה'} · ${st.reviews.filter(r => r.questionId === q.id && r.correct).length}/${st.reviews.filter(r => r.questionId === q.id).length} נענו נכון</p><div class="actions">${btn('עריכה', 'edit-question-existing', q.id)}${btn('מחיקה', 'delete-question', q.id, 'danger')}</div></div>`).join('')}</details>` : ''; }).join('')}`;
}

// ---------- Planner ----------
function timelineItem(st, t) {
  return `<li class="${t.done ? 'done' : ''}"><button type="button" class="tick" data-action="toggle-task" data-id="${esc(t.id)}" aria-pressed="${t.done}" aria-label="${t.done ? 'סימון כלא בוצע' : 'סימון כבוצע'}: ${esc(t.title)}">${t.done ? icon('check') : ''}</button>${taskRow(st, t)}</li>`;
}
export function plan(st, ui) {
  const view = ui.planView;
  let body = '';
  if (view === 'day') {
    const d = ui.planDate, items = dayItems(st, d);
    const exams = st.courses.filter(c => c.examDate === d && !c.archived);
    const planned = items.filter(t => !t.done && t.kind !== 'break').reduce((a, t) => a + t.minutes, 0);
    const unplanned = st.tasks.filter(t => !t.done && !t.planned && !(t.date === d));
    body = `<div class="pager">${btn(icon('back'), 'day-prev', '', 'icon-btn', 'aria-label="היום הקודם"')}<h2 style="margin:0;text-align:center">${fmtDate(d)}${d === today() ? ' · היום' : ''}</h2>${btn(icon('chevron'), 'day-next', '', 'icon-btn', 'aria-label="היום הבא"')}</div>
    ${d !== today() ? `<div class="actions" style="justify-content:center">${btn('חזרה להיום', 'day-today')}</div>` : ''}
    <div class="card day-total"><span style="display:flex;gap:.5rem;align-items:center">${icon('target')} זמן לימוד מתוכנן</span><b>${formatMinutes(planned)}</b></div>
    ${exams.map(c => `<div class="card c-${esc(c.color)}" style="display:flex;gap:.7rem;align-items:center">${tile(c, 'exam')}<b>מבחן: ${esc(c.name)}</b></div>`).join('')}
    ${items.length ? `<ul class="timeline" aria-label="המשימות של היום">${items.map(t => timelineItem(st, t)).join('')}</ul>` : '<div class="empty">אין משהו מתוכנן ליום הזה.</div>'}
    <div class="actions">${btn(icon('plus') + ' הוספה ליום הזה', 'task-on-date', d, 'primary')}${btn(icon('coffee') + ' הפסקה', 'break-on-date', d)}</div>
    ${unplanned.length ? `<h2 class="section-title">ממתינות לשיבוץ</h2><ul class="rows">${unplanned.map(t => `<li style="display:flex;gap:.5rem;align-items:center">${taskRow(st, t)}${btn('שיבוץ ליום הזה', 'plan-here', t.id)}</li>`).join('')}</ul>` : ''}`;
  } else if (view === 'week') {
    const days = weekDates(ui.week);
    body = `<div class="pager">${btn(icon('back'), 'week-prev', '', 'icon-btn', 'aria-label="השבוע הקודם"')}<h2 style="margin:0">${shortDate(days[0])} - ${shortDate(days[6])}</h2>${btn(icon('chevron'), 'week-next', '', 'icon-btn', 'aria-label="השבוע הבא"')}</div>
    ${ui.week ? `<div class="actions" style="justify-content:center">${btn('השבוע הנוכחי', 'week-now')}</div>` : ''}
    <div class="week">${days.map(d => { const items = dayItems(st, d); const mins = items.filter(t => !t.done && t.kind !== 'break').reduce((a, t) => a + t.minutes, 0); return `<section class="card" aria-labelledby="w-${d}"><div class="page-head" style="margin:0"><h3 id="w-${d}" style="margin:0">${fmtDate(d)}${d === today() ? ' · היום' : ''}</h3>${btn(icon('plus'), 'task-on-date', d, 'icon-btn', `aria-label="הוספה ל${fmtDate(d)}"`)}</div><p class="muted small">${items.length ? `${items.length} פריטים · ${formatMinutes(mins)}` : 'פנוי'}</p>${items.length ? `<ul class="timeline">${items.map(t => timelineItem(st, t)).join('')}</ul>` : ''}</section>`; }).join('')}</div>`;
  } else {
    const m = monthGrid(ui.month);
    const title = new Date(m.year, m.month, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
    const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    body = `<div class="pager">${btn(icon('back'), 'month-prev', '', 'icon-btn', 'aria-label="החודש הקודם"')}<h2 style="margin:0">${title}</h2>${btn(icon('chevron'), 'month-next', '', 'icon-btn', 'aria-label="החודש הבא"')}</div>
    <table class="month"><caption class="sr-only">לוח ${title}. בחירת יום פותחת את התוכנית שלו.</caption><thead><tr>${names.map(n => `<th scope="col">${n}</th>`).join('')}</tr></thead><tbody>${m.weeks.map(w => `<tr>${w.map(d => { if (!d) return '<td></td>'; const items = dayItems(st, d).filter(t => !t.done); const deadlines = st.tasks.filter(t => !t.done && t.date === d).length; const exam = st.courses.some(c => c.examDate === d && !c.archived); const label = `${fmtDate(d)}: ${items.length ? items.length + ' פריטים פתוחים' : 'פנוי'}${deadlines ? ', ' + deadlines + ' הגשות' : ''}${exam ? ', מבחן' : ''}`; return `<td><button type="button" class="${d === today() ? 'today' : ''}" data-action="pick-day" data-id="${d}" aria-label="${label}"><span>${+d.slice(8)}</span><span class="dots" aria-hidden="true">${exam ? '★' : ''}${'•'.repeat(Math.min(3, items.length))}</span></button></td>`; }).join('')}</tr>`).join('')}</tbody></table>
    <p class="muted small">• פריט פתוח ★ מבחן</p>`;
  }
  return `${head('התוכנית שלי', { action: `<button type="button" class="icon-btn primary" data-action="task-on-date" data-id="${view === 'day' ? ui.planDate : ''}" aria-label="משימה חדשה">${icon('plus')}</button>` })}
  ${seg('טווח התוכנית', 'plan-view', [['day', 'היום'], ['week', 'השבוע'], ['month', 'החודש']], view)}${st.courses.length ? body : `<div class="empty">כדי לתכנן צריך קודם קורס. ${btn(icon('plus') + ' הוספת קורס', 'edit-course', '', 'primary')}</div>${view === 'day' ? '' : ''}`}`;
}

// ---------- Progress ----------
function ring(ratio, label) {
  const r = 52, len = 2 * Math.PI * r, off = len * (1 - (ratio ?? 0));
  return `<div class="ring" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--teal)"/><stop offset="1" stop-color="var(--accent)"/></linearGradient></defs><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--track)" stroke-width="10"/>${ratio ? `<circle cx="60" cy="60" r="${r}" fill="none" stroke="url(#rg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>` : ''}</svg><div aria-hidden="true"><div class="pct">${ratio === null ? '-' : pct(ratio)}</div><div class="lbl">כיסוי כולל של החומר</div></div></div>`;
}
export function progress(st, ui) {
  const period = ui.period, ps = periodStats(st, period), cov = overallCoverage(st), days = streak(st);
  const periodName = { week: 'השבוע', month: 'החודש', all: 'מאז ההתחלה' }[period];
  const max = Math.max(...ps.daily.map(x => x.minutes), 1);
  const names = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  const active = st.courses.filter(c => !c.archived);
  return `${head('ההתקדמות שלי')}
  ${seg('טווח זמן', 'period', [['week', 'שבוע'], ['month', 'חודש'], ['all', 'הכל']], period)}
  <section class="progress-top" aria-label="סיכום התקדמות">
    <div class="tiles">
      <div class="card stat-tile">${tile({ color: 'blue' }, 'calendar')}<div><b>${ps.openTasks}</b><span class="sub">משימות פתוחות</span></div></div>
      <div class="card stat-tile">${tile({ color: 'pink' }, 'target')}<div><b>${ps.correct}/${ps.answers}</b><span class="sub">תשובות נכונות בתרגול ${periodName}</span></div></div>
      <div class="card stat-tile">${tile({ color: 'amber' }, 'flame')}<div><b>${days}</b><span class="sub">ימי למידה ברצף</span></div></div>
    </div>
    ${ring(cov.ratio, cov.ratio === null ? 'כיסוי חומר: אין עדיין כרטיסי שיעור' : `כיסוי כולל של החומר: ${pct(cov.ratio)}, ${cov.read} מתוך ${cov.total} כרטיסים נקראו`)}
  </section>
  ${cov.ratio === null ? '<p class="muted small">הכיסוי מחושב מכרטיסי שיעור שסומנו כנקראו. אחרי שמוסיפים סיכום וקוראים אותו, האחוז יופיע כאן.</p>' : ''}
  <section class="card" aria-labelledby="period-h"><h2 id="period-h">${periodName}</h2>
    <p>${formatMinutes(ps.minutes)} למידה מתועדת · ${ps.cardsRead} כרטיסים נקראו · ${ps.tasksDone} משימות הושלמו</p>
    ${period === 'week' ? `<div class="bars" aria-hidden="true">${ps.daily.map((x, i) => `<div class="bar"><span>${Math.round(x.minutes)}</span><div class="fill" style="height:${Math.round((x.minutes / max) * 80)}%"></div><span>${names[i]}</span></div>`).join('')}</div>
    <div class="sr-only"><table class="data"><caption>דקות למידה לפי יום השבוע</caption><thead><tr><th scope="col">יום</th><th scope="col">דקות</th></tr></thead><tbody>${ps.daily.map(x => `<tr><th scope="row">${fmtDate(x.date)}</th><td>${Math.round(x.minutes)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>
  <section class="card" aria-labelledby="by-course-h"><h2 id="by-course-h">התקדמות לפי קורס</h2>
    ${active.length ? `<ul class="course-bars">${active.map(c => { const p = courseProgress(st, c.id), mins = ps.byCourse.find(x => x.id === c.id)?.minutes || 0; return `<li class="c-${esc(c.color)}">${tile(c)}<div><div style="display:flex;justify-content:space-between;gap:.5rem"><span>${esc(c.name)}</span><b>${p.total ? pct(p.ratio) : 'אין חומר'}</b></div>${p.total ? progressBar(p.ratio, 'כיסוי ' + c.name) : ''}<span class="muted small">${formatMinutes(mins)} ${periodName}</span></div></li>`; }).join('')}</ul>` : '<div class="empty">אין עדיין קורסים פעילים.</div>'}
  </section>
  <section class="card"><h2>למידות אחרונות</h2>${st.sessions.slice(-8).reverse().map(x => `<p>${esc(courseName(st, x.courseId))} · ${formatMinutes(x.minutes)} · ${shortDate(x.date)}</p>`).join('') || '<p class="muted">עוד לא תועד זמן למידה. אפשר להפעיל שעון מתוך קורס או מההמלצה בבית.</p>'}
  <div class="actions">${btn(icon('download') + ' דוח שבועי (טקסט)', 'weekly-report')}</div></section>
  <p class="muted small">כל הנתונים כאן מחושבים מפעולות שתועדו: זמן למידה בשעון, כרטיסים שסומנו כנקראו, דירוג עצמי בתרגול ומשימות שסומנו. אין הערכת מוכנות למבחן.</p>`;
}

// ---------- More / settings ----------
export function more(st, ui, env) {
  const s = st.settings, ai = ui.ai;
  const radio = (name, value, label, cur) => `<label class="check"><input type="radio" name="${name}" value="${value}" ${cur === value ? 'checked' : ''} data-setting="${name}"> ${label}</label>`;
  const acc = env.account, sync = env.sync, push = env.push;
  return `${head('עוד')}
  <section class="card" aria-labelledby="acc-h"><h2 id="acc-h">חשבון וסנכרון</h2>
    ${acc ? `<p><span class="badge ok">מחובר</span> ${esc(acc.email)}</p>
      <p class="small muted" role="status">${sync.busy ? 'מסנכרן…' : sync.error ? esc(sync.error) : sync.dirty ? 'יש שינויים שממתינים לסנכרון.' : sync.at ? 'סונכרן לאחרונה: ' + new Date(sync.at).toLocaleString('he-IL') : 'עוד לא סונכרן.'}</p>
      <p class="hint">הנתונים נשמרים גם בענן (מסד נתונים פרטי בשרת של האפליקציה) ומתעדכנים אוטומטית בכל מכשיר שמחובר לאותו חשבון. קבצים מצורפים נכללים.</p>
      <div class="actions">${btn(icon('repeat') + ' סנכרון עכשיו', 'sync-now', '', 'primary')}${btn('התנתקות', 'logout', '', 'danger')}</div>`
    : `<p>התחברות עם חשבון Google שומרת את הנתונים בענן ומסנכרנת אותם בין הטלפון למחשב. בלי התחברות, הנתונים נשארים רק בדפדפן הזה.</p>
      <div class="actions">${btn(icon('people') + ' התחברות עם Google', 'login', '', 'primary')}</div>
      <p class="hint">רק חשבונות מורשים יכולים להתחבר. Google יציג אזהרה ש"האפליקציה לא אומתה", כי זו אפליקציה פרטית בשלב בדיקה.</p>`}
  </section>

  <section class="card" aria-labelledby="notif-h"><h2 id="notif-h">תזכורות</h2>
    ${push.support === 'install' ? '<p>באייפון, התראות זמינות רק כשהאפליקציה מותקנת במסך הבית: בספארי לוחצים שיתוף > "הוסף למסך הבית", ופותחים משם.</p>'
      : push.support === 'unsupported' ? '<p>הדפדפן הזה לא תומך בהתראות.</p>'
      : push.support === 'denied' ? '<p>ההתראות חסומות עבור האתר. אפשר לאפשר אותן בהגדרות הדפדפן או המכשיר.</p>'
      : push.on ? `<p><span class="badge ok">פועל</span> כל בוקר בסביבות 7:00 מגיעה התראה עם המבחנים, ההגשות והמשימות של היום ומחר - רק כשיש משהו.</p><div class="actions">${btn('שליחת התראת בדיקה', 'push-test')}${btn('כיבוי', 'push-disable', '', 'danger')}</div>`
      : `<p>תזכורת בוקר יומית עם מה שחשוב היום: מבחנים, הגשות ומשימות מתוכננות. נשלחת מהשרת לפי הנתונים המסונכרנים${acc ? '' : ', ולכן דורשת התחברות'}.</p><div class="actions">${btn(icon('timer') + ' הפעלת תזכורת בוקר', 'push-enable', '', 'primary', acc ? '' : 'disabled')}</div>`}
  </section>
  <ul class="rows">
    <li><a class="row-link" href="#lumi">${lumi(44)}<span class="grow"><span class="title">לומי</span><span class="sub">${ai.verified ? 'מחובר ל-AI' : 'מצב מקומי'}</span></span>${icon('chevron')}</a></li>
    <li><a class="row-link" href="#practice">${tile({ color: 'teal' }, 'repeat')}<span class="grow"><span class="title">תרגול וחזרה</span><span class="sub">${reviewQueue(st).length} שאלות ממתינות היום</span></span>${icon('chevron')}</a></li>
  </ul>

  <section class="card" aria-labelledby="disp-h"><h2 id="disp-h">תצוגה ונגישות</h2>
    <fieldset><legend>ערכת צבעים</legend>${radio('theme', 'dark', 'כהה', s.theme)}${radio('theme', 'light', 'בהירה', s.theme)}</fieldset>
    <label for="font-size">גודל טקסט: <output id="font-value" for="font-size">${s.font} פיקסלים</output></label>
    <input id="font-size" type="range" min="18" max="40" step="2" value="${s.font}" data-setting="font">
    <div class="actions">${btn('A-', 'font-step', '-2', '', 'aria-label="הקטנת טקסט"')}${btn('A+', 'font-step', '2', '', 'aria-label="הגדלת טקסט"')}</div>
    <label class="check"><input type="checkbox" data-setting="contrast" ${s.contrast ? 'checked' : ''}> ניגודיות גבוהה</label>
    <label class="check"><input type="checkbox" data-setting="motion" ${s.motion === 'reduce' ? 'checked' : ''}> הפחתת תנועה ואנימציות</label>
    <p class="hint">האפליקציה תומכת גם בהגדלת טקסט וזום של המערכת, ב-VoiceOver ובניווט מקלדת.</p>
  </section>

  <section class="card" aria-labelledby="me-h"><h2 id="me-h">פרטים ופנייה</h2>
    <label for="set-name">השם שלי (רשות)</label><input id="set-name" maxlength="150" value="${esc(s.name)}" data-setting="name" autocomplete="given-name">
    <label for="set-inst">מוסד לימודים (רשות)</label><input id="set-inst" maxlength="150" value="${esc(s.institution)}" data-setting="institution">
    <fieldset><legend>צורת פנייה של לומי</legend>${radio('address', 'f', 'נקבה', s.address)}${radio('address', 'm', 'זכר', s.address)}${radio('address', 'n', 'ניטרלית', s.address)}</fieldset>
  </section>

  <section class="card" aria-labelledby="voice-h"><h2 id="voice-h">הקראה ויעדים</h2>
    <label for="set-rate">מהירות הקראה</label><select id="set-rate" data-setting="speechRate">${[0.75, 0.9, 1, 1.25, 1.5].map(v => `<option value="${v}" ${s.speechRate === v ? 'selected' : ''}>${v}×</option>`).join('')}</select>
    <div class="actions">${btn(icon('headphones') + ' בדיקת קול עברי', 'test-voice')}</div>
    <p class="hint">ההקראה משתמשת בקול העברי המותקן במכשיר. באייפון: הגדרות > נגישות > תוכן מוקרא > קולות > עברית.</p>
    <label for="set-goal">יעד דקות ליום</label><input id="set-goal" type="number" min="5" max="480" value="${s.dailyGoal}" data-setting="dailyGoal" inputmode="numeric">
    <label for="set-min">אורך יחידת למידה (דקות)</label><input id="set-min" type="number" min="5" max="120" value="${s.minutes}" data-setting="minutes" inputmode="numeric">
  </section>

  <section class="card" aria-labelledby="ai-h"><h2 id="ai-h">לומי AI</h2>
    ${ai.configured === null ? '<p>בודק אם השרת זמין…</p>'
      : !ai.configured ? `<p><span class="badge">לא מוגדר</span></p><p>השרת של האפליקציה עדיין לא הוגדר עם ספק AI, ולכן לומי פועל במצב מקומי. ${ai.reason ? esc(ai.reason) : ''}</p><p class="hint">להפעלה: ב-Vercel מגדירים את משתני הסביבה GEMINI_API_KEY (או ANTHROPIC_API_KEY) ו-LUMI_ACCESS_CODE - קוד גישה פרטי שמונע שימוש של אחרים במפתח. המפתח נשמר רק בשרת.</p>`
      : ai.verified ? `<p><span class="badge ok">מחובר ומאומת</span>${ai.provider ? ' · ' + esc(ai.provider) : ''}</p><p>שאלות נשלחות לשרת יחד עם קטעים רלוונטיים מהסיכומים שלך בלבד. שום דבר לא נשמר בשרת.</p>${btn('ניתוק מהמכשיר הזה', 'ai-forget', '', 'danger')}`
      : `<p><span class="badge">דרוש קוד גישה</span></p><form id="ai-form"><label for="ai-code">קוד הגישה של לומי</label><input id="ai-code" name="code" type="password" autocomplete="current-password" maxlength="200" required><p class="hint">הקוד נשמר רק בדפדפן הזה ואינו נכלל בגיבויים.</p><button class="primary">חיבור ובדיקה</button></form>`}
  </section>

  <section class="card" aria-labelledby="int-h"><h2 id="int-h">חיבורים</h2>
    <div class="integration"><div><b>יומן (קובץ ICS)</b><p class="muted small" style="margin:0">ייצוא מועדי הגשה, מבחנים וימי למידה, עם תזכורת יום לפני. נפתח ביומן של אייפון, Google ו-Outlook.</p></div>${btn(icon('download') + ' ייצוא', 'export-ics')}</div>
    <div class="integration"><div><b>Moodle</b> ${env.moodle ? `<span class="badge ok">מחובר</span>` : '<span class="badge">לא מחובר</span>'}<p class="muted small" style="margin:0">${env.moodle ? `${esc(env.moodle.siteName || env.moodle.site)}${env.moodle.user ? ' · ' + esc(env.moodle.user) : ''}. מייבא קורסים ומועדי הגשה לפי בחירה.` : 'כל מוסד שמאפשר את אפליקציית Moodle לנייד. הסיסמה לא נשמרת - רק מפתח גישה, בדפדפן הזה בלבד.'}</p></div><div class="actions" style="margin:0">${env.moodle ? btn(icon('repeat') + ' סנכרון', 'moodle-sync', '', 'primary') + btn('ניתוק', 'moodle-forget', '', 'danger') : btn('חיבור', 'moodle-connect', '', 'primary')}</div></div>
    <div class="integration"><div><b>Google Calendar</b><p class="muted small" style="margin:0">מעתיק מועדי הגשה, מבחנים וימי למידה ליומן הראשי שלך, עם תזכורת ערב לפני. סנכרון חד-כיווני: שינויים ביומן לא חוזרים לאפליקציה. בכל סנכרון האירועים של StudyFlow מתעדכנים, ואירועים של משימות שבוצעו נמחקים.</p></div>${btn(icon('calendar') + ' סנכרון ליומן', 'calendar-sync')}</div>
    <div class="integration"><div><b>Google Drive</b><p class="muted small" style="margin:0">ייבוא מסמכי Google, מצגות Google ו-PowerPoint כשיעורים. נמצא בכל קורס, ליד "סיכום". הגישה לקריאה בלבד.</p></div></div>
  </section>

  <section class="card" aria-labelledby="data-h"><h2 id="data-h">נתונים, גיבוי ופרטיות</h2>
    <p>הנתונים נשמרים בדפדפן הזה (${Math.round(env.bytes / 1024)} KB)${env.account ? ' וגם בענן של החשבון' : '. בלי התחברות אין עותק בענן, וניקוי נתוני האתר מוחק אותם'}. מומלץ לייצא גיבוי מדי פעם.</p>
    <div class="actions">${btn(icon('download') + ' ייצוא גיבוי מלא', 'export', '', 'primary')}${btn('בקשת אחסון מתמשך', 'persist')}${btn('הורדת נתוני המקור', 'export-raw')}</div>
    <label for="backup-file">ייבוא גיבוי (מחליף את הנתונים אחרי בדיקה ואישור)</label><input id="backup-file" type="file" accept=".json,application/json">
    <div class="actions">${btn('ביטול השינוי האחרון', 'undo', '', '', env.canUndo ? '' : 'disabled')}${btn(icon('trash') + ' מחיקת כל הנתונים', 'delete-all', '', 'danger')}</div>
  </section>
  <p class="muted small">StudyFlow 0.5 · בטא. ${ai.verified ? 'לומי AI מחובר דרך השרת.' : 'אין AI מחובר.'} ${env.account ? 'סנכרון ענן פעיל.' : 'בלי התחברות אין סנכרון ענן.'} קבצי PDF ותמונות נשמרים להורדה בלבד.</p>`;
}

// ---------- Editor bodies ----------
export function courseFields(st, c) {
  const color = c?.color || COLORS[st.courses.length % COLORS.length], ic = c?.icon || ICONS[st.courses.length % ICONS.length];
  return `<label for="f-name">שם הקורס</label><input id="f-name" name="name" required maxlength="150" value="${esc(c?.name)}">
  <label for="f-instructor">מרצה (רשות)</label><input id="f-instructor" name="instructor" maxlength="150" value="${esc(c?.instructor)}">
  <label for="f-examDate">מועד מבחן (רשות)</label><input id="f-examDate" name="examDate" type="date" value="${esc(c?.examDate)}">
  <label for="f-description">תיאור או סילבוס קצר (רשות)</label><textarea id="f-description" name="description" maxlength="1000" rows="3">${esc(c?.description)}</textarea>
  <fieldset><legend>צבע</legend><div class="swatches">${COLORS.map(x => `<label class="c-${x}"><input type="radio" name="color" value="${x}" ${x === color ? 'checked' : ''}><span class="swatch" aria-hidden="true"></span>${COLOR_LABELS[x]}</label>`).join('')}</div></fieldset>
  <fieldset><legend>סמל</legend><div class="swatches">${ICONS.map(x => `<label><input type="radio" name="icon" value="${x}" ${x === ic ? 'checked' : ''}>${icon(x)} ${ICON_LABELS[x]}</label>`).join('')}</div></fieldset>`;
}
export function courseSelect(st, value = '', allowNone = false) {
  return `<label for="f-courseId">קורס</label><select id="f-courseId" name="courseId" ${allowNone ? '' : 'required'}>${allowNone ? `<option value="">ללא קורס</option>` : ''}${st.courses.filter(c => !c.archived || c.id === value).map(c => `<option value="${esc(c.id)}" ${c.id === value ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;
}
export function reviewFields(original, proposed, source) {
  return `<p>${source === 'ai' ? 'לומי הציע גרסה חדשה. אפשר לערוך אותה לפני האישור.' : 'עורכים את הגרסה המוצעת ורואים בדיוק מה ישתנה לפני השמירה.'} הסיכום המקורי לא ישתנה בלי אישור, והוא נשמר בגרסאות הקודמות.</p>
  <label for="f-proposed">הגרסה המוצעת</label><textarea id="f-proposed" name="proposed" rows="10" maxlength="200000">${esc(proposed)}</textarea>
  <div class="actions">${btn('עדכון תצוגת השינויים', 'refresh-diff')}</div>
  <h3 id="diff-h">השינויים: <span id="diff-stats"></span></h3>
  <div class="diff" id="diff" aria-labelledby="diff-h" tabindex="0"></div>
  <input type="hidden" name="source" value="${esc(source)}"><input type="hidden" name="original" value="${esc(original)}">`;
}
export { diffHTML, weeklyReport };

// ---------- Print / PDF ----------
export function printView(st, ui, noteId) {
  const n = st.notes.find(x => x.id === noteId);
  if (!n) return notFound('הסיכום לא נמצא.');
  const c = course(st, n.courseId), cards = noteCards(n);
  return `<div class="hide-print page-head"><a class="button icon-btn ghost" href="#lesson/${esc(n.id)}" aria-label="חזרה לשיעור">${icon('back')}</a><div style="flex:1"><h1 tabindex="-1">הדפסה / PDF</h1><p class="muted lead">${esc(n.title)} · ${cards.length} עמודים. בחלון ההדפסה בוחרים "שמירה כ-PDF".</p></div></div>
  <div class="actions hide-print">${btn(icon('doc') + ' הדפסה / שמירה כ-PDF', 'print', '', 'primary')}</div>
  <div class="print-deck">${cards.map((cd, i) => `<section class="print-slide" aria-label="עמוד ${i + 1}"><p class="print-meta">${esc(c?.name || '')} · ${esc(n.title)} · ${i + 1}/${cards.length}</p><h2>${esc(cd.title || n.title)}</h2>${formatBody(cd.body)}</section>`).join('')}</div>`;
}
