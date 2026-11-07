# Changelog

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
