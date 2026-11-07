// Cloud copy of the user's StudyFlow data with optimistic concurrency (version compare-and-set).
import { json, sessionFrom, defaultStore } from './_lib/core.js';
import { validate } from '../model.mjs';

const MAX = 4_500_000;
export function createSyncHandler({ env, store }) {
  const getStore = async () => store || defaultStore(env);
  async function auth(request) {
    const s = sessionFrom(env, request);
    if (!s) throw json(401, { error: 'unauthorized' });
    const origin = request.headers.get('origin');
    if (origin && new URL(request.url).origin !== origin) throw json(403, { error: 'forbidden_origin' });
    return s;
  }
  return {
    async GET(request) {
      try {
        const s = await auth(request);
        const row = await (await getStore()).get(s.sub);
        return json(200, row || { version: 0, data: null, updatedAt: null });
      } catch (e) { return e instanceof Response ? e : json(500, { error: 'server_error' }); }
    },
    async PUT(request) {
      try {
        const s = await auth(request);
        const text = await request.text();
        if (text.length > MAX) return json(413, { error: 'too_large' });
        let b;
        try { b = JSON.parse(text); } catch { return json(400, { error: 'invalid_json' }); }
        if (!Number.isInteger(b?.baseVersion) || b.baseVersion < 0) return json(400, { error: 'invalid_request' });
        let data;
        try { data = validate(b.data); } catch { return json(400, { error: 'invalid_data' }); }
        const st = await getStore();
        const saved = await st.put(s.sub, s.email, b.baseVersion, data);
        if (!saved) {
          const cur = await st.get(s.sub);
          return json(409, { error: 'conflict', version: cur?.version || 0, data: cur?.data || null, updatedAt: cur?.updatedAt || null });
        }
        return json(200, saved);
      } catch (e) { return e instanceof Response ? e : json(500, { error: 'server_error' }); }
    },
    async DELETE(request) {
      try {
        const s = await auth(request);
        await (await getStore()).remove(s.sub);
        return json(200, { ok: true });
      } catch (e) { return e instanceof Response ? e : json(500, { error: 'server_error' }); }
    },
  };
}
const h = createSyncHandler({ env: process.env });
export const GET = r => h.GET(r);
export const PUT = r => h.PUT(r);
export const DELETE = r => h.DELETE(r);
