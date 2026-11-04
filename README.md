# StudyFlow · Lumi

An accessible Hebrew RTL, local-first study workspace. No framework, runtime dependencies, analytics or third-party scripts. Deployed through the existing GitHub → Vercel connection.

## Working features

- Empty first run; never seeds fabricated user progress or course content.
- Course CRUD, searchable summaries with TXT/Markdown import, ten retained summary versions, restore, and ten in-tab undo snapshots.
- Course materials: HTTP(S) links and local PDF/PNG/JPEG/WebP/TXT attachments, maximum 1 MB per attachment and 4 MB total serialized state. Attachments are included in backups. PDF/image extraction is **not** implemented.
- Course-linked tasks, submission deadlines, estimated duration, independently scheduled study dates, Sunday-based weekly plan, completion/reopening, overdue status.
- User-authored questions and answers, self-rating and spaced repetition (1, 3, 7, 14, 30 days); wrong answers return to the due queue the same day after the current round.
- User-authored bilingual glossary, weekly text report, actual elapsed study time, pause/resume, capped session duration and five-minute breaks. Timer only works with the tab open; nothing is recorded without explicit finish.
- Device Hebrew speech with rate control, stop and pause/resume. Requires a Hebrew voice installed on the device. No generated audio or guaranteed offline voice availability.
- Local rules-based Lumi assistant: displays stored deadlines, progress and guidance. **No AI model is connected.**
- 18–32 px base font, high contrast, keyboard controls, semantic headings and landmarks, native modal focus containment, live status/error messages and reduced-motion support.
- Validated JSON backup/restore, migration of previous course/note/task data, quota error handling, read-only recovery from corrupted storage, cross-tab conflict detection and optional persistent-storage request.
- Versioned offline app shell. External links, online voices and future cloud services require network access.

## Data and privacy

State resides in `localStorage['studyflow-v2']`; the original `studyflow` key is preserved on migration. Legacy session counts and percentages are not converted to invented study time because the old format did not record a course or duration. Export original data to retain these historical values.

No login, cloud database, server-side API or multi-device synchronization exists yet. Backups are plaintext and include attached files. Browser data eviction or clearing site storage can delete local data. Export regularly. Unknown/imported data is validated before rendering or writing. Only HTTP(S) external links and a restricted attachment MIME allowlist are accepted. CSP blocks third-party scripts, framing, plugins and external API calls. There are no application secrets in client code.

## Development and validation

```sh
npm test
npm run check
python3 -m http.server 4173
```

Serve the repository root as static files. ES modules and the service worker need HTTP(S), rather than `file://`.

`tests/model.test.mjs` covers migration, Hebrew backup round trips including versions/files, corrupt imports, unsafe links and MIME types, dates/week boundaries, measured statistics, spaced repetition, course deletion integrity, and truthful assistant replies.

## Release status

This is an expanded **local-first beta**, not completion of the full product specification. See [ROADMAP.md](ROADMAP.md) for every specification area and outstanding dependencies. Do not describe cloud integrations, generative teaching, OCR, recorded lessons, push notifications or exam readiness estimates as active.
