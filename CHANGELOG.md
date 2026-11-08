# Changelog

## 0.5.2 - 2026-11-08

- **Send to NotebookLM**: a lesson is saved as a Google Doc in a "StudyFlow" Drive folder (scope `drive.file`: only files the app creates); sending again updates the same doc, so NotebookLM can re-sync it. NotebookLM has no public API, so it is added there as a Drive source.
- **Free AI fallbacks**: Lumi tries providers in order Gemini -> Groq -> OpenRouter -> Claude (whichever keys exist). Groq and OpenRouter use their OpenAI-compatible endpoints (`GROQ_API_KEY` default model `openai/gpt-oss-120b`, `OPENROUTER_API_KEY` default `meta-llama/llama-3.3-70b-instruct:free`). Each answer shows which provider replied.

## 0.5.1 - 2026-11-08

- Lumi writes an organized **study summary** from any lesson (e.g. imported lecturer slides), saved as a new lesson.
- A visible **"יצירה וייצוא מהשיעור"** panel under every lesson tab: Lumi summary / presentation / podcast, PowerPoint, print / PDF. Clearer empty state in courses.
- "התקנה כאפליקציה" section: install button on Android/desktop Chrome, instructions for iPhone.
- Android-ready PWA: PNG and maskable icons, shortcuts (plan, Lumi, practice), categories.

## 0.5.0 - 2026-11-08

- **Sign in with Google and cloud sync** between devices: OAuth redirect flow without third-party scripts; the server verifies the Google ID token (audience, issuer, expiry, verified email, nonce) and an allow list (`STUDYFLOW_ALLOWED_EMAILS`), then issues a signed 120-day session. Data is stored per user in Neon Postgres (`DATABASE_URL` from the Vercel integration) with version compare-and-set; conflicts ask which copy to keep and keep the other as a local backup.
- **Google Drive import** (read-only): Google Docs (as Markdown), Google Slides and PowerPoint (slides and speaker notes), text and Markdown files become lessons after review.
- **Google Calendar sync** (one-way): deadlines, exams and study days upserted into the primary calendar with an evening-before reminder; events of completed tasks are removed. Only events created by StudyFlow are touched.
- **Morning reminders** via Web Push: daily Vercel Cron at 05:00 UTC (07:00 Israel winter time) sends a digest only when there is something due; test notification button; dead subscriptions removed. VAPID keys and session keys are derived from the database secret, so no extra secret was created by hand.
- CSP allows `connect-src https://www.googleapis.com` for Drive/Calendar calls.

## 0.4.0 - 2026-11-08

- **Moodle for any institution** (`api/moodle.js`): sign in with site URL + username/password (exchanged once for a mobile-service token; the password is never stored) or paste a token for SSO sites. Choose which courses and deadlines to import; re-sync updates changed dates without duplicates. SSRF guarded (https, public addresses only, no redirects, limits).
- **PowerPoint import**: lecturer `.pptx` files become lessons - one card per slide, bullet levels, tables and speaker notes (linked via slide relationships). Runs in the browser, no third-party code.
- **PowerPoint export** of any lesson (vendored pptxgenjs 3.12, MIT, loaded only on demand; RTL text) and **print / PDF** view with one page per card.
- **Lumi creates a presentation** (structured slides JSON) and **a podcast script** from a summary; both are saved as new lessons, never overwriting the source.
- **Voice commands** in the lesson player (Hebrew Web Speech recognition where the browser supports it): next, previous, read, stop, faster, slower, mark read, finish.
- Notes record their kind (summary, slides, podcast, import); courses/tasks keep an external id for re-sync.

## 0.3.2 - 2026-11-08

- Gemini default model `gemini-3.8-flash` (2.5-flash is retired for new users), automatic fallback to `gemini-flash-latest` and `gemini-flash-lite-latest` on busy (503/429) or retired (404) models, with short retries.
- Provider errors now show the upstream status and message (keys redacted).
- Verified in production with a real Gemini key: access code accepted, live answer received.

## 0.3.1 - 2026-11-07

- Lumi server supports Google Gemini (`GEMINI_API_KEY`, default `gemini-2.5-flash`) alongside Claude; provider chosen automatically or by `LUMI_PROVIDER`. The key travels only in a request header.
- Settings and Lumi show which provider is connected.

## 0.3.0 - 2026-11-07

### Added
- Redesign following the six-screen reference: glass cards, course colours and icons, bottom tab bar (בית, קורסים, תוכנית, התקדמות, עוד), Lumi mascot, safe areas, light theme.
- Lesson card reader with saved position, read marks by card hash, Hebrew speech per card, speed control, continuous listening and focus mode.
- Real coverage (read cards / total cards), consecutive-day streak, period statistics, recommendation engine based on stored data.
- Planner day / week / month views; task types (assignment, study, exam, break), time of day, completion dates; course exam dates.
- Course instructor, exam date, colour, icon, archive; course filters and detail screen.
- Summary review workflow with accessible word diff, accept/cancel and version origin.
- `api/lumi.js` server function: grounded chat with cited cards, summary improvement proposals, question suggestions; access code, validation, rate limiting, origin check. Honest "not configured" state.
- Calendar `.ics` export with reminders. Honest disabled states for Drive, Calendar and Moodle.
- Settings: theme, 18-40 px text with A-/A+, reduced motion, address, voice test. Delete-all data.
- Tests: content/diff/retrieval units, API handler tests (mocked provider), Chrome end-to-end suite with axe-core.
- Local dev server with optional mock AI provider; CI job for browser tests.

### Changed
- Data schema v3 with automatic upgrade from v2 (pre-upgrade copy kept). Backups from v1, v2 and v3 import.
- Code split into readable modules: `model.mjs`, `content.mjs`, `views.mjs`, `icons.mjs`, `app.mjs`.
- Default form of address for new installs is neutral.
- Service worker cache v7; `/api/` is never cached.

### Fixed during this release's testing
- `button { display:inline-flex }` overrode the `hidden` attribute (hidden undo button intercepted taps).
- Toast and fixed dock could cover controls; toast no longer captures taps and scroll padding keeps focused controls visible.
- Horizontal overflow at 320 px with 40 px text (tiles, ring, tab bar, week grid).
- High contrast + light theme tab bar contrast.
