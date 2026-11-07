# StudyFlow · Lumi

An accessible Hebrew RTL, local-first study app. Vanilla ES modules, no framework, no runtime dependencies or third-party scripts. Deployed from GitHub to Vercel (static files plus one serverless function, `api/lumi.js`).

The UI follows the six-screen design reference (home, Lumi chat, courses, lesson, planner, progress): deep navy glass cards, course-coloured tiles, gradient accents and a bottom tab bar, rebuilt as semantic, scalable HTML.

## Working features (0.3)

- **Home**: time-of-day greeting, a recommended next step computed from real data (overdue/today deadline → today's plan → due reviews → unfinished lesson → new questions), today's items, daily goal and active courses. Empty first run; nothing is seeded.
- **Courses**: create/edit/archive/delete; instructor, exam date, colour and icon; filters (all / in progress / completed / archived); search across courses and summaries; per-course detail with lessons, tasks, questions, glossary and materials.
- **Lessons**: each summary becomes a card reader (`# ` headings start cards; `- ` bullets and `**bold**` are formatted safely). Next marks the card read; position is saved and resumed. Hebrew device speech per card with play/pause, previous/next, speed (0.75-1.5) and a *continuous listening* mode for commuting or the gym. Focus mode hides navigation. Arrow keys navigate (RTL aware).
- **Coverage** = cards marked read / total cards. Reads are stored by card-content hash, so editing one card only resets that card. No other percentages exist.
- **Planner**: day / week / month views; tasks have type (assignment, study, exam, break), optional time, study day and deadline; tick to complete (records completion date); schedule waiting tasks onto a day; course exam dates appear in day and month views.
- **Progress**: week / month / all; coverage ring, open tasks, correct practice answers, consecutive learning days, minutes per day (bar chart with a screen-reader table), per-course coverage and minutes, recent sessions, weekly text report.
- **Practice**: user-authored questions with spaced repetition (1, 3, 7, 14, 30 days); can be run per course from the lesson.
- **Summary review**: propose edits (manually, or from Lumi AI), see an accessible word diff (`<ins>/<del>` plus hidden "הוספה/מחיקה" text), edit the proposal, then accept or cancel. Nothing is overwritten without approval; ten versions are kept with their origin (manual/review/AI/restore).
- **Lumi**: local mode answers from stored data and says it is not AI. With the server configured, Lumi uses a real LLM through `api/lumi.js`: grounded answers citing the user's own lesson cards (links to the exact card), summary improvement proposals, and question suggestions that the user selects before saving. Gendered or neutral address follows the setting.
- **Calendar export**: `.ics` with deadlines (with a reminder a day before), study days and exam dates. Google Drive / Calendar / Moodle are shown as *not connected* with disabled controls.
- **Settings**: dark/light theme, text 18-40 px plus A-/A+, high contrast, reduced motion, name, institution, form of address, speech rate and voice test, daily goal, session length.
- **Data**: validated JSON backup/import (v1 legacy, v2 and v3 accepted), raw-data download, persistent-storage request, undo (last 15 changes), delete-all with double confirmation, cross-tab conflict detection, read-only lock on corrupt storage, offline app shell.

## Lumi AI server setup

Set in Vercel → Project → Settings → Environment Variables (Production):

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google Gemini key (from Google AI Studio). Server only. Preferred when present. |
| `ANTHROPIC_API_KEY` | Alternative provider: Claude. Server only. |
| `LUMI_ACCESS_CODE` | A private code the user types once in "עוד". Prevents strangers from spending the key. Required. |
| `LUMI_PROVIDER` (optional) | `gemini` or `anthropic` when both keys exist. |
| `LUMI_MODEL` (optional) | Model id; defaults `gemini-2.5-flash` / `claude-sonnet-4-5`. |

Note: on Gemini's free tier Google may use submitted content to improve its products.

Until a provider key and the access code exist, `GET /api/lumi` returns `{"configured":false}` and the app stays in local mode. The endpoint validates and size-limits input, compares the code in constant time, rate-limits per IP (best effort per instance), rejects cross-origin requests, never stores content and never returns the key. The access code is kept only in the browser's `localStorage` and is excluded from backups.

## Data and privacy

State lives in `localStorage['studyflow-v2']` (the object carries `version: 3`). On first load of 0.3, the untouched v2 data is copied to `studyflow-v2-pre-v3` before upgrading; the original `studyflow` legacy key is never modified. No account, cloud database or multi-device sync exists. Backups are plaintext and include attached files. When AI is used, only the question and up to six relevant card excerpts (or the one summary being improved) are sent to the provider through the server.

## Development

```sh
npm install            # dev tools only: playwright-core, axe-core
npm run check          # syntax
npm test               # unit, API and service-worker tests (Node)
npm run dev            # http://localhost:4173, real /api/lumi using your env
npm run dev:mock       # same, with a fake AI provider (code: test-code)
npm run e2e            # Chrome, 390px RTL viewport: flows, axe WCAG 2.2 AA, 320px/40px reflow, offline, backup
```

Set `CHROME_PATH` if Chrome is not at `/usr/bin/google-chrome`.

## Release status

Local-first beta 0.3. See [CHANGELOG.md](CHANGELOG.md), [QA.md](QA.md) for recorded test results and [ROADMAP.md](ROADMAP.md) for remaining scope. Do not describe cloud sync, Drive/Calendar/Moodle integrations, OCR, push notifications or exam-readiness estimates as available.
