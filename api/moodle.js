// Moodle connector (Vercel Function). Works with any institution whose Moodle allows the mobile web service.
// The browser cannot call Moodle directly (CORS), so this endpoint relays two kinds of request:
//   {action:'token', site, username, password} -> {token, siteName}   (password is never stored or logged)
//   {action:'sync', site, token}               -> {siteName, courses, items}
// Guarded against SSRF: https only, public addresses only, no redirects, size and time limits.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const str = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;
const hits = new Map();
function limited(key, now) {
  const list = (hits.get(key) || []).filter(t => now - t < 600_000);
  list.push(now); hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 30;
}

export function privateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? privateAddress(mapped[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

/** Normalize a site URL and reject anything that is not a public https host. */
export async function checkSite(site, resolve = host => lookup(host, { all: true })) {
  let u;
  try { u = new URL(site.trim()); } catch { throw Object.assign(Error('bad_site'), { code: 'bad_site' }); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443') throw Object.assign(Error('bad_site'), { code: 'bad_site' });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || isIP(host)) throw Object.assign(Error('bad_site'), { code: 'bad_site' });
  let addrs;
  try { addrs = await resolve(host); } catch { throw Object.assign(Error('unreachable'), { code: 'unreachable' }); }
  if (!addrs.length || addrs.some(a => privateAddress(a.address))) throw Object.assign(Error('bad_site'), { code: 'bad_site' });
  return u.origin + u.pathname.replace(/\/(login\/.*|my\/.*|index\.php)?$/, '').replace(/\/$/, '');
}

const toDate = ts => {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  const d = new Date(ts * 1000 + 2 * 3600_000); // Israel time is close enough for a date-only deadline
  return d.toISOString().slice(0, 10);
};

export function createMoodleHandler({ fetchImpl, resolve, now = () => Date.now() }) {
  async function call(base, path, params) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const r = await fetchImpl(base + path, { method: 'POST', redirect: 'manual', signal: ctrl.signal, headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(params).toString() });
      if (r.status >= 300) throw Object.assign(Error('unreachable'), { code: r.status >= 300 && r.status < 400 ? 'redirected' : 'unreachable' });
      const text = await r.text();
      if (text.length > 3_000_000) throw Object.assign(Error('too_large'), { code: 'too_large' });
      try { return JSON.parse(text); } catch { throw Object.assign(Error('not_moodle'), { code: 'not_moodle' }); }
    } catch (e) {
      if (e.code) throw e;
      throw Object.assign(Error('unreachable'), { code: 'unreachable' });
    } finally { clearTimeout(timer); }
  }
  const ws = async (base, token, fn, extra = {}) => {
    const data = await call(base, '/webservice/rest/server.php', { wstoken: token, wsfunction: fn, moodlewsrestformat: 'json', ...extra });
    if (data && data.exception) throw Object.assign(Error(data.errorcode || 'moodle_error'), { code: data.errorcode === 'invalidtoken' ? 'invalid_token' : 'moodle_error', message: String(data.message || '').slice(0, 200) });
    return data;
  };

  return {
    async POST(request) {
      if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) return json(415, { error: 'unsupported_media_type' });
      const origin = request.headers.get('origin');
      if (origin && new URL(request.url).origin !== origin) return json(403, { error: 'forbidden_origin' });
      const text = await request.text();
      if (text.length > 4000) return json(413, { error: 'too_large' });
      let b;
      try { b = JSON.parse(text); } catch { return json(400, { error: 'invalid_json' }); }
      const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
      if (limited(ip, now())) return json(429, { error: 'rate_limited' });
      if (!b || !str(b.site, 300)) return json(400, { error: 'invalid_request' });
      try {
        const base = await checkSite(b.site, resolve);
        if (b.action === 'token') {
          if (!str(b.username, 200) || !str(b.password, 300)) return json(400, { error: 'invalid_request' });
          const t = await call(base, '/login/token.php', { username: b.username, password: b.password, service: 'moodle_mobile_app' });
          if (!t.token) return json(401, { error: t.errorcode === 'enablewsdescription' || t.errorcode === 'servicenotavailable' ? 'service_disabled' : 'login_failed', message: String(t.error || '').slice(0, 200) });
          const info = await ws(base, t.token, 'core_webservice_get_site_info');
          return json(200, { token: t.token, site: base, siteName: String(info.sitename || '').slice(0, 200), user: String(info.fullname || '').slice(0, 200) });
        }
        if (b.action === 'sync') {
          if (!str(b.token, 200) || !/^[A-Za-z0-9]+$/.test(b.token)) return json(400, { error: 'invalid_request' });
          const info = await ws(base, b.token, 'core_webservice_get_site_info');
          const courses = (await ws(base, b.token, 'core_enrol_get_users_courses', { userid: info.userid })) || [];
          const items = new Map();
          const ids = courses.map(c => c.id).slice(0, 80);
          if (ids.length) {
            const params = Object.fromEntries(ids.map((id, i) => [`courseids[${i}]`, id]));
            try {
              const a = await ws(base, b.token, 'mod_assign_get_assignments', params);
              for (const c of a.courses || []) for (const x of c.assignments || []) items.set('assign' + x.id, { id: 'assign' + x.id, courseId: c.id, name: String(x.name).slice(0, 200), due: toDate(x.duedate), kind: 'מטלה' });
            } catch { /* some sites disable assignment functions; calendar events below still help */ }
          }
          try {
            const ev = await ws(base, b.token, 'core_calendar_get_action_events_by_timesort', { timesortfrom: Math.floor(now() / 1000) - 7 * 86400, limitnum: 50 });
            for (const e of ev.events || []) {
              const key = (e.modulename === 'assign' ? 'assign' + e.instance : 'event' + e.id);
              if (!items.has(key) && e.course?.id) items.set(key, { id: key, courseId: e.course.id, name: String(e.activityname || e.name).slice(0, 200), due: toDate(e.timesort), kind: e.modulename === 'quiz' ? 'בוחן' : 'פעילות' });
            }
          } catch { /* optional */ }
          return json(200, {
            site: base, siteName: String(info.sitename || '').slice(0, 200),
            courses: courses.filter(c => c.visible !== 0).map(c => ({ id: c.id, fullname: String(c.fullname || c.shortname).slice(0, 150) })),
            items: [...items.values()].filter(i => courses.some(c => c.id === i.courseId)),
          });
        }
        return json(400, { error: 'invalid_request' });
      } catch (e) {
        const status = { bad_site: 400, invalid_token: 401, unreachable: 502, redirected: 502, not_moodle: 502, too_large: 502, moodle_error: 502 }[e.code] || 502;
        return json(status, { error: e.code || 'moodle_error', message: e.code === 'moodle_error' ? e.message : undefined });
      }
    },
  };
}

const handler = createMoodleHandler({ fetchImpl: (...a) => fetch(...a) });
export const POST = req => handler.POST(req);
