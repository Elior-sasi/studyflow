// End-to-end tests in real Chrome at an iPhone-sized viewport.
// Run: npm run e2e   (CHROME_PATH can point to a Chrome/Chromium binary)
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
const AXE = await readFile(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

let server, browser, ctx, page;
const errors = [];

test.before(async () => {
  server = spawn(process.execPath, ['scripts/dev-server.mjs', '--mock-ai', `--port=${PORT}`], { cwd: new URL('../..', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => server.stdout.once('data', r));
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'he-IL', hasTouch: true, acceptDownloads: true });
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  await page.goto(BASE + '/#home');
});
test.after(async () => { await browser?.close(); server?.kill(); });

async function axe(name) {
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(AXE + '\n;0');
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
    return r.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
  });
  assert.deepEqual(result, [], `axe violations on ${name}`);
}
const main = () => page.locator('main');
const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(150); };
const save = () => page.locator('#editor-submit').click();

test('first run is empty, honest and accessible', async () => {
  await assert.doesNotReject(page.locator('h1').first().waitFor());
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  assert.match(await main().innerText(), /עוד אין נתונים/);
  assert.doesNotMatch(await main().innerText(), /\d+%/);
  await axe('home (empty)');
  await go('progress');
  assert.match(await main().innerText(), /אין עדיין כרטיסי שיעור|אחרי שמוסיפים סיכום/);
  await axe('progress (empty)');
});

test('create a course and a summary, then read it as cards with persistence', async () => {
  await go('home');
  await page.getByRole('button', { name: 'הוספת קורס ראשון' }).click();
  await page.getByLabel('שם הקורס').fill('סטטיסטיקה');
  await page.getByLabel('מרצה (רשות)').fill('ד״ר לוי');
  await page.getByLabel('סגול').check();
  await save();
  await page.waitForURL(/#course\//);
  assert.match(await page.locator('h1').innerText(), /סטטיסטיקה/);
  await axe('course detail');

  await page.getByRole('button', { name: 'סיכום' }).first().click();
  await page.getByLabel('כותרת').fill('התפלגויות');
  await page.getByLabel('תוכן הסיכום').fill('# התפלגות נורמלית\n- התפלגות רציפה בצורת פעמון\n- מוגדרת על ידי **ממוצע** וסטיית תקן\n\n# משפט הגבול המרכזי\nממוצעים של מדגמים גדולים מתקרבים להתפלגות נורמלית.\n\n# שונות\nמדד לפיזור הערכים סביב הממוצע.');
  await save();
  await page.waitForURL(/#lesson\//);
  assert.match(await main().innerText(), /כרטיס 1 מתוך 3/);
  assert.equal(await page.locator('.slide strong').innerText(), 'ממוצע');
  await axe('lesson slides');

  await page.getByRole('button', { name: /הכרטיס הבא/ }).click();
  assert.match(await main().innerText(), /כרטיס 2 מתוך 3/);
  assert.match(await main().innerText(), /1 מתוך 3 כרטיסים נקראו/);
  // keyboard: ArrowRight goes back in RTL
  await page.locator('body').press('ArrowRight');
  assert.match(await main().innerText(), /כרטיס 1 מתוך 3/);
  await page.locator('body').press('ArrowLeft');

  await page.reload();
  await page.waitForTimeout(300);
  assert.match(await main().innerText(), /כרטיס 2 מתוך 3/, 'resumes at the saved card');
  await page.getByRole('button', { name: /הכרטיס הבא/ }).click();
  await page.getByRole('button', { name: /סיום השיעור/ }).click();
  assert.match(await main().innerText(), /3 מתוך 3 כרטיסים נקראו/);

  await go('courses');
  assert.match(await main().innerText(), /כיסוי חומר 100%/);
  await page.getByRole('button', { name: 'הושלמו' }).click();
  assert.equal(await page.getByRole('button', { name: 'הושלמו' }).getAttribute('aria-pressed'), 'true');
  assert.match(await main().innerText(), /סטטיסטיקה/);
  await axe('courses');
});

test('planner: add today task, complete it, see it in progress', async () => {
  await go('plan');
  await page.getByRole('button', { name: 'הוספה ליום הזה' }).click();
  await page.getByLabel('קורס').selectOption({ label: 'סטטיסטיקה' });
  await page.getByLabel('שם', { exact: true }).fill('תרגיל 3');
  await page.getByLabel('זמן מתוכנן בדקות').fill('50');
  await save();
  assert.match(await main().innerText(), /50 דקות/);
  await axe('planner day');
  await page.getByRole('button', { name: 'סימון כבוצע: תרגיל 3' }).click();
  assert.equal(await page.getByRole('button', { name: 'סימון כלא בוצע: תרגיל 3' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'החודש' }).click();
  await axe('planner month');
  await page.getByRole('button', { name: 'השבוע' }).click();
  await axe('planner week');
  await go('progress');
  assert.match(await main().innerText(), /1 משימות הושלמו/);
  assert.match(await page.locator('.ring').getAttribute('aria-label'), /100%/);
  await axe('progress');
});

test('practice with spaced repetition', async () => {
  await go('practice');
  await page.getByRole('button', { name: 'שאלה חדשה' }).click();
  await page.getByLabel('שאלה').fill('מה מגדיר התפלגות נורמלית?');
  await page.getByLabel('תשובה').fill('ממוצע וסטיית תקן');
  await save();
  await page.getByRole('button', { name: /התחלת סבב חזרה/ }).click();
  await page.getByRole('button', { name: 'הצגת התשובה' }).click();
  assert.match(await main().innerText(), /ממוצע וסטיית תקן/);
  await axe('practice revealed');
  await page.getByRole('button', { name: 'ידעתי' }).click();
  assert.match(await page.locator('#status').innerText(), /הסבב הסתיים/);
  await page.locator('summary', { hasText: 'סטטיסטיקה' }).click();
  assert.match(await main().innerText(), /1\/1 נענו נכון/);
});

test('summary review: preview a diff and accept, with version history', async () => {
  await go('courses');
  await page.locator('a.row-link', { hasText: 'סטטיסטיקה' }).first().click();
  await page.locator('a.row-link', { hasText: 'התפלגויות' }).click();
  await page.getByRole('button', { name: 'סיכום', exact: true }).click();
  await page.getByRole('button', { name: /הצעת שינויים ובדיקה/ }).click();
  const box = page.getByLabel('הגרסה המוצעת');
  await box.fill((await box.inputValue()).replace('מדד לפיזור', 'מדד מרכזי לפיזור'));
  await page.getByRole('button', { name: 'עדכון תצוגת השינויים' }).click();
  assert.match(await page.locator('#diff').innerText(), /\[הוספה:/);
  assert.match(await page.locator('#diff-stats').innerText(), /נוספו/);
  await axe('review dialog');
  await page.getByRole('button', { name: 'אישור ושמירת השינויים' }).click();
  assert.match(await main().innerText(), /מדד מרכזי לפיזור/);
  assert.match(await main().innerText(), /1 גרסאות שמורות/);
});

test('Lumi: honest local mode, then mocked server AI with access code and cited sources', async () => {
  await go('lumi');
  assert.match(await main().innerText(), /AI זמין - נדרש קוד גישה/);
  await go('more');
  await page.getByLabel('קוד הגישה של לומי').fill('wrong');
  await page.getByRole('button', { name: 'חיבור ובדיקה' }).click();
  await page.waitForTimeout(300);
  assert.match(await page.locator('#status').innerText(), /קוד הגישה שגוי/);
  await page.getByLabel('קוד הגישה של לומי').fill('test-code');
  await page.getByRole('button', { name: 'חיבור ובדיקה' }).click();
  await page.locator('.badge.ok', { hasText: 'מחובר ומאומת' }).waitFor();
  await axe('more/settings');
  await go('lumi');
  await page.getByLabel('הודעה ללומי').fill('מה אומר משפט הגבול המרכזי?');
  await page.getByRole('button', { name: 'שליחה' }).click();
  await page.locator('.bubble.bot a').first().waitFor();
  const text = await page.locator('#chat-log').innerText();
  assert.match(text, /\[1\]/);
  assert.match(text, /משפט הגבול המרכזי/);
  assert.match(await page.locator('.bubble.bot a').first().getAttribute('href'), /#lesson\/.+\/1/);
  await axe('lumi chat');
});

test('AI proposals never overwrite without approval', async () => {
  await go('courses');
  await page.getByRole('button', { name: 'הכל' }).click();
  await page.locator('a.row-link', { hasText: 'סטטיסטיקה' }).first().click();
  await page.locator('a.row-link', { hasText: 'התפלגויות' }).click();
  await page.getByRole('button', { name: 'סיכום', exact: true }).click();
  const before = await main().innerText();
  await page.getByRole('button', { name: /לומי: הצעת שיפור/ }).click();
  await page.locator('#diff ins').first().waitFor();
  await page.locator('#cancel-editor').click();
  assert.equal(await main().innerText(), before, 'rejecting keeps the original');
  await page.getByRole('button', { name: 'שאלות', exact: true }).click();
  await page.getByRole('button', { name: /לומי: הצעת שאלות/ }).click();
  await page.getByText('שאלת בדיקה').first().waitFor();
  await save();
  assert.match(await page.locator('#status').innerText(), /1 שאלות נוספו/);
});

test('PowerPoint import, PowerPoint export and print view', async () => {
  await go('courses');
  await page.getByRole('button', { name: 'הכל' }).click();
  await page.locator('a.row-link', { hasText: 'סטטיסטיקה' }).first().click();
  await page.getByRole('button', { name: 'סיכום' }).first().click();
  await page.locator('#note-import').setInputFiles(new URL('../fixtures/sample.pptx', import.meta.url).pathname);
  await page.waitForFunction(() => document.getElementById('f-text').value.includes('# התפלגות נורמלית'));
  assert.equal(await page.getByLabel('כותרת').inputValue(), 'sample');
  await save();
  await page.waitForURL(/#lesson\//);
  assert.match(await main().innerText(), /כרטיס 1 מתוך 2/);
  assert.match(await main().innerText(), /יובא מקובץ/);
  await page.getByRole('button', { name: 'סיכום', exact: true }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא PowerPoint' }).click()]);
  assert.match(dl.suggestedFilename(), /\.pptx$/);
  const { pptxToMarkdown } = await import('../../importers.mjs');
  const back = await pptxToMarkdown(await readFile(await dl.path()));
  assert.equal(back.slides, 3, 'cover plus two slides');
  assert.match(back.markdown, /התפלגות נורמלית/);
  assert.match(back.markdown, /הערות המרצה: להדגיש/);
  await page.getByRole('button', { name: 'הדפסה / PDF' }).click();
  await page.waitForURL(/#print\//);
  await page.locator('.print-slide').first().waitFor();
  assert.equal(await page.locator('.print-slide').count(), 2);
  await axe('print view');
});

test('Lumi creates a presentation and a podcast from a summary (mocked provider)', async () => {
  await page.evaluate(() => history.back());
  await page.waitForURL(/#lesson\//);
  await page.getByRole('button', { name: 'סיכום', exact: true }).click();
  await page.getByRole('button', { name: /לומי: יצירת מצגת/ }).click();
  await page.waitForFunction(() => document.querySelector('main').innerText.includes('מצגת שלומי יצר'));
  assert.match(await main().innerText(), /פתיחה \(בדיקה\)/);
  assert.match(await main().innerText(), /כרטיס 1 מתוך 2/);
  await page.getByRole('button', { name: 'סיכום', exact: true }).click();
  await page.getByRole('button', { name: /לומי: יצירת פודקאסט/ }).click();
  await page.waitForFunction(() => document.querySelector('main').innerText.includes('פודקאסט שלומי כתב'));
  assert.equal(await page.locator('#continuous').isChecked(), true);
  assert.equal(await page.getByRole('button', { name: /פקודות קוליות/ }).count(), 1);
  await axe('podcast lesson');
});

test('Moodle: wrong password refused, then courses and deadlines imported once', async () => {
  await go('more');
  await page.getByRole('button', { name: 'חיבור', exact: true }).click();
  await page.getByLabel('כתובת האתר').fill('https://moodle.example.ac.il');
  await page.getByLabel('שם משתמש').fill('student');
  await page.getByLabel('סיסמה').fill('wrong');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await page.locator('#form-error', { hasText: 'שגויים' }).waitFor();
  await page.getByLabel('סיסמה').fill('right');
  await page.getByRole('button', { name: 'התחברות', exact: true }).click();
  await page.locator('#editor-title', { hasText: 'ייבוא מ-Moodle לבדיקה' }).waitFor();
  await axe('moodle import dialog');
  await page.getByRole('button', { name: 'ייבוא הנבחרים' }).click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#status').innerText(), /יובאו 1 קורסים ו-1 מטלות/);
  assert.match(await main().innerText(), /Moodle לבדיקה/);
  await page.getByRole('button', { name: 'סנכרון', exact: true }).click();
  await page.locator('#editor-title', { hasText: 'ייבוא מ-' }).waitFor();
  await page.getByRole('button', { name: 'ייבוא הנבחרים' }).click();
  await page.waitForTimeout(200);
  assert.match(await page.locator('#status').innerText(), /יובאו 0 קורסים ו-0 מטלות/);
  await go('courses');
  assert.match(await main().innerText(), /מבוא לכלכלה/);
  await go('plan');
  await page.getByRole('button', { name: 'השבוע', exact: true }).click();
  const week = await main().innerText() + (await page.getByRole('button', { name: 'השבוע הבא' }).click(), await main().innerText());
  assert.match(week, /עבודה 1/);
});

async function signIn(p) {
  await p.evaluate(() => sessionStorage.setItem('sf-oauth', JSON.stringify({ state: 's1', nonce: 'n1', purpose: 'login', returnHash: '#more' })));
  await p.goto(BASE + '/?r=' + Math.random() + '#access_token=at&id_token=mock.id.token&state=s1&expires_in=3600&scope=openid');
  await p.locator('.badge.ok', { hasText: 'מחובר' }).first().waitFor();
  await p.waitForFunction(() => /סונכרן לאחרונה/.test(document.querySelector('main').innerText), null, { timeout: 10000 });
}

test('Google account sync: a second device receives the data, edits flow back, conflicts ask the user', async () => {
  await signIn(page);
  assert.equal(await page.evaluate(() => location.hash), '#more', 'OAuth fragment removed from the address bar');
  await axe('more with account');
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' });
  const p2 = await phone.newPage();
  p2.on('pageerror', e => errors.push('phone: ' + e.message));
  await p2.goto(BASE + '/#home');
  await signIn(p2);
  await p2.evaluate(() => { location.hash = 'courses'; });
  await p2.locator('main', { hasText: 'סטטיסטיקה' }).waitFor();
  // phone adds a course; laptop pulls it
  await p2.evaluate(() => { location.hash = 'home'; });
  await p2.getByRole('button', { name: 'קורס', exact: true }).click();
  await p2.getByLabel('שם הקורס').fill('קורס מהטלפון');
  await p2.locator('#editor-submit').click();
  await p2.waitForFunction(() => JSON.parse(localStorage.getItem('studyflow-sync')).dirty === false, null, { timeout: 10000 });
  await go('more');
  await page.getByRole('button', { name: 'סנכרון עכשיו' }).click();
  await page.waitForTimeout(500);
  await go('courses');
  assert.match(await main().innerText(), /קורס מהטלפון/);
  // both change; the laptop gets a conflict dialog
  await p2.evaluate(() => { location.hash = 'home'; });
  await p2.getByRole('button', { name: 'קורס', exact: true }).click();
  await p2.getByLabel('שם הקורס').fill('עוד מהטלפון');
  await p2.locator('#editor-submit').click();
  await p2.waitForFunction(() => JSON.parse(localStorage.getItem('studyflow-sync')).dirty === false, null, { timeout: 10000 });
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('studyflow-sync')); localStorage.setItem('studyflow-sync', JSON.stringify({ ...m, dirty: true })); });
  await go('more');
  await page.getByRole('button', { name: 'סנכרון עכשיו' }).click();
  await page.locator('#editor-title', { hasText: 'יש שינויים בשני מכשירים' }).waitFor();
  await axe('sync conflict dialog');
  await page.locator('#editor-submit').click();
  await go('courses');
  assert.match(await main().innerText(), /עוד מהטלפון/);
  await phone.close();
});

test('backup export, delete everything, import restores it', async () => {
  await go('more');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא גיבוי מלא' }).click()]);
  const path = await dl.path();
  const backup = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(backup.version, 3);
  assert.equal(backup.courses[0].name, 'סטטיסטיקה');
  assert.equal(JSON.stringify(backup).includes('test-code'), false, 'AI code is never in backups');
  assert.equal(JSON.stringify(backup).includes('mocktoken'), false, 'Moodle token is never in backups');
  assert.equal(/"session"|studyflow-sync/.test(JSON.stringify(backup)), false, 'account session is never in backups');
  const [ics] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'ייצוא', exact: true }).click()]);
  assert.match(await readFile(await ics.path(), 'utf8'), /BEGIN:VCALENDAR/);

  await page.getByRole('button', { name: 'מחיקת כל הנתונים' }).click();
  await page.waitForURL(/#home/);
  assert.match(await main().innerText(), /עוד אין נתונים/);
  await go('more');
  await page.locator('#backup-file').setInputFiles(path);
  await page.waitForTimeout(300);
  await go('courses');
  await page.getByRole('button', { name: 'הכל' }).click();
  assert.match(await main().innerText(), /סטטיסטיקה/);
  assert.match(await main().innerText(), /כיסוי חומר \d+%/);
  // corrupt import is rejected without changing data
  await go('more');
  await page.locator('#backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":3,"courses":"x"}') });
  await page.waitForTimeout(200);
  assert.match(await page.locator('#status').innerText(), /אינו תקין/);
  await go('courses');
  assert.match(await main().innerText(), /סטטיסטיקה/);
});

test('large text, light theme and high contrast reflow at 320px without horizontal scroll', async () => {
  await go('more');
  await page.getByLabel('בהירה').check();
  await page.getByLabel('ניגודיות גבוהה').check();
  await page.getByLabel('ניגודיות גבוהה').uncheck();
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'הגדלת טקסט' }).click();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '40px');
  await page.setViewportSize({ width: 320, height: 700 });
  for (const r of ['home', 'courses', 'plan', 'progress', 'more', 'lumi']) {
    await go(r);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const culprits = overflow > 1 ? await page.evaluate(() => { const W = document.documentElement.clientWidth; return [...document.querySelectorAll('main *, #dock *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.left < -1 || b.right > W + 1) && !e.closest('.sr-only'); }).slice(0, 4).map(e => e.tagName + '.' + e.className + ':' + (e.textContent || '').trim().slice(0, 24)); }) : [];
    assert.ok(overflow <= 1, `${r} overflows by ${overflow}px at 40px text: ${culprits.join(' | ')}`);
  }
  await go('home');
  await axe('home light theme, 40px');
  await go('more');
  await page.getByLabel('ניגודיות גבוהה').check();
  await axe('more, high contrast, 40px');
  // tap targets
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a.button, #tabbar a')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length);
  assert.equal(small, 0, 'all visible controls are at least 44px');
  await page.getByLabel('ניגודיות גבוהה').uncheck();
  await page.getByLabel('כהה').check();
  for (let i = 0; i < 11; i++) await page.getByRole('button', { name: 'הקטנת טקסט' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
});

test('works offline after the first visit', async () => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.setOffline(true);
  await page.reload();
  await page.locator('h1').first().waitFor();
  await go('courses');
  assert.match(await main().innerText(), /סטטיסטיקה/);
  await ctx.setOffline(false);
});

test('no runtime errors were logged', () => {
  assert.deepEqual(errors.filter(e => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_FAILED|status of 401/.test(e)), []);
});
