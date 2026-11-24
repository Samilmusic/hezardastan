# Private practice room

Extends the existing per-class learning journal. No Suno, model key, generated grading or per-learner production fees.

## Teacher

Open Practice and Progress, select a class, and save the normal lesson review. Each review now has a practice room: record/upload a short example, add a score photo, or attach one of your explicitly reusable samples. Publication requires preview and confirmation. Samples are at most 3 minutes / 12 MiB. Score photos are converted to JPEG, metadata stripped, and bounded to 2400 pixels; only permitted educational material should be uploaded. A teacher can mark up to 20 points on a score, with a note at each point, and set a suggested metronome tempo.

Reuse is opt-in and off by default. A private material cannot be attached to a second review. Reusable samples belong to their originating teacher; learner recordings never enter that library. The library lists the 100 latest reusable samples.

## Learner

Open the same class and lesson. Listen to the teacher sample, slow playback while preserving pitch where supported, select an A/B segment to repeat, enlarge the score and read teacher notes. The independent metronome supports 30–240 BPM, 2/3/4/6-beat bars, and a four-beat count-in. Record/upload performance through the existing private practice workflow; the teacher can continue giving time-specific written or audio feedback. Samples do not automatically start playing. Metronome is not automatically synchronized with recordings.

## Security and integrity

`db/practice_room.sql` adds tables and a private storage bucket only. Existing students, tuition, sessions, reviews, points and recordings are not modified. Server RPCs enforce teacher/class ownership, learner ownership and review authorization. Secretary and unrelated teachers are denied. Material actions retain request keys and reject changed payload reuse; file storage refuses overwrite. Image markers use normalized coordinates and optimistic version checks. All actions add an academy activity entry. No client write access to tables or operation ledger is granted. Signed playback URLs expire after 15 minutes and are requested only after a click. No download button is provided; this is access control and a listening interface, not DRM or a guarantee against recording.

## Validation

Eight focused database/UI tests cover existing journal behavior and the new material system: multi-class learners, cross-user/teacher denial, private storage, archived learner access, valid and invalid uploads, reuse opt-in, unchanged finance paths, marker coordinates/version conflict, double-click protection, retry IDs, click-only signed playback, speed/loop controls and account cleanup. Browser QA uses synthetic local fixtures at a 390 px iframe viewport and a 1000 px desktop viewport, including actual synthetic WAV playback, score viewing/annotation and form layout. Fixtures are excluded from release. Physical iPhone/Safari recording, camera selection and real keyboard behavior still require device verification. No real learner was used for test uploads or reviews.

## Tuner and recording reliability update

A local YIN tuner is available per class, with chromatic note detection, standard guitar/violin string targets, adjustable A4 reference and manual 50-cent quarter-tone targets. It analyzes microphone audio locally and sends none to a model or server. It estimates monophonic pitch in the 35–1800 Hz range; noise, polyphony, harmonics and instrument-specific intonation can limit accuracy.

Recording now uses a shared microphone owner and waits for the final MediaRecorder data/stop events before releasing tracks. Compatible MP4 is preferred, with WebM/Opus or Ogg fallbacks. A single finalized container avoids fragmented MP4 issues. Browser interruptions preserve usable final data with a visible warning. Dialog close/account changes cancel capture; background visibility alone does not silently end it. Auto-refresh is blocked during any open dialog or active microphone session. The 3-minute/12-MiB limits remain.

Fifteen focused tests pass, including pitch accuracy on synthetic bass/guitar/violin signals at 44.1/48 kHz, harmonic-rich signals, silence/noise, complete final recording data, interrupted recording, late permission cancellation and refresh guards. Chrome browser QA at a 390px iframe detected a synthetic A4 input at approximately 440.1 Hz; a 52-second synthetic recording survived periodic refresh, finalized and played correctly. This does not establish physical iPhone/Safari or real instrument microphone accuracy.

Teacher national-ID login is separate from learner login, with server-verified teacher role and teacher linkage. Existing email-based manager/secretary login remains. Passwords and national-ID provisioning data are not stored in project source. The one-time provisioning endpoint was disabled after account creation; all eight requested credentials and mappings were verified.

### Automatic string tuning guidance (2026-11-24)
- Standard guitar/violin nearest-open-string matching, within 180 cents and at least 60 cents separation from the runner-up; explicit string selection and return to auto retained.
- Three consistent frames within 15 cents before tighten/loosen advice; ±5 cents in tune. Ambiguity, excessive offset, loud/clipped input, silence and unstable sound suppress turning advice.
- Other instruments retain chromatic/manual/quarter-tone targets, with explicit target explanation. All sound analysis stays on device.
- 18 focused audio/practice tests passed. Browser fixture verified 107 Hz → tighten A2, 113 Hz → loosen A2, 110 Hz → in tune, 220 Hz → ambiguous, and no overflow at a 390px component width. Synthetic browser input only; physical phone and instrument validation remains outstanding.

### Responsive tuner console (2026-11-24)
- Replaced stretched form with a bounded 1040px instrument console, semicircular needle, large Latin note and Persian label, primary peg direction, signal level and compact string pads. Scoped 48px form controls avoid portal-wide form style collisions. Container queries handle narrow practice columns independently of viewport size; reduced-motion supported.
- Guitar/violin mode is suggested from the current class subject. Unknown instruments remain chromatic/manual; no universal Persian tuning is invented. Calibration is collapsed by default.
- Median of five frames, confidence ≥0.90 and stable spread <18 cents; big frequency jumps reset previous-string samples. Short dropouts preserve the reading briefly but suppress stale peg instructions. Sustained in-tune readings mark each standard open string after 800ms, with count and no forced next-string switch. Cancellation during pending permissions and ended microphone tracks handled. No uploads or database writes.
- 20 focused tests passed. Actual browser fixture with full portal styles checked at 360, 390, 768 and 1200px widths: no tuner horizontal overflow, selector/calibration 48px high. Synthetic 107/113/110Hz verified tighten/loosen/tuned; in-tune string counted; silence cleared guidance. Physical Safari/iPhone microphones and real instruments remain unverified.

### Preserve live practice and consistent review questions (2026-11-24)
- Portal auto/focus/visibility refresh excludes the journey page. Generic background render/reload preserves the existing practice root and any unsent form; only explicit practice loads or navigation may repaint it. Account/role changes still reset state and stop capture. Explicit reload/class-switch is guarded while audio, metronome, or a dialog is active. Top-bar manual refresh delegates to the same guarded practice refresh.
- Added PracticeRoom busy getter for metronome, capture and playing audio. Existing recording finalization and authorized RPCs unchanged.
- Shared review question labels now drive teacher form, preview and published card; preserve line breaks. Successful save returns to the exact class, highlights the saved review ID, and fetches an authorized class-scoped older review if outside the current page.
- Read-only production inspection: 2 stored reviews matched their latest submitted operation payloads; zero text/score mismatches. The reported violin review was found and left unchanged. No database mutations or migrations.
- 22 focused tests pass, including background DOM preservation, account reset, unsent form survival and verbatim form/preview/card mapping. Browser fixture with synthetic microphone source remained at one root render for 134 seconds; metronome crossed the 30-second refresh boundary; tuner survived forced background reload; 43-second recording finalized and played without error. Real iPhone microphone not tested. Temporary fixture removed before packaging.
- Broader legacy tests/portal.test.cjs: 6 pass / 8 fail, identical against pre-change portal-session baseline. Existing fixtures omit class-duration globals and retain old banner/date expectations; no regression introduced by this patch.

### Metronome instrument panel (2026-11-24)
- Replaced the plain stretched form with large 30–240 BPM display, one-step controls, slider, tempo presets and median tap tempo; live tempo changes use a validated numeric value so partial/negative number edits cannot stall the scheduler.
- Beat pads show the active beat and first-beat accent; 2/3/4/6 beats, optional four-beat count-in, live volume, clear transport and local cancellation. Scheduling retains WebAudio look-ahead, drops delayed catch-up bursts, disconnects finished nodes, and still participates in PracticeRoom busy / portal refresh protection.
- Cream/brass responsive two-column console becomes stacked in narrow containers. No emoji transport icons; keyboard labels, 44px controls and reduced-motion support.
- Browser QA: 360/390/1200px panel widths had no horizontal overflow; real WebAudio start/count-in, beat highlight, live change to 100 BPM and stop verified. Synthetic fixtures removed before packaging. Focused metronome regression test checks transport, controls, safe tempo edits and cleanup.
