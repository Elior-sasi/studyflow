// Daily morning reminder (Vercel Cron). Sends one digest per subscribed device when there is something to say.
import { json, defaultStore, digest } from '../_lib/core.js';
import { webPushSender } from '../push.js';

export function createCronHandler({ env, store, sender, now = () => new Date() }) {
  return {
    async GET(request) {
      if (env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return json(401, { error: 'unauthorized' });
      if (!env.CRON_SECRET && !/vercel-cron/i.test(request.headers.get('user-agent') || '')) return json(401, { error: 'unauthorized' });
      const st = store || await defaultStore(env);
      const send = sender || await webPushSender(env);
      let sent = 0, gone = 0;
      for (const sub of await st.allSubs()) {
        const d = digest(sub.data, now());
        if (!d) continue;
        const r = await send(sub, { ...d, url: '/#plan' });
        if (r === 'sent') sent++;
        if (r === 'gone') { gone++; await st.removeSub(sub.endpoint); }
      }
      return json(200, { sent, removed: gone });
    },
  };
}
const h = createCronHandler({ env: process.env });
export const GET = r => h.GET(r);
