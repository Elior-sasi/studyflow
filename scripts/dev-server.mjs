// Local server for development and end-to-end tests.
// Serves the static app and routes /api/lumi to the real handler.
// --mock-ai uses a fake provider (no network, no key) so AI flows can be tested honestly as "mocked".
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../api/lumi.js';
import { createMoodleHandler } from '../api/moodle.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) || 4173);
const mock = process.argv.includes('--mock-ai');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const ALLOWED = new Set(['/index.html', '/app.mjs', '/model.mjs', '/content.mjs', '/views.mjs', '/icons.mjs', '/style.css', '/sw.js', '/manifest.webmanifest', '/icon.svg', '/importers.mjs', '/vendor/pptxgen.bundle.js']);

const fakeProvider = async (url, init) => {
  const body = JSON.parse(init.body);
  const user = body.messages.at(-1).content;
  let text;
  if (/"slides"/.test(body.system)) text = '{"slides":[{"title":"פתיחה (בדיקה)","bullets":["נקודה ראשונה","נקודה שנייה"],"notes":"הערה"},{"title":"סיכום","bullets":["סוף"]}]}';
  else if (/פודקאסט/.test(body.system)) text = '# פתיחה\nשלום וברוכים הבאים לפרק בדיקה.\n# סיכום\nזה הכול להיום.';
  else if (/<summary>/.test(user)) text = user.replace(/[\s\S]*<summary>\n|\n<\/summary>[\s\S]*/g, '').replace('מתקרבים', 'מתקרבים בקירוב') + '\n- נוסף סיכום קצר (תשובת בדיקה)';
  else if (/<source/.test(user)) text = '{"questions":[{"prompt":"מה מגדיר התפלגות נורמלית? (שאלת בדיקה)","answer":"ממוצע וסטיית תקן","source":1}]}';
  else text = /<source id="1"/.test(body.system) ? 'לפי הסיכום שלך, משפט הגבול המרכזי עוסק בממוצעים של מדגמים [1]. (תשובת בדיקה מספק מדומה)' : 'לא מצאתי את זה בסיכומים שלך. (תשובת בדיקה מספק מדומה)';
  return new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });
};
// Mock Moodle (with --mock-ai): password "right", one course, one assignment.
const fakeMoodle = async (url, init) => {
  const p = Object.fromEntries(new URLSearchParams(init.body));
  const reply = b => new Response(JSON.stringify(b), { status: 200 });
  if (url.endsWith('/login/token.php')) return reply(p.password === 'right' ? { token: 'mocktoken' } : { error: 'Invalid login', errorcode: 'invalidlogin' });
  if (p.wstoken !== 'mocktoken') return reply({ exception: 'x', errorcode: 'invalidtoken', message: 'bad' });
  const day = Math.floor(Date.now() / 1000) + 5 * 86400;
  return reply({
    core_webservice_get_site_info: { sitename: 'Moodle לבדיקה', fullname: 'משתמש בדיקה', userid: 1 },
    core_enrol_get_users_courses: [{ id: 101, fullname: 'מבוא לכלכלה', visible: 1 }],
    mod_assign_get_assignments: { courses: [{ id: 101, assignments: [{ id: 5, name: 'עבודה 1', duedate: day }] }] },
    core_calendar_get_action_events_by_timesort: { events: [] },
  }[p.wsfunction] || {});
};
const moodle = createMoodleHandler(mock ? { fetchImpl: fakeMoodle, resolve: async () => [{ address: '93.184.216.34' }] } : { fetchImpl: fetch });
const api = createHandler({ env: mock ? { ANTHROPIC_API_KEY: 'mock', LUMI_ACCESS_CODE: 'test-code' } : process.env, fetchImpl: mock ? fakeProvider : fetch });
const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const security = Object.fromEntries(vercel.headers[0].headers.map(h => [h.key, h.value.replace(' upgrade-insecure-requests', '')]));

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/api/lumi' || url.pathname === '/api/moodle') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: { ...req.headers, origin: req.headers.origin || url.origin }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
    const h = url.pathname === '/api/moodle' ? moodle : api;
    const r = await (req.method === 'POST' ? h.POST(request) : (h.GET ? h.GET(request) : new Response('', { status: 405 })));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const path = url.pathname === '/' ? '/index.html' : normalize(url.pathname);
  if (!ALLOWED.has(path)) { res.writeHead(404); res.end('not found'); return; }
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache', ...security });
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`StudyFlow on http://localhost:${port}${mock ? ' (mock AI)' : ''}`));
