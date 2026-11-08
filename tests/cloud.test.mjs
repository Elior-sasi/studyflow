import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonHTML, saveLessonToDrive, calendarEvents } from '../cloud.mjs';

const note = { id: 'n1', courseId: 'c1', title: 'התפלגות <b>', text: '# פתיחה\n- **חשוב**\n# סוף\nטקסט', updatedAt: '2026-11-08T00:00:00Z' };

test('lesson export to a Google Doc is RTL, escaped and keeps card headings', () => {
  const html = lessonHTML(note, 'סטטיסטיקה');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<h1>התפלגות &lt;b&gt;<\/h1>/);
  assert.match(html, /<h2>פתיחה<\/h2><ul><li><strong>חשוב<\/strong><\/li><\/ul>/);
  assert.doesNotMatch(html, /<b>/);
});

test('saving to Drive creates a StudyFlow folder and a Google Doc with drive.file only', async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body, auth: init.headers?.authorization });
    if (url.includes('/upload/')) return new Response(JSON.stringify({ id: 'doc1', name: 'סטטיסטיקה - התפלגות <b>', webViewLink: 'https://docs.google.com/document/d/doc1' }), { status: 200 });
    return new Response(JSON.stringify({ id: 'folder1' }), { status: 200 });
  };
  const r = await saveLessonToDrive('tok', note, 'סטטיסטיקה');
  assert.equal(r.link, 'https://docs.google.com/document/d/doc1');
  const folder = calls.find(c => c.url.startsWith('https://www.googleapis.com/drive/v3/files?'));
  assert.match(folder.body, /application\/vnd.google-apps.folder/);
  const up = calls.find(c => c.url.includes('/upload/'));
  assert.equal(up.method, 'POST');
  assert.match(up.body, /"mimeType":"application\/vnd.google-apps.document"/);
  assert.match(up.body, /"parents":\["folder1"\]/);
  assert.ok(calls.every(c => c.auth === 'Bearer tok'));
});

test('calendar events cover open deadlines, study days and exam dates only', () => {
  const ev = calendarEvents({ courses: [{ id: 'c1', name: 'סטטיסטיקה', examDate: '2026-12-01', archived: false }], tasks: [
    { id: 't1', courseId: 'c1', title: 'מטלה', date: '2026-11-20', planned: '2026-11-18', minutes: 30, done: false, kind: 'assignment' },
    { id: 't2', courseId: 'c1', title: 'בוצעה', date: '2026-11-21', planned: '', minutes: 30, done: true, kind: 'assignment' },
    { id: 't3', courseId: '', title: 'הפסקה', date: '', planned: '2026-11-18', minutes: 10, done: false, kind: 'break' }] });
  assert.deepEqual(ev.map(e => e.key), ['t1-due', 't1-plan', 'c1-exam']);
  assert.equal(ev[0].remind, true);
});
