// Google account (OAuth redirect flow, no third-party scripts), cloud sync client, Drive import,
// Calendar sync and Web Push subscription. Tokens live in sessionStorage; the StudyFlow session in localStorage.
import { noteCards, today } from './model.mjs';

export const GOOGLE_CLIENT_ID = '870684431597-vmg2gtfn383s0lcjgfomemhstci7spr8.apps.googleusercontent.com';
export const SCOPES = { drive: 'https://www.googleapis.com/auth/drive.readonly', calendar: 'https://www.googleapis.com/auth/calendar.events' };
const SESSION_KEY = 'studyflow-session', SYNC_KEY = 'studyflow-sync', TOKEN_KEY = 'sf-gtoken', OAUTH_KEY = 'sf-oauth', PUSH_KEY = 'studyflow-push';

const ls = { get: k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
const ss = { get: k => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} }, del: k => { try { sessionStorage.removeItem(k); } catch {} } };
const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');

// ---------- OAuth ----------
export function startGoogleAuth(purpose, scopes = [], returnHash = location.hash || '#more', after = null) {
  const state = rand(), nonce = rand();
  ss.set(OAUTH_KEY, { state, nonce, purpose, returnHash, after });
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: location.origin + '/', response_type: 'token id_token',
    scope: ['openid', 'email', 'profile', ...scopes].join(' '), state, nonce, include_granted_scopes: 'true',
  });
  if (purpose === 'login') p.set('prompt', 'select_account');
  const hint = session()?.email;
  if (hint) p.set('login_hint', hint);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}
/** Must run before routing: turns an OAuth redirect fragment into stored tokens. */
export function consumeOAuthReturn() {
  const h = location.hash.slice(1);
  if (!/(^|&)(access_token|id_token|error)=/.test(h)) return null;
  const p = new URLSearchParams(h), saved = ss.get(OAUTH_KEY);
  ss.del(OAUTH_KEY);
  history.replaceState(null, '', location.pathname + (saved?.returnHash || '#more'));
  if (!saved || p.get('state') !== saved.state) return { error: 'state' };
  if (p.get('error')) return { error: p.get('error'), purpose: saved.purpose };
  const token = { access: p.get('access_token'), exp: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 - 60_000, scope: p.get('scope') || '' };
  if (token.access) ss.set(TOKEN_KEY, token);
  return { purpose: saved.purpose, idToken: p.get('id_token'), nonce: saved.nonce, after: saved.after };
}
export function accessToken(scope) {
  const t = ss.get(TOKEN_KEY);
  return t && t.exp > Date.now() && (!scope || t.scope.split(' ').includes(scope)) ? t.access : null;
}

// ---------- StudyFlow session ----------
export const session = () => ls.get(SESSION_KEY);
export async function finishLogin(idToken, nonce) {
  const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken, nonce }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Error({ not_allowed: 'החשבון הזה לא מורשה להתחבר ל-StudyFlow.', not_configured: 'החיבור לחשבון עוד לא הוגדר בשרת.', invalid_token: 'ההתחברות עם Google לא אומתה. כדאי לנסות שוב.' }[j.error] || 'ההתחברות נכשלה.');
  ls.set(SESSION_KEY, { session: j.session, email: j.email, name: j.name });
  return j;
}
export function signOut() { ls.del(SESSION_KEY); ls.del(SYNC_KEY); ss.del(TOKEN_KEY); }

// ---------- Sync ----------
export const syncMeta = () => ls.get(SYNC_KEY) || { version: 0, dirty: false, at: '' };
export const setSyncMeta = m => ls.set(SYNC_KEY, m);
async function api(method, path, body) {
  const s = session();
  if (!s) throw Error('לא מחובר');
  let r;
  try { r = await fetch(path, { method, headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.session }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw Object.assign(Error('אין חיבור לשרת.'), { offline: true }); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { signOut(); throw Error('ההתחברות פגה. צריך להתחבר שוב.'); }
  return { status: r.status, body: j };
}
export const pullCloud = () => api('GET', '/api/sync');
export const pushCloud = (baseVersion, data) => api('PUT', '/api/sync', { baseVersion, data });
export const deleteCloud = () => api('DELETE', '/api/sync');

// ---------- Google Drive ----------
const DRIVE_TYPES = {
  'application/vnd.google-apps.document': 'Google Docs',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'text/plain': 'טקסט', 'text/markdown': 'Markdown',
};
async function gfetch(url, token, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: 'Bearer ' + token, ...(init.headers || {}) } });
  if (r.status === 401) { ss.del(TOKEN_KEY); throw Object.assign(Error('ההרשאה מ-Google פגה.'), { reauth: true }); }
  if (!r.ok) throw Error('Google החזיר שגיאה (' + r.status + ').');
  return r;
}
export async function driveList(token, query = '') {
  const types = Object.keys(DRIVE_TYPES).map(t => `mimeType='${t}'`).join(' or ');
  const q = `trashed=false and (${types})` + (query ? ` and name contains '${query.replace(/['\\]/g, '\\$&')}'` : '');
  const url = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({ q, pageSize: '30', orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType,modifiedTime,size)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
  const j = await (await gfetch(url, token)).json();
  return (j.files || []).map(f => ({ ...f, typeLabel: DRIVE_TYPES[f.mimeType] || f.mimeType }));
}
/** Returns {kind:'text', text} or {kind:'pptx', buffer}. */
export async function driveContent(token, file) {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
  if (file.mimeType === 'application/vnd.google-apps.document') {
    try { return { kind: 'text', text: await (await gfetch(base + '/export?mimeType=text/markdown', token)).text() }; }
    catch (e) { if (e.reauth) throw e; return { kind: 'text', text: await (await gfetch(base + '/export?mimeType=text/plain', token)).text() }; }
  }
  if (file.mimeType === 'application/vnd.google-apps.presentation') return { kind: 'pptx', buffer: await (await gfetch(base + '/export?mimeType=' + encodeURIComponent('application/vnd.openxmlformats-officedocument.presentationml.presentation'), token)).arrayBuffer() };
  if (Number(file.size) > 60_000_000) throw Error('הקובץ גדול מדי.');
  const r = await gfetch(base + '?alt=media', token);
  return file.mimeType.includes('presentationml') ? { kind: 'pptx', buffer: await r.arrayBuffer() } : { kind: 'text', text: await r.text() };
}

// ---------- Google Calendar (one-way: StudyFlow -> primary calendar) ----------
const addDay = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + 1); return today(x); };
export function calendarEvents(state) {
  const name = id => state.courses.find(c => c.id === id)?.name || '';
  const out = [];
  for (const t of state.tasks.filter(t => !t.done && t.kind !== 'break')) {
    if (t.date) out.push({ key: t.id + '-due', summary: (t.kind === 'exam' ? 'מבחן: ' : 'הגשה: ') + t.title, description: name(t.courseId), date: t.date, remind: true });
    if (t.planned && t.planned !== t.date) out.push({ key: t.id + '-plan', summary: 'למידה: ' + t.title, description: `${name(t.courseId)} · ${t.minutes} דקות`, date: t.planned, remind: false });
  }
  for (const c of state.courses.filter(c => c.examDate && !c.archived)) out.push({ key: c.id + '-exam', summary: 'מבחן: ' + c.name, description: c.instructor ? 'מרצה: ' + c.instructor : '', date: c.examDate, remind: true });
  return out;
}
export async function calendarSync(token, state) {
  const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const existing = new Map();
  let page = '';
  do {
    const j = await (await gfetch(base + '?' + new URLSearchParams({ privateExtendedProperty: 'studyflow=1', maxResults: '250', showDeleted: 'false', ...(page ? { pageToken: page } : {}) }), token)).json();
    for (const e of j.items || []) existing.set(e.extendedProperties?.private?.sfKey, e);
    page = j.nextPageToken || '';
  } while (page);
  const wanted = calendarEvents(state);
  let created = 0, updated = 0, removed = 0;
  for (const w of wanted) {
    const body = {
      summary: w.summary, description: (w.description ? w.description + '\n' : '') + 'נוצר ע״י StudyFlow',
      start: { date: w.date }, end: { date: addDay(w.date) }, transparency: 'transparent',
      reminders: w.remind ? { useDefault: false, overrides: [{ method: 'popup', minutes: 15 * 60 }] } : { useDefault: false, overrides: [] },
      extendedProperties: { private: { studyflow: '1', sfKey: w.key } },
    };
    const e = existing.get(w.key);
    existing.delete(w.key);
    if (!e) { await gfetch(base, token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); created++; }
    else if (e.summary !== body.summary || e.start?.date !== w.date || (e.description || '') !== body.description) {
      await gfetch(base + '/' + encodeURIComponent(e.id), token, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); updated++;
    }
  }
  for (const e of existing.values()) { if (!e) continue; await gfetch(base + '/' + encodeURIComponent(e.id), token, { method: 'DELETE' }); removed++; }
  return { created, updated, removed, total: wanted.length };
}

// ---------- Web Push ----------
export const pushState = () => ls.get(PUSH_KEY);
export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
    return ios && !standalone ? 'install' : 'unsupported';
  }
  return Notification.permission === 'denied' ? 'denied' : 'ok';
}
const b64ToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
export async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') throw Error('לא ניתנה הרשאה להתראות. אפשר לשנות בהגדרות האתר או המכשיר.');
  const { publicKey } = await (await fetch('/api/push')).json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const j = sub.toJSON();
  const r = await api('POST', '/api/push', { action: 'subscribe', subscription: { endpoint: j.endpoint, keys: j.keys } });
  if (r.status !== 200) throw Error('הרישום להתראות נכשל.');
  ls.set(PUSH_KEY, { endpoint: j.endpoint, at: new Date().toISOString() });
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  const endpoint = sub?.endpoint || pushState()?.endpoint;
  if (sub) await sub.unsubscribe();
  if (endpoint && session()) await api('POST', '/api/push', { action: 'unsubscribe', endpoint }).catch(() => {});
  ls.del(PUSH_KEY);
}
export async function testPush() {
  const r = await api('POST', '/api/push', { action: 'test' });
  if (r.status === 404) throw Error('המכשיר לא רשום להתראות.');
  if (r.status !== 200) throw Error('שליחת התראת הבדיקה נכשלה.');
  return r.body.sent;
}

export { noteCards };
