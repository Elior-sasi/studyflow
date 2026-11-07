# Changelog

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
