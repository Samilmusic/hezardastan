# HezarAva Air Studio — assets, licences and limitations

All assets are self-hosted under `dist/air/`. The page makes **no third-party network requests**.

## Hand tracking
| File | Source | Version | Licence | SHA-256 |
|---|---|---|---|---|
| `vendor/mediapipe/vision_bundle.mjs` | `@mediapipe/tasks-vision` (Google), vendored copy from github.com/Lynegzs/XR-FUSION-EDU `public/vendor/mediapipe/tasks-vision` | 0.10.18 (per that repository) | Apache-2.0 | `92ba6016fd0fc8bbce237086dec6212f72a03b06d0a5ecfdc71ddc724ccdbabb` |
| `vendor/mediapipe/wasm/vision_wasm_internal.js` | same | 0.10.18 | Apache-2.0 | `2b120e1c7272905719f7893e5f09e033ead468b46b510e6b490d93e3d94ec69c` |
| `vendor/mediapipe/wasm/vision_wasm_internal.wasm` | same | 0.10.18 | Apache-2.0 | `35d67ac01df034a04a38cb0533d6438595bcc65c485aed61dd47c86c6c3839cd` |
| `vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js` | same | 0.10.18 | Apache-2.0 | `d206ba4e27c42a5863b4001c6d9366345f4507979cd6efd087a149ef7781ccd3` |
| `vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm` | same | 0.10.18 | Apache-2.0 | `17c2bff095305fcae98faa0817cbf72f13df9baf76f2067992a8624ef54d18cb` |
| `vendor/models/hand_landmarker.task` | Google MediaPipe Hand Landmarker, float16 v1 | float16/1 | Apache-2.0 | `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` |

Provenance note: the build environment could not reach npm, jsDelivr or Google Cloud Storage. The model hash matches the
float16 v1 file published by Google (the same hash is cited independently by other self-hosting projects). The runtime
files were taken from the repository above and have **not** been byte-compared with the npm tarball. Run
`scripts/verify-air-vendor.sh` on a machine with npm access to confirm them before relying on them long-term.

## Instrument samples
FluidR3_GM rendered by gleitz/midi-js-soundfonts (github.com/gleitz/midi-js-soundfonts). Soundfont renders released
under **Creative Commons Attribution 3.0**; repository code MIT (`samples/LICENSE-gleitz-midi-js-soundfonts.txt`).
Attribution shown on the page. Notes C, E♭, G♭, A in octaves 1–7 (28 MP3 files per instrument); other pitches,
including every microtonal degree, are reached exactly with `playbackRate`.

| UI name | Folder | Type |
|---|---|---|
| پیانو | `samples/acoustic_grand_piano` | sampled (FluidR3_GM Acoustic Grand Piano) |
| گیتار نایلون | `samples/acoustic_guitar_nylon` | sampled (FluidR3_GM Acoustic Guitar nylon) |
| پیانوی الکتریک | `samples/electric_piano_1` | sampled (FluidR3_GM Electric Piano 1) |
| ویولن | `samples/violin` | sampled (FluidR3_GM Violin); sustain uses a loop of the recorded sample, which is an approximation of bowing |
| سینت نرم | — | synthesized (oscillators + filter) |
| زخمه‌ای سنتزی | — | synthesized (Karplus–Strong); labelled as not a real tar or setar |
| همراهی (pad) | — | synthesized |
| ضرب | — | synthesized frame-drum style pattern |

**Not exposed:** ney, tar, setar, santur. No original or appropriately licensed recordings were available; generic
patches are not presented under those names. To add them, record or license multi-sampled notes, add a folder and
an `INSTRUMENTS` entry in `engine.mjs`, and list the source and licence here.

## Tuning presets
`tuning.mjs` stores every degree in cents above the tonic. Persian presets are exploratory approximations based on
measurement-based literature on Persian intonation (neutral seconds of roughly 135–160 c, neutral thirds of roughly
340–360 c), rounded to 5 c and reduced to one octave. They do not represent a dastgah, radif, gushe sequence or any
performer's intonation, and koron/sori sizes are editable per degree.

## Privacy and permissions
Camera frames are passed to the model in the page and are never transmitted. Hand tracking itself stores nothing and never asks for the microphone.

**Filming (added later, on the owner's request):** when the player presses «ویدئو» and then «شروع ضبط», the page films the performance surface (camera picture with the overlay, plus a title and the chords drawn into the film) together with the engine's sound. If the player leaves «صدای میکروفون» on, the browser asks for microphone permission at that moment; the voice goes through a high-pass, a gentle compressor and an optional generated reverb **into the film only**, never to the speakers. The film is assembled in memory with `MediaRecorder` and handed to the player as a file to save or share; it is not uploaded, and it is gone when the page closes. The microphone is released when the take ends. Maximum length 2 minutes. Audio-only recording (WAV/MIDI) is unchanged and contains neither picture nor microphone.
Settings (scale, instrument, calibration thresholds) are kept in `localStorage` on the device only.
Site headers: `Permissions-Policy: camera=(self)` and `script-src … 'wasm-unsafe-eval'` (required to compile the
MediaPipe WebAssembly runtime).

**Balance after a take (added after the owner's first real-phone trial):** a take with the microphone also keeps two stems in memory — the instruments (the engine's mix, delayed like in the film) and the processed voice — through the `air-stem` AudioWorklet (16-bit; about 35 MB for the two-minute maximum). The result dialog then shows three sliders (voice, instruments/pad, voice reverb) whose starting point is computed from the stems' loudness (`suggestBalance`), plays the mix in step with the muted preview, and «ساخت فیلم نهایی» films the picture again in real time with the chosen sound (`FilmMix.build`). «ذخیرهٔ خام» gives the untouched take. Without AudioWorklet, or without the microphone, the take is offered directly as before. Stems are dropped when the dialog closes; nothing is stored or sent.

**Speaker sound while the microphone is open (iPhone/iPad):** the owner reported that on an iPhone the pad could not be heard during a take although it was in the file. Three things are done for this, none of which could be tested here: `navigator.audioSession.type = 'play-and-record'` is set before the microphone request (and given back afterwards), the AudioContext is suspended and resumed once the microphone is open, and the speakers-only `monitor` gain is raised to 1.6 for the take. Without headphones the microphone still hears the pad from the speaker, so the voice slider also moves some pad; wired headphones avoid that.


## دستانِ نوا: پدِ همراهی و راهنمای تصویری (Round 6)

- پدِ همراهی کاملاً در مرورگر سنتز می‌شود (دو اره‌ای با دیتیون ±۷ سنت + مثلثی برای هر نت، فیلتر پایین‌گذر، های‌پس ۷۰ هرتز، کُروس دوتایی، ریورب کوتاه با پاسخ ضربهٔ تولیدشده). هیچ نمونهٔ صوتی تازه‌ای اضافه نشده است.
- تصویرهای دست در راهنمای تصویری و آیکون‌های شیشه‌ای ساز، SVGهای ساخته‌شده برای همین پروژه‌اند.
- خروجی MIDI: ملودی با برنامهٔ 0 و پد با GM 89 (Pad 2 – warm)؛ در حالت «گردشده» ملودی کانال ۱ و پد کانال ۲.
- سطح نمونه‌های FluidR3_GM هنگام بارگیری با ضریب محدود (حداکثر ۸ برابر) هم‌سطح می‌شود؛ فایل‌ها تغییر نمی‌کنند.

## Five-chord performance system
- The accompaniment hand selects one of five slots by showing 1–5 digits (the thumb counts; an open hand is five). A count becomes the chord after a dwell (default 200 ms, adjustable 120–500 ms) and stays without a pinch; another count changes it; a closed fist releases it. Half-way shapes, low-confidence frames and gaps shorter than 450 ms change nothing; after 1.6 s without the hand the pad fades out.
- Slots come from the melody scale (Western: chords built from the scale; Persian presets: modal textures in the mode's own tuning, never Western triads) or from five chords the player chooses (major, minor, sus2, sus4, 7, m7, maj7, diminished, open fifth). Chosen chords are twelve-tone equal tempered whatever the melody tuning is; the interface says so when a Persian mode is selected.
- Chord changes crossfade: common tones keep sounding as the same voices, the others fade out over the transition time (default 0.35 s, adjustable 0.1–1.2 s) while new tones come in about three times faster, so a change is heard at once and still overlaps; fading tails are bounded. With «ضرب همراه» running, changes can wait for the next beat; the waiting chord is shown apart from the sounding one.
- The chord ring in the performance view shows the audio state and is the touch control; keys 1–5 select and 0 releases.
- Left and right: with two hands in view the hand further right in the mirror image is the player's right hand, whatever the model labels say; a tracked hand keeps its side if the hands cross. The label mapping used for a single hand is learned from those moments. (A first report from a real device said the hands were reversed with the old label-only default.)
- Pad sounds: «پد گرم», «زهی نرم», «آوای کُر», «ارگ ملایم», «پیانو برقی», «شیشه‌ای». All six are synthesized in the browser (oscillators, formant filters, slow modulation); none is a recording or claims to be a real instrument. The MIDI export uses the same pad program for all of them.
- Melody zone: when both hands play, the note columns occupy the part of the screen beside the chord list (70% of the width) and, like the octave bands, always lie inside the visible part of the camera picture. A ring between thumb and index shows how close the pinch is, and one hint line says what the melody hand should do next.
- **Limits of what was tested:** all of this was exercised with automated tests on simulated landmarks and in headless Chrome with a fake camera. Finger and thumb thresholds, the dwell time, sound quality and latency have not been checked with real hands, a real camera or real speakers.

## Filming — limits of what was tested
Tested in headless Chrome with a fake camera and a fake microphone: an MP4 with a video track and an audio track is produced, the microphone is requested only after «شروع ضبط», a refused permission falls back to filming without it, and pausing or leaving ends the take. **Not tested:** iPhone/Android behaviour (Safari's `MediaRecorder` and `canvas.captureStream`, what happens to the playback route and quality when the microphone opens, whether a second permission request disturbs the camera), sync between voice and pad on real devices, sound of the voice reverb, and the share sheet. Without headphones the microphone also hears the pad from the speaker.
