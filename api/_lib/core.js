// Shared server code for account, sync and notifications. Files in api/_lib are not exposed as endpoints.
// Secrets: everything is derived from DATABASE_URL (already a server secret from the Neon integration),
// so no extra secret had to be created by hand.
import { createHmac, createECDH, timingSafeEqual } from 'node:crypto';

export const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra } });
export const GOOGLE_CLIENT_ID = '870684431597-vmg2gtfn383s0lcjgfomemhstci7spr8.apps.googleusercontent.com';

const b64u = buf => Buffer.from(buf).toString('base64url');
function derive(env, label) {
  if (!env.DATABASE_URL) throw Object.assign(Error('not_configured'), { code: 'not_configured' });
  return createHmac('sha256', env.DATABASE_URL).update('studyflow:' + label).digest();
}

// ---------- Sessions (HMAC-signed, 120 days) ----------
export function signSession(env, user, now = Date.now()) {
  const body = b64u(JSON.stringify({ sub: user.sub, email: user.email, exp: now + 120 * 86400_000 }));
  return body + '.' + b64u(createHmac('sha256', derive(env, 'session')).update(body).digest());
}
export function readSession(env, token, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = createHmac('sha256', derive(env, 'session')).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    return s.exp > now && s.sub ? s : null;
  } catch { return null; }
}
export function sessionFrom(env, request) {
  const h = request.headers.get('authorization') || '';
  return readSession(env, h.startsWith('Bearer ') ? h.slice(7) : '');
}
export function allowed(env, email) {
  const list = String(env.STUDYFLOW_ALLOWED_EMAILS || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return list.length > 0 && list.includes(String(email).toLowerCase());
}

// ---------- Google ID token verification (Google's tokeninfo endpoint) ----------
export async function verifyIdToken(idToken, fetchImpl, now = Date.now()) {
  if (typeof idToken !== 'string' || idToken.length > 4000 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) return null;
  const r = await fetchImpl('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
  if (!r.ok) return null;
  const t = await r.json();
  const okIss = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (!okIss || t.aud !== GOOGLE_CLIENT_ID || Number(t.exp) * 1000 < now || String(t.email_verified) !== 'true' || !t.sub) return null;
  return { sub: String(t.sub), email: String(t.email), name: String(t.name || ''), nonce: t.nonce };
}

// ---------- Web Push VAPID keys, deterministic from the server secret ----------
export function vapidKeys(env) {
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(derive(env, 'vapid'));
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

// ---------- Storage ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sf_state (sub text PRIMARY KEY, email text NOT NULL, version integer NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sf_push (endpoint text PRIMARY KEY, sub text NOT NULL, keys jsonb NOT NULL, hour smallint NOT NULL DEFAULT 7, created_at timestamptz NOT NULL DEFAULT now())`,
];
export function neonStore(sql) {
  let ready = null;
  const init = () => (ready ??= (async () => { for (const q of SCHEMA) await sql.query(q); })());
  return {
    async get(sub) { await init(); const r = await sql.query('SELECT version, data, updated_at FROM sf_state WHERE sub = $1', [sub]); return r[0] ? { version: r[0].version, data: r[0].data, updatedAt: new Date(r[0].updated_at).toISOString() } : null; },
    /** Compare-and-set: succeeds only if the stored version equals base (0 = no row yet). */
    async put(sub, email, base, data) {
      await init();
      const text = JSON.stringify(data);
      const r = base === 0
        ? await sql.query('INSERT INTO sf_state (sub, email, version, data) VALUES ($1, $2, 1, $3::jsonb) ON CONFLICT (sub) DO NOTHING RETURNING version, updated_at', [sub, email, text])
        : await sql.query('UPDATE sf_state SET version = version + 1, data = $3::jsonb, email = $2, updated_at = now() WHERE sub = $1 AND version = $4 RETURNING version, updated_at', [sub, email, text, base]);
      return r[0] ? { version: r[0].version, updatedAt: new Date(r[0].updated_at).toISOString() } : null;
    },
    async remove(sub) { await init(); await sql.query('DELETE FROM sf_state WHERE sub = $1', [sub]); await sql.query('DELETE FROM sf_push WHERE sub = $1', [sub]); },
    async addSub(sub, endpoint, keys) { await init(); await sql.query('INSERT INTO sf_push (endpoint, sub, keys) VALUES ($1, $2, $3::jsonb) ON CONFLICT (endpoint) DO UPDATE SET sub = $2, keys = $3::jsonb', [endpoint, sub, JSON.stringify(keys)]); },
    async removeSub(endpoint) { await init(); await sql.query('DELETE FROM sf_push WHERE endpoint = $1', [endpoint]); },
    async subsFor(sub) { await init(); return (await sql.query('SELECT endpoint, keys FROM sf_push WHERE sub = $1', [sub])).map(r => ({ endpoint: r.endpoint, keys: r.keys })); },
    async allSubs() { await init(); return (await sql.query('SELECT p.endpoint, p.keys, p.sub, s.data FROM sf_push p LEFT JOIN sf_state s ON s.sub = p.sub')).map(r => ({ endpoint: r.endpoint, keys: r.keys, sub: r.sub, data: r.data })); },
  };
}
/** In-memory store with the same contract, for tests and local development. */
export function memoryStore() {
  const states = new Map(), subs = new Map();
  return {
    async get(sub) { const s = states.get(sub); return s ? structuredClone(s) : null; },
    async put(sub, email, base, data) {
      const cur = states.get(sub);
      if ((cur?.version || 0) !== base) return null;
      const next = { version: base + 1, data: structuredClone(data), updatedAt: new Date().toISOString() };
      states.set(sub, next);
      return { version: next.version, updatedAt: next.updatedAt };
    },
    async remove(sub) { states.delete(sub); for (const [k, v] of subs) if (v.sub === sub) subs.delete(k); },
    async addSub(sub, endpoint, keys) { subs.set(endpoint, { sub, endpoint, keys }); },
    async removeSub(endpoint) { subs.delete(endpoint); },
    async subsFor(sub) { return [...subs.values()].filter(s => s.sub === sub).map(({ endpoint, keys }) => ({ endpoint, keys })); },
    async allSubs() { return [...subs.values()].map(s => ({ ...s, data: states.get(s.sub)?.data || null })); },
  };
}

let shared = null;
export async function defaultStore(env) {
  if (shared) return shared;
  if (!env.DATABASE_URL) throw Object.assign(Error('not_configured'), { code: 'not_configured' });
  const { neon } = await import('@neondatabase/serverless');
  shared = neonStore(neon(env.DATABASE_URL));
  return shared;
}

// ---------- Reminder digest (pure; uses Israel local date) ----------
export function israelDate(now = new Date(), offsetDays = 0) {
  const d = new Date(now.getTime() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function digest(data, now = new Date()) {
  if (!data?.tasks) return null;
  const today = israelDate(now), tomorrow = israelDate(now, 1);
  const open = data.tasks.filter(t => !t.done && t.kind !== 'break');
  const late = open.filter(t => t.date && t.date < today).length;
  const dueToday = open.filter(t => t.date === today).map(t => t.title);
  const dueTomorrow = open.filter(t => t.date === tomorrow).map(t => t.title);
  const planned = open.filter(t => t.planned === today && t.date !== today).map(t => t.title);
  const exams = (data.courses || []).filter(c => !c.archived && (c.examDate === today || c.examDate === tomorrow)).map(c => (c.examDate === today ? 'היום' : 'מחר') + ' מבחן: ' + c.name);
  const parts = [];
  if (exams.length) parts.push(exams.join(', '));
  if (dueToday.length) parts.push('להגשה היום: ' + dueToday.slice(0, 3).join(', '));
  if (dueTomorrow.length) parts.push('להגשה מחר: ' + dueTomorrow.slice(0, 3).join(', '));
  if (planned.length) parts.push('מתוכנן להיום: ' + planned.slice(0, 3).join(', '));
  if (late) parts.push(late === 1 ? 'משימה אחת באיחור' : `${late} משימות באיחור`);
  return parts.length ? { title: 'StudyFlow - התוכנית להיום', body: parts.join(' · ').slice(0, 300) } : null;
}
