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
Camera frames are passed to the model in the page and never stored or transmitted. The microphone is never requested.
Settings (scale, instrument, calibration thresholds) are kept in `localStorage` on the device only.
Site headers: `Permissions-Policy: camera=(self)` and `script-src … 'wasm-unsafe-eval'` (required to compile the
MediaPipe WebAssembly runtime).
