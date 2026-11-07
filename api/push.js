// Web Push subscriptions for the morning reminder. Requires a signed-in session.
import { json, sessionFrom, defaultStore, vapidKeys, digest } from './_lib/core.js';

export async function webPushSender(env) {
  const webpush = (await import('web-push')).default;
  const k = vapidKeys(env);
  webpush.setVapidDetails('mailto:studyflow@users.noreply.github.com', k.publicKey, k.privateKey);
  return async (sub, payload) => {
    try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' }); return 'sent'; }
    catch (e) { return e.statusCode === 404 || e.statusCode === 410 ? 'gone' : 'failed'; }
  };
}
const okSub = s => s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string' && s.keys.p256dh.length < 200 && s.keys.auth.length < 100;

export function createPushHandler({ env, store, sender }) {
  const getStore = async () => store || defaultStore(env);
  const getSender = async () => sender || webPushSender(env);
  return {
    async GET() {
      if (!env.DATABASE_URL) return json(503, { error: 'not_configured' });
      return json(200, { publicKey: vapidKeys(env).publicKey });
    },
    async POST(request) {
      const s = sessionFrom(env, request);
      if (!s) return json(401, { error: 'unauthorized' });
      let b;
      try { b = JSON.parse((await request.text()).slice(0, 4000)); } catch { return json(400, { error: 'invalid_json' }); }
      const st = await getStore();
      if (b.action === 'subscribe') {
        if (!okSub(b.subscription)) return json(400, { error: 'invalid_subscription' });
        await st.addSub(s.sub, b.subscription.endpoint, { p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth });
        return json(200, { ok: true });
      }
      if (b.action === 'unsubscribe') {
        if (typeof b.endpoint !== 'string') return json(400, { error: 'invalid_request' });
        const mine = (await st.subsFor(s.sub)).some(x => x.endpoint === b.endpoint);
        if (mine) await st.removeSub(b.endpoint);
        return json(200, { ok: true });
      }
      if (b.action === 'test') {
        const subs = await st.subsFor(s.sub);
        if (!subs.length) return json(404, { error: 'no_subscription' });
        const row = await st.get(s.sub);
        const d = digest(row?.data) || { title: 'StudyFlow', body: 'התראת בדיקה: אין היום מועדים או משימות מתוכננות.' };
        const send = await getSender();
        const results = await Promise.all(subs.map(x => send(x, { ...d, url: '/#plan' })));
        for (const [i, r] of results.entries()) if (r === 'gone') await st.removeSub(subs[i].endpoint);
        return json(200, { sent: results.filter(r => r === 'sent').length });
      }
      return json(400, { error: 'invalid_request' });
    },
  };
}
const h = createPushHandler({ env: process.env });
export const GET = r => h.GET(r);
export const POST = r => h.POST(r);
