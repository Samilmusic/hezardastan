// HezarAva Air Studio — camera acquisition and MediaPipe Hand Landmarker inference.
// Frames are processed in this tab only. Nothing is uploaded, recorded or stored. No microphone is requested.
//
// Worker path evaluated: tasks-vision 0.10.18 can run in a module worker, but each frame then has to be copied
// with createImageBitmap and GPU delegation inside workers is unavailable or unreliable in Safari. We therefore run
// inference on the main thread with an adaptive interval and drop frames rather than queue them, so the audio
// thread (which never waits on inference) stays responsive.

const VENDOR = new URL('./vendor/', import.meta.url);
export const MODEL_URL = new URL('models/hand_landmarker.task', VENDOR).href;
export const WASM_BASE = new URL('mediapipe/wasm', VENDOR).href;

export class CameraError extends Error { constructor(code, detail) { super(code); this.code = code; this.detail = detail; } }

export class Camera {
  constructor(video) { this.video = video; this.stream = null; }
  async start({ quality = 'normal' } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('unsupported');
    const size = quality === 'low' ? { width: 480, height: 360 } : { width: 640, height: 480 };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: 30, max: 30 } } });
    } catch (e) {
      const map = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'missing', OverconstrainedError: 'missing', NotReadableError: 'busy', AbortError: 'busy' };
      throw new CameraError(map[e?.name] || 'failed', e?.name);
    }
    this.video.srcObject = this.stream; this.video.muted = true; this.video.playsInline = true;
    await this.video.play().catch(() => {});
    if (!this.video.videoWidth) await new Promise(r => this.video.addEventListener('loadedmetadata', r, { once: true }));
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.onended?.());
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }
  get active() { return !!this.stream?.getVideoTracks().some(t => t.readyState === 'live'); }
  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null; if (this.video) { this.video.pause?.(); this.video.srcObject = null; }
  }
}

/** Download the model with byte progress (honest progress: real bytes, not a timer). */
async function fetchWithProgress(url, onProgress, signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new CameraError('model-failed', 'status ' + r.status);
  const total = Number(r.headers.get('content-length')) || 7819105;
  if (!r.body?.getReader) { const b = new Uint8Array(await r.arrayBuffer()); onProgress?.(1); return b; }
  const reader = r.body.getReader(), parts = []; let got = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(Math.min(1, got / total)); }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export class HandTracker {
  constructor() { this.landmarker = null; this.running = false; this.stats = { hz: 0, ms: 0, dropped: 0, delegate: '' }; }
  async load({ onProgress, signal } = {}) {
    if (this.landmarker) return;
    let vision;
    try { vision = await import('./vendor/mediapipe/vision_bundle.mjs'); }
    catch (e) { throw new CameraError('runtime-failed', e?.message); }
    const model = await fetchWithProgress(MODEL_URL, p => onProgress?.(0.1 + p * 0.8), signal);
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let fileset;
    try { fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE); }
    catch (e) { throw new CameraError('runtime-failed', e?.message); }
    this._create = d => vision.HandLandmarker.createFromOptions(fileset, opts(d));
    const opts = d => ({ baseOptions: { modelAssetBuffer: model, delegate: d }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.5 });
    try { this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU')); this.stats.delegate = 'GPU'; }
    catch {
      try { this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU')); this.stats.delegate = 'CPU'; }
      catch (e) { throw new CameraError('runtime-failed', e?.message); }
    }
    onProgress?.(1);
  }
  /** Start the inference loop. onResult(timestampMs, hands[]) where hands = [{landmarks, label, score}]. */
  start(video, onResult) {
    if (!this.landmarker || this.running) return;
    this.running = true; this.video = video; this.onResult = onResult;
    this.interval = 33; let lastVideoTime = -1, lastRun = 0, busy = false, times = [], runs = [];
    const step = (now) => {
      if (!this.running) return;
      schedule();
      if (busy || video.readyState < 2) return;
      const vt = video.currentTime;
      if (vt === lastVideoTime) return;               // never process the same frame twice
      if (now - lastRun < this.interval) { this.stats.dropped++; return; }
      lastVideoTime = vt; lastRun = now; busy = true;
      const t0 = performance.now();
      let result;
      try { result = this.landmarker.detectForVideo(video, t0); }
      catch (e) { busy = false; this.onError?.(e); return; }
      const ms = performance.now() - t0; busy = false;
      if (this.resetStats) { times = []; this.resetStats = false; }
      times.push(ms); runs.push(t0); if (times.length > 30) times.shift(); while (runs.length && t0 - runs[0] > 1000) runs.shift();
      this.stats.ms = times.reduce((a, b) => a + b, 0) / times.length; this.stats.hz = runs.length;
      // adapt: slower devices get a longer interval (fewer inferences) instead of a blocked main thread
      this.interval = Math.max(28, Math.min(120, this.stats.ms * 1.8));
      // a software-emulated GPU can be far slower than the CPU path: switch once if GPU inference is slow
      if (this.stats.delegate === 'GPU' && times.length >= 6 && this.stats.ms > 70 && !this.switching) this._toCpu();
      this.stats.slow = times.length >= 10 && this.stats.ms > 140;
      const hands = (result.landmarks || []).map((lm, i) => ({ landmarks: lm, label: result.handedness?.[i]?.[0]?.categoryName || 'Unknown', score: result.handedness?.[i]?.[0]?.score ?? 0 }));
      onResult(t0, hands);
    };
    const schedule = () => {
      if (!this.running) return;
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) this.handle = video.requestVideoFrameCallback(n => step(n));
      else this.handle = requestAnimationFrame(step);
    };
    this.cancel = () => { if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) try { video.cancelVideoFrameCallback(this.handle); } catch {} cancelAnimationFrame(this.handle); };
    schedule();
  }
  async _toCpu() {
    this.switching = true;
    try { const next = await this._create('CPU'); const old = this.landmarker; this.landmarker = next; this.stats.delegate = 'CPU'; this.resetStats = true; try { old.close(); } catch {} this.onDelegate?.('CPU'); }
    catch { /* keep GPU */ }
  }
  stop() { this.running = false; this.cancel?.(); }
  dispose() { this.stop(); try { this.landmarker?.close(); } catch {} this.landmarker = null; }
}

/** Average luminance (0–255) of a tiny downscaled frame, for the low-light hint. */
export function frameBrightness(video, canvas) {
  if (!video.videoWidth) return null;
  canvas.width = 32; canvas.height = 24;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(video, 0, 0, 32, 24);
  const d = g.getImageData(0, 0, 32, 24).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return s / (d.length / 4);
}
