import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { signSession, readSession, verifyIdToken, vapidKeys, memoryStore, digest, israelDate, GOOGLE_CLIENT_ID, allowed } from '../api/_lib/core.js';
import { createAuthHandler } from '../api/auth.js';
import { createSyncHandler } from '../api/sync.js';
import { createPushHandler } from '../api/push.js';
import { createCronHandler } from '../api/cron/reminders.js';
import { emptyState } from '../model.mjs';

const env = { DATABASE_URL: 'postgres://secret@db/x', STUDYFLOW_ALLOWED_EMAILS: 'me@example.com' };
const U = 'https://app.example';
const req = (method, path, { body, session, origin = U, ua } = {}) => new Request(U + path, { method, headers: { 'content-type': 'application/json', origin, ...(session ? { authorization: 'Bearer ' + session } : {}), ...(ua ? { 'user-agent': ua } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
const googleOK = claims => async () => new Response(JSON.stringify({ iss: 'https://accounts.google.com', aud: GOOGLE_CLIENT_ID, exp: String(Math.floor(Date.now() / 1000) + 600), email_verified: 'true', sub: '42', email: 'me@example.com', name: 'אני', nonce: 'n1', ...claims }), { status: 200 });

test('sessions are signed, expire and cannot be forged', () => {
  const s = signSession(env, { sub: '42', email: 'me@example.com' });
  assert.equal(readSession(env, s).sub, '42');
  assert.equal(readSession(env, s, Date.now() + 121 * 86400_000), null);
  assert.equal(readSession({ ...env, DATABASE_URL: 'other' }, s), null);
  const [body] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: '1', email: 'x', exp: Date.now() + 1e9 })).toString('base64url') + '.' + s.split('.')[1];
  assert.equal(readSession(env, forged), null);
  assert.equal(readSession(env, body + '.'), null);
  assert.equal(allowed(env, 'ME@example.com'), true);
  assert.equal(allowed({}, 'me@example.com'), false, 'no allow list means nobody');
});

test('Google ID tokens must match audience, issuer, expiry and verified email', async () => {
  const t = 'aaa.bbb.ccc';
  assert.equal((await verifyIdToken(t, googleOK({}))).sub, '42');
  for (const bad of [{ aud: 'other' }, { iss: 'evil' }, { exp: '1' }, { email_verified: 'false' }]) assert.equal(await verifyIdToken(t, googleOK(bad)), null);
  assert.equal(await verifyIdToken('not a jwt', googleOK({})), null);
});

test('auth endpoint: allow list, nonce and configuration', async () => {
  const h = createAuthHandler({ env, fetchImpl: googleOK({}) });
  const ok = await (await h.POST(req('POST', '/api/auth', { body: { idToken: 'a.b.c', nonce: 'n1' } }))).json();
  assert.equal(ok.email, 'me@example.com');
  assert.ok(readSession(env, ok.session));
  assert.equal((await h.POST(req('POST', '/api/auth', { body: { idToken: 'a.b.c', nonce: 'wrong' } }))).status, 401);
  const stranger = createAuthHandler({ env, fetchImpl: googleOK({ email: 'x@example.com' }) });
  assert.equal((await stranger.POST(req('POST', '/api/auth', { body: { idToken: 'a.b.c' } }))).status, 403);
  assert.equal((await createAuthHandler({ env: {}, fetchImpl: googleOK({}) }).POST(req('POST', '/api/auth', { body: {} }))).status, 503);
});

test('sync: compare-and-set versions, conflicts return the server copy, data is validated', async () => {
  const store = memoryStore(), h = createSyncHandler({ env, store });
  const session = signSession(env, { sub: '42', email: 'me@example.com' });
  assert.equal((await h.GET(req('GET', '/api/sync'))).status, 401);
  assert.deepEqual(await (await h.GET(req('GET', '/api/sync', { session }))).json(), { version: 0, data: null, updatedAt: null });
  const d = emptyState();
  d.courses.push({ id: 'c1', name: 'קורס', description: '' });
  const r1 = await (await h.PUT(req('PUT', '/api/sync', { session, body: { baseVersion: 0, data: d } }))).json();
  assert.equal(r1.version, 1);
  const stale = await h.PUT(req('PUT', '/api/sync', { session, body: { baseVersion: 0, data: d } }));
  assert.equal(stale.status, 409);
  const c = await stale.json();
  assert.equal(c.version, 1);
  assert.equal(c.data.courses[0].name, 'קורס');
  assert.equal((await h.PUT(req('PUT', '/api/sync', { session, body: { baseVersion: 1, data: { version: 3, courses: 'x' } } }))).status, 400);
  assert.equal((await h.PUT(req('PUT', '/api/sync', { session, origin: 'https://evil.example', body: { baseVersion: 1, data: d } }))).status, 403);
  const other = signSession(env, { sub: '7', email: 'other@example.com' });
  assert.equal((await (await h.GET(req('GET', '/api/sync', { session: other }))).json()).version, 0, 'users are isolated');
  assert.equal((await h.DELETE(req('DELETE', '/api/sync', { session }))).status, 200);
  assert.equal((await (await h.GET(req('GET', '/api/sync', { session }))).json()).version, 0);
});

test('VAPID keys are deterministic, valid P-256 and secret-dependent', () => {
  const k = vapidKeys(env);
  assert.deepEqual(vapidKeys(env), k);
  assert.notEqual(vapidKeys({ DATABASE_URL: 'y' }).publicKey, k.publicKey);
  const e = createECDH('prime256v1');
  e.setPrivateKey(Buffer.from(k.privateKey, 'base64url'));
  assert.equal(e.getPublicKey().toString('base64url'), k.publicKey);
  assert.equal(Buffer.from(k.publicKey, 'base64url').length, 65);
});

test('morning digest uses Israel dates and says nothing when there is nothing', () => {
  const now = new Date('2026-11-08T05:00:00Z');
  assert.equal(israelDate(now), '2026-11-08');
  const d = { courses: [{ name: 'סטטיסטיקה', examDate: '2026-11-09', archived: false }], tasks: [
    { title: 'מטלה 1', date: '2026-11-08', done: false, kind: 'assignment' }, { title: 'מטלה 2', date: '2026-11-09', done: false, kind: 'assignment' },
    { title: 'ישנה', date: '2026-11-01', done: false, kind: 'assignment' }, { title: 'לימוד', date: '', planned: '2026-11-08', done: false, kind: 'study' }, { title: 'בוצע', date: '2026-11-08', done: true, kind: 'assignment' }] };
  const g = digest(d, now);
  assert.match(g.body, /מחר מבחן: סטטיסטיקה/);
  assert.match(g.body, /להגשה היום: מטלה 1/);
  assert.match(g.body, /להגשה מחר: מטלה 2/);
  assert.match(g.body, /מתוכנן להיום: לימוד/);
  assert.match(g.body, /משימה אחת באיחור/);
  assert.doesNotMatch(g.body, /בוצע/);
  assert.equal(digest({ tasks: [], courses: [] }, now), null);
});

test('push subscribe/test/unsubscribe and cron send only real digests, dropping dead endpoints', async () => {
  const store = memoryStore(), sent = [];
  const sender = async (sub, payload) => { sent.push([sub.endpoint, payload.body]); return sub.endpoint.includes('dead') ? 'gone' : 'sent'; };
  const p = createPushHandler({ env, store, sender });
  assert.equal((await (await p.GET()).json()).publicKey, vapidKeys(env).publicKey);
  const session = signSession(env, { sub: '42', email: 'me@example.com' });
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
  assert.equal((await p.POST(req('POST', '/api/push', { body: { action: 'subscribe', subscription: sub } }))).status, 401);
  assert.equal((await p.POST(req('POST', '/api/push', { session, body: { action: 'subscribe', subscription: { endpoint: 'http://x', keys: {} } } }))).status, 400);
  await p.POST(req('POST', '/api/push', { session, body: { action: 'subscribe', subscription: sub } }));
  await p.POST(req('POST', '/api/push', { session, body: { action: 'subscribe', subscription: { ...sub, endpoint: 'https://push.example/dead' } } }));
  assert.equal((await (await p.POST(req('POST', '/api/push', { session, body: { action: 'test' } }))).json()).sent, 1);
  assert.match(sent[0][1], /התראת בדיקה/);
  assert.equal((await store.subsFor('42')).length, 1, 'dead endpoint removed');

  const today = israelDate(new Date());
  await store.put('42', 'me@example.com', 0, { tasks: [{ title: 'להגיש', date: today, done: false, kind: 'assignment' }], courses: [] });
  const c = createCronHandler({ env, store, sender });
  assert.equal((await c.GET(req('GET', '/api/cron/reminders'))).status, 401);
  sent.length = 0;
  assert.deepEqual(await (await c.GET(req('GET', '/api/cron/reminders', { ua: 'vercel-cron/1.0' }))).json(), { sent: 1, removed: 0 });
  assert.match(sent[0][1], /להגשה היום: להגיש/);
  await p.POST(req('POST', '/api/push', { session, body: { action: 'unsubscribe', endpoint: sub.endpoint } }));
  assert.equal((await store.subsFor('42')).length, 0);
});
