// Sign in with Google: exchanges a Google ID token for a StudyFlow session. Only allow-listed emails.
import { json, verifyIdToken, allowed, signSession } from './_lib/core.js';

export function createAuthHandler({ env, fetchImpl }) {
  return {
    async GET() { return json(200, { configured: Boolean(env.DATABASE_URL && env.STUDYFLOW_ALLOWED_EMAILS) }); },
    async POST(request) {
      if (!env.DATABASE_URL || !env.STUDYFLOW_ALLOWED_EMAILS) return json(503, { error: 'not_configured' });
      const origin = request.headers.get('origin');
      if (origin && new URL(request.url).origin !== origin) return json(403, { error: 'forbidden_origin' });
      let b;
      try { b = JSON.parse((await request.text()).slice(0, 6000)); } catch { return json(400, { error: 'invalid_json' }); }
      const user = await verifyIdToken(b?.idToken, fetchImpl).catch(() => null);
      if (!user) return json(401, { error: 'invalid_token' });
      if (b.nonce && user.nonce !== b.nonce) return json(401, { error: 'invalid_token' });
      if (!allowed(env, user.email)) return json(403, { error: 'not_allowed' });
      return json(200, { session: signSession(env, user), email: user.email, name: user.name });
    },
  };
}
const h = createAuthHandler({ env: process.env, fetchImpl: (...a) => fetch(...a) });
export const GET = r => h.GET(r);
export const POST = r => h.POST(r);
