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
