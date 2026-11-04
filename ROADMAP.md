# Product specification coverage — 2026-11-04

Source: StudyFlow_Lumi_אפיון_מרכזי.docx, version 1.0 (4 November 2026). This file is the implementation ledger, not an alternative specification. All original areas remain in scope.

| Specification area | Implemented in local beta | Remaining before full product release |
| --- | --- | --- |
| 1. Principles | Local data, offline app shell, explicit destructive confirmation, undo and summary versions, no fabricated AI claims | Cloud audit history, proposal approval/diff workflow, authenticated ownership and source provenance |
| 2. Onboarding | Name, institution, courses, daily goals, session duration, form of address, font/contrast and speech rate | Guided onboarding, activity windows, pace, voice selection, custom address, adaptive tone, mute/quiet hours and Shabbat preferences |
| 3. Connections | Manual text import, links, locally stored files and backup | Drive/Docs/Slides, Calendar, Moodle and BGU institutional integration, controlled two-way sync, permitted academic access; verify official NotebookLM interfaces before promising integration |
| 4. Summary review | Manual editing, searchable summaries, original-version retention and restore | Syllabus mapping, duplicate/missing-file detection, weekly collection/review schedule, one-by-one proposed edits with before/after and audit log |
| 5. Teaching | User-authored bilingual glossary, questions and answers, spaced repetition, recorded self-rating | Grounded AI instruction, concept graph/confidence, teach-Lumi mode, follow-up questions, OCR/formulas/diagrams, next/missed lesson preparation, consent-based recording/transcription |
| 6. Research/media | Course links, text summaries, device speech with rate and pause/stop | Academic discovery/citations, original/translated text, verified YouTube transcript/video analysis, presentations/podcasts/video output, paragraph navigation and persisted speech position |
| 7. Learning modes | Manual text reading and device audio, active timer | Home/travel/workout/audio modes, explicit activity/calendar permissions, mode transitions with cancellation, concept-based resume, prepared offline audio and visual follow-up for graphs/formulas |
| 8. Time planning | Daily goals, scheduled tasks, independent deadlines, week navigation, actual study/break timers | Balanced per-course automatic allocation, difficulty/deadline weighting, hourly schedule, Calendar write approval, push reminders, semester recovery and exam emergency planning |
| 9. Assessment/reports | Measured study time by course, task counts, self-rated review history, weekly report | Coverage vs comprehension vs readiness, permitted past-exam style practice, assignment rubric/citation checks, uncertainty-aware exam readiness forecast |
| 10. Design/accessibility | Dark Hebrew RTL, responsive cards, large text, contrast, keyboard and status feedback, semantic native controls | VoiceOver device testing, voice commands, accessible graph descriptions and transcripts, notification priority/digest/quiet-hour policy |
| 11. Technical/privacy | No server secrets or third-party calls; local validation, recovery/backup, MIME/URL restrictions, CSP/security headers | Authentication/session protection, cloud authorization, RLS/ownership isolation, data retention/deletion/export policies, recording consent and integration scopes |
| 12. Delivery phases | Existing GitHub/Vercel web project retained and expanded | Complete phase-A cloud/auth/AI flow before calling the product complete; B/C/D work remains tracked above |
| 13. Open decisions | Continue existing web deployment; local-only data explicitly labelled | Institution test account/access scope, AI provider/budget, cloud storage/auth provider, recordings retention, automatic vs approved cloud actions, later native iPhone scope |

## External dependencies observed

The connected Vercel project had no configured environment variables at inspection. No AI provider, OAuth client, auth service or cloud database is configured in this repository. Browser ChatGPT plugin access does not give the deployed web app its own user authentication or permission to reuse those connected accounts. Do not put connector credentials in the app.

Complete end-to-end cloud flows only after a supported provider/integration is provisioned. Keep unfinished capabilities visibly unavailable rather than adding non-functional controls.

## Release gates

- Model regression and syntax checks pass.
- Browser CRUD → reload → export/import; versions/undo; practice → self-rating; task week scheduling; accessibility reflow; local assistant facts checked.
- Offline reload and upgrade from old cache checked.
- No new browser errors and security headers applied to the deployed commit.
- Production deployment commit matches the reviewed repository commit.
- Full product release additionally requires real auth, user-owned cloud data, grounded AI, approved integrations, device accessibility tests, consent/privacy flows and all specification areas above.
