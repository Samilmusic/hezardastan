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
