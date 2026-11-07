# Validation record - 2026-11-08 (0.5.0)

| Suite | Result |
| --- | --- |
| `npm test` | 53 passed |
| `npm run e2e` | 15 passed |

New: session signing/forgery/expiry, Google ID-token checks (audience, issuer, expiry, verified email, nonce), allow list, per-user isolation, compare-and-set and 409 conflict payloads, invalid data rejected, VAPID key validity (also accepted by the web-push library), Israel-date digest content, push subscribe/test/unsubscribe, cron auth and dead-endpoint cleanup. E2E: simulated Google return on two browser contexts (laptop and phone): first device uploads, second device downloads, phone edits reach the laptop, a two-sided change opens the conflict dialog (axe clean) and the chosen copy wins; the OAuth fragment is removed from the URL; sessions never appear in backups.

Not verified automatically: real Google consent, Drive listing/export and Calendar writes (need the user's account), real push delivery to a phone, the cron in production.

---

# Validation record - 2026-11-08 (0.4.0)

| Suite | Result |
| --- | --- |
| `npm test` (unit, Lumi API, Moodle API, importers, service worker) | 46 passed |
| `npm run e2e` (Chrome 390px, axe WCAG 2.2 AA) | 14 passed |

New coverage: PowerPoint import from a python-pptx fixture (titles, levels, entities, notes via relationships); export round-trip (exported .pptx re-imported: cover + 2 slides, notes kept); print view (axe clean); Lumi slides and podcast with a mocked provider; Moodle with a mocked site (wrong password refused, import of 1 course + 1 deadline, re-sync imports nothing new, token excluded from backups); SSRF rules (http, localhost, private/IPv6-mapped addresses, credentials in URL, odd ports, redirects, non-Moodle responses).

Not verified: a real institution's Moodle (needs the user's credentials); opening the exported .pptx in PowerPoint/Keynote; voice commands (speech recognition cannot run in headless tests).

---

# Validation record - 2026-11-07 (0.3.0)

## Automated checks (run in the development container)

| Suite | Command | Result |
| --- | --- | --- |
| Syntax | `npm run check` | 8 files parsed |
| Unit, API, service worker | `npm test` | 34 passed, 0 failed |
| Browser end-to-end (Chrome 390x844, he-IL, touch) | `npm run e2e` | 11 passed, 0 failed |

End-to-end coverage: empty first run shows no invented numbers; course and summary creation; card reader (next/previous, ArrowLeft/ArrowRight in RTL, reload resumes saved card, completion → 100% course coverage, completed filter); planner day task with completion and progress update; month and week views; practice reveal/grade; summary review diff and accept with version history; Lumi with a **mocked** provider (wrong code rejected, correct code verified, answer cites `[1]` and links to the exact card); AI proposal cancel leaves the summary unchanged; AI question suggestions saved only after selection; backup export (AI code excluded), `.ics` export, delete-all, import restores data, corrupt import rejected without changes; light theme, high contrast and 40 px text at 320 px width with no horizontal scroll and all visible controls ≥ 44 px; offline reload after first visit; no console errors.

axe-core 4.10 (WCAG 2.0/2.1/2.2 A and AA rules) reported 0 violations on: home (empty and with data), progress (empty and with data), course detail, lesson slides, courses, planner day/week/month, practice, review dialog, settings, Lumi chat, light theme at 40 px, high contrast at 40 px.

API tests (mocked provider fetch): not-configured 503, unauthorized 401 with no provider call, grounded system prompt with sources and address form, key never returned, 400/413/403/415 rejections, rate limit 429, provider failure 502/504, defensive JSON parsing, summary treated as data.

## Not verified here

- The real AI provider was not called: no key is configured in this environment or (as far as can be observed) in Vercel. AI flows are verified only against a mocked provider.
- Real iPhone VoiceOver, Dynamic Type interaction and installed Hebrew voice output need device testing. Chrome in the container has no Hebrew voice, so speech was not audibly tested.
- Production could not be reached from the container network; production checks are listed in the session report.


---

# Validation record — 2026-11-04

## Automated checks

`npm test`: 14 passing tests. `npm run check`: all three JS files parsed successfully. No runtime dependencies are installed. GitHub Actions runs the same regression and syntax checks for pushes and pull requests.

Model tests cover empty first run, backup roundtrip (Hebrew, files, note versions, glossary), legacy migration without inventing study time, rejection of malformed data, executable links and active attachment MIME types, week/year boundaries, measured progress, repetition due dates, cascade deletion and local Lumi facts.

Service-worker unit tests simulate offline navigation/module retrieval, ensure private query URLs and arbitrary API/download requests are not cached, and verify activation only removes StudyFlow caches. These are simulated network tests; an actual device airplane-mode check remains outstanding.

## Browser checks on the connected Vercel preview

Disposable data were entered only on the preview branch origin, not the user's production browser storage.

| Flow | Observed result |
| --- | --- |
| First run | No seeded courses, notes, tasks or fabricated progress |
| Course creation | Hebrew name and description saved and displayed |
| Summary CRUD | Summary saved, edited and displayed; original text retained in version history |
| Version restore | Earlier summary version restored; visible success feedback |
| Glossary | Hebrew term, English original and explanation saved/displayed |
| Weekly task | Separate learning date and submission deadline displayed; day budget updated |
| Completion/undo | Task completion reversed using undo; Lumi subsequently reported it open |
| Practice | User-authored question → reveal → self-rating → next repetition date displayed |
| Lumi | Returned the actual stored task and real zero initial study time; AI limitation visible |
| Study timer | Started from a summary; recorded elapsed time rather than the configured full session; break could be ended |
| Backup | Downloaded backup, changed goal/name, reimported downloaded file, confirmed replacement; original goal/name restored |
| Persistence | Reload retained course, summary, glossary, task and review |
| Version upgrade | New-version notice shown; reload retained all local test data |
| Attachment | Initial browser test caught file input being cleared too early; fixed; same TXT attachment then saved and listed |
| Typography | 32px base font and high contrast active; weekly layout had no horizontal document overflow at tested desktop viewport |
| Browser console | No app.mjs errors in the observed log check; browser-extension transport errors are separate from the application |

## Issues fixed during verification

- File selection was reset by a generic change handler before material save. Reset is now limited to imports that have already consumed the file.
- Speech errors were sent to a live region behind the modal. They now display inside the open dialog.
- Native dialog now has an explicit accessible title.
- Timer controls remain reachable on other screens while a timer is active.
- Valid backups can recover locked corrupt local state while preserving an original recovery copy when storage allows it.
- Each shell release uses a new cache generation; navigation serves the coherent installed shell, avoiding new HTML mixed with old modules.
- Rendered navigation and save flows focus the main heading for keyboard orientation.

- Attachment downloads use reconstructed Blob bytes rather than direct data-URL navigation; exact UTF-8 roundtrip and malformed-base64 rejection are regression-tested.

## Remaining verification and full-product gates

Installed Hebrew audio output cannot be certified in this cloud browser; real iPhone Hebrew voice/VoiceOver, narrow-screen device operation and airplane-mode audio need device verification. Quota and multi-tab conflict paths have code guards but are not browser fault-injected in this run. Cloud AI, auth, sync, institutional connections and advanced teaching/media features remain unimplemented as enumerated in ROADMAP.md. None is represented as working.
