import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoodleHandler, checkSite, privateAddress } from '../api/moodle.js';

const publicDNS = async () => [{ address: '93.184.216.34' }];
let n = 0;
const post = body => new Request('https://app.example/api/moodle', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.1.' + (++n) }, body: JSON.stringify(body) });

function fakeMoodle(overrides = {}) {
  const calls = [];
  const fn = async (url, init) => {
    const p = Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ url, p });
    const reply = b => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith('/login/token.php')) return reply(p.password === 'right' ? { token: 'abc123' } : { error: 'Invalid login', errorcode: 'invalidlogin' });
    if (p.wstoken !== 'abc123') return reply({ exception: 'x', errorcode: 'invalidtoken', message: 'bad' });
    const fnName = p.wsfunction;
    if (overrides[fnName]) return reply(overrides[fnName](p));
    if (fnName === 'core_webservice_get_site_info') return reply({ sitename: 'מודל לדוגמה', fullname: 'אליאור', userid: 5 });
    if (fnName === 'core_enrol_get_users_courses') return reply([{ id: 7, fullname: 'סטטיסטיקה', visible: 1 }, { id: 9, fullname: 'מוסתר', visible: 0 }]);
    if (fnName === 'mod_assign_get_assignments') return reply({ courses: [{ id: 7, assignments: [{ id: 11, name: 'מטלה 1', duedate: 1795000000 }] }] });
    if (fnName === 'core_calendar_get_action_events_by_timesort') return reply({ events: [{ id: 3, modulename: 'quiz', instance: 4, name: 'בוחן', activityname: 'בוחן אמצע', timesort: 1795100000, course: { id: 7 } }, { id: 4, modulename: 'assign', instance: 11, name: 'dup', timesort: 1, course: { id: 7 } }] });
    return reply({});
  };
  fn.calls = calls;
  return fn;
}

test('only public https Moodle hosts are allowed', async () => {
  for (const bad of ['http://moodle.example', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://user:pw@moodle.example', 'https://moodle.example:8443', 'javascript:alert(1)', 'https://x.internal']) {
    await assert.rejects(checkSite(bad, publicDNS), { code: 'bad_site' }, bad);
  }
  await assert.rejects(checkSite('https://evil.example', async () => [{ address: '10.0.0.5' }]), { code: 'bad_site' });
  await assert.rejects(checkSite('https://evil.example', async () => [{ address: '::ffff:192.168.1.1' }]), { code: 'bad_site' });
  assert.equal(await checkSite('https://moodle.example.ac.il/moodle/my/', publicDNS), 'https://moodle.example.ac.il/moodle');
  assert.equal(await checkSite('https://moodle.example.ac.il/login/index.php', publicDNS), 'https://moodle.example.ac.il');
  assert.equal(privateAddress('172.20.1.1'), true);
  assert.equal(privateAddress('8.8.8.8'), false);
});

test('login exchanges credentials for a token without echoing the password', async () => {
  const f = fakeMoodle(), h = createMoodleHandler({ fetchImpl: f, resolve: publicDNS });
  const bad = await h.POST(post({ action: 'token', site: 'https://moodle.example.ac.il', username: 'u', password: 'wrong' }));
  assert.equal(bad.status, 401);
  assert.equal((await bad.json()).error, 'login_failed');
  const ok = await h.POST(post({ action: 'token', site: 'https://moodle.example.ac.il', username: 'u', password: 'right' }));
  const body = await ok.json();
  assert.equal(body.token, 'abc123');
  assert.equal(body.siteName, 'מודל לדוגמה');
  assert.doesNotMatch(JSON.stringify(body), /right/);
  assert.equal(f.calls[0].p.service, 'moodle_mobile_app');
});

test('sync returns visible courses and merged deadlines', async () => {
  const h = createMoodleHandler({ fetchImpl: fakeMoodle(), resolve: publicDNS, now: () => 1794000000000 });
  const r = await h.POST(post({ action: 'sync', site: 'https://moodle.example.ac.il', token: 'abc123' }));
  const b = await r.json();
  assert.deepEqual(b.courses, [{ id: 7, fullname: 'סטטיסטיקה' }]);
  assert.deepEqual(b.items.map(i => i.name).sort(), ['בוחן אמצע', 'מטלה 1']);
  assert.match(b.items.find(i => i.name === 'מטלה 1').due, /^\d{4}-\d{2}-\d{2}$/);
  const expired = await h.POST(post({ action: 'sync', site: 'https://moodle.example.ac.il', token: 'zzz' }));
  assert.equal(expired.status, 401);
  assert.equal((await expired.json()).error, 'invalid_token');
});

test('redirects, non-Moodle pages and bad input are refused', async () => {
  const redirect = createMoodleHandler({ fetchImpl: async () => new Response('', { status: 302, headers: { location: 'http://10.0.0.1' } }), resolve: publicDNS });
  assert.equal((await (await redirect.POST(post({ action: 'token', site: 'https://m.example', username: 'u', password: 'p' }))).json()).error, 'redirected');
  const html = createMoodleHandler({ fetchImpl: async () => new Response('<html>', { status: 200 }), resolve: publicDNS });
  assert.equal((await (await html.POST(post({ action: 'token', site: 'https://m.example', username: 'u', password: 'p' }))).json()).error, 'not_moodle');
  const h = createMoodleHandler({ fetchImpl: fakeMoodle(), resolve: publicDNS });
  assert.equal((await h.POST(post({ action: 'sync', site: 'https://m.example', token: 'a b' }))).status, 400);
  assert.equal((await h.POST(post({ action: 'nope', site: 'https://m.example' }))).status, 400);
});
