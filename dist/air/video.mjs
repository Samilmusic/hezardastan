// دستانِ نوا — filming a performance. Everything happens in this tab: the picture is copied from the performance
// canvas, the sound is the engine's own mix plus (only if the player turns it on) the microphone, and the result
// is a file in memory that the player saves or shares. Nothing is uploaded.

/** Can this browser film, and in which container? mp4 is preferred because social apps accept it. */
export function videoSupport() {
  const MR = globalThis.MediaRecorder, cv = globalThis.HTMLCanvasElement?.prototype;
  if (!MR || !cv?.captureStream) return { ok: false, mime: '', ext: '' };
  const types = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find(t => { try { return MR.isTypeSupported(t); } catch { return false; } }) || '';
  return { ok: true, mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/** Size of the film: the picture's own shape, long side at most `long` px, both sides even (encoders need that). */
export function filmSize(w, h, long = 1280) {
  const k = Math.min(1, long / Math.max(w, h, 1)), even = v => Math.max(2, Math.round(v * k / 2) * 2);
  return { width: even(w), height: even(h) };
}

/** A short, smooth reverb tail for a voice (seconds), generated — no impulse file is loaded. */
export function voiceImpulse(ctx, seconds = 1.6) {
  const len = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, len, ctx.sampleRate), pre = Math.floor(ctx.sampleRate * 0.018);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0, seed = 31 + ch * 977;
    for (let i = pre; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = seed / 0x3fffffff - 1, k = (i - pre) / (len - pre);
      lp += (n - lp) * (0.6 - 0.48 * k); d[i] = lp * Math.pow(1 - k, 3) * Math.min(1, (i - pre) / (ctx.sampleRate * 0.01)); } }
  return ir;
}

export class FilmError extends Error { constructor(kind, cause) { super(kind); this.kind = kind; this.cause = cause; } }

/**
 * One film take.
 *   new VideoTake({ engine, source, draw, maxSec })
 *     engine: the AudioEngine (its createOutputStream() gives the mix);  source: the performance canvas;
 *     draw(ctx2d, width, height, seconds): optional extra drawing on top of each film frame (chords, title).
 *   await take.start({ mic, reverb, before })  — mic: also record the microphone (asks for permission); reverb 0…0.5;
 *     before: async function awaited after the permission prompt and before recording begins (a countdown)
 *   await take.stop() → { blob, mime, ext, seconds, mic }
 * The microphone is never sent to the speakers; it only goes into the film.
 */
export class VideoTake {
  constructor({ engine, source, draw = null, maxSec = 180, onLimit = null } = {}) {
    this.engine = engine; this.source = source; this.draw = draw; this.maxSec = maxSec; this.onLimit = onLimit;
    this.recorder = null; this.chunks = []; this.raf = 0; this.t0 = 0; this.mic = null; this.tap = null; this.nodes = []; this.active = false; this.usedMic = false;
  }
  get seconds() { return this.active ? (performance.now() - this.t0) / 1000 : 0; }
  async start({ mic = false, reverb = 0.15, fps = 30, long = 1280, before = null } = {}) {
    const sup = videoSupport(); if (!sup.ok) throw new FilmError('unsupported');
    const ctx = this.engine?.ctx; if (!ctx) throw new FilmError('no-audio');
    let micStream = null;
    if (mic) {
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false }); }
      catch (e) { throw new FilmError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'mic-denied' : 'mic-missing', e); }
    }
    try {
      if (before) await before();                                   // layout change and countdown: after the permission prompt, before the first frame
      const { width, height } = filmSize(this.source.width, this.source.height, long);
      const cv = this.canvas = document.createElement('canvas'); cv.width = width; cv.height = height;
      const g = cv.getContext('2d', { alpha: false });
      const frame = () => { if (!this.active) return; this.raf = requestAnimationFrame(frame);
        try { g.drawImage(this.source, 0, 0, width, height); this.draw?.(g, width, height, this.seconds); } catch {} };
      // the engine's mix, delayed by roughly the time sound needs to reach the ear, so a voice that sings along lines up
      this.tap = this.engine.createOutputStream({ delay: micStream ? Math.min(0.3, (ctx.outputLatency || ctx.baseLatency || 0.02) + 0.02) : 0 });
      if (micStream) {
        this.mic = micStream; this.usedMic = true;
        const src = ctx.createMediaStreamSource(micStream), hp = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor(), dry = ctx.createGain(), rv = ctx.createConvolver(), wet = ctx.createGain();
        hp.type = 'highpass'; hp.frequency.value = 90; comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
        dry.gain.value = 1; rv.buffer = voiceImpulse(ctx); wet.gain.value = Math.max(0, Math.min(0.5, reverb));
        src.connect(hp).connect(comp); comp.connect(dry).connect(this.tap.dest); comp.connect(rv).connect(wet).connect(this.tap.dest);
        this.nodes = [src, hp, comp, dry, rv, wet]; this.wet = wet;
      }
      const picture = cv.captureStream(fps);
      this.stream = new MediaStream([...picture.getVideoTracks(), ...this.tap.stream.getAudioTracks()]);
      this.mime = sup.mime; this.ext = sup.ext;
      this.recorder = new MediaRecorder(this.stream, { ...(sup.mime ? { mimeType: sup.mime } : {}), videoBitsPerSecond: Math.round(width * height * 3.6), audioBitsPerSecond: 128000 });
      this.chunks = []; this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.done = new Promise(res => { this.recorder.onstop = res; this.recorder.onerror = res; });
      this.active = true; this.t0 = performance.now(); frame(); this.recorder.start(1000);
      this.limit = setTimeout(() => this.onLimit?.(), this.maxSec * 1000);
    } catch (e) { this._release(); micStream?.getTracks().forEach(t => t.stop()); throw e instanceof FilmError ? e : new FilmError('failed', e); }
  }
  /** Voice reverb amount while filming (0…0.5). */
  setReverb(v) { if (this.wet) this.wet.gain.setTargetAtTime(Math.max(0, Math.min(0.5, v)), this.engine.ctx.currentTime, 0.05); }
  async stop() {
    if (!this.recorder) return null;
    const seconds = this.seconds, rec = this.recorder; this.active = false;
    try { if (rec.state !== 'inactive') rec.stop(); } catch {}
    await Promise.race([this.done, new Promise(r => setTimeout(r, 4000))]);
    const blob = new Blob(this.chunks, { type: (rec.mimeType || this.mime || 'video/webm').split(';')[0] });
    this._release();
    return { blob, mime: blob.type, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', seconds, mic: this.usedMic };
  }
  /** Stop and throw the take away. */
  cancel() { this.active = false; try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch {} this._release(); this.chunks = []; }
  _release() {
    this.active = false; cancelAnimationFrame(this.raf); clearTimeout(this.limit);
    for (const n of this.nodes) { try { n.disconnect(); } catch {} } this.nodes = [];
    this.mic?.getTracks().forEach(t => t.stop()); this.mic = null;          // the microphone is released the moment the take ends
    this.stream?.getVideoTracks().forEach(t => t.stop()); this.stream = null;
    this.tap?.close(); this.tap = null; this.recorder = null; this.canvas = null;
  }
}
