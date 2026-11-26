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

const isApple = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Root-mean-square level of 16-bit samples (0…1), measured on every 8th sample. */
export function rms16(a) { if (!a || !a.length) return 0; let s = 0, n = 0; for (let i = 0; i < a.length; i += 8) { const v = a[i] / 32768; s += v * v; n++; } return Math.sqrt(s / n); }
/**
 * Suggested gains so that a sung voice sits a little above the instruments, whatever level the microphone gave.
 * Returns { voice, engine } (linear). Silence is left alone (gain 1).
 */
export function suggestBalance(stems) {
  const v = rms16(stems.voice), e = Math.max(rms16(stems.engine?.[0]), rms16(stems.engine?.[1]));
  const to = (level, target, lo, hi) => level < 1e-4 ? 1 : Math.max(lo, Math.min(hi, target / level));
  return { voice: to(v, 0.11, 0.5, 5), engine: to(e, 0.06, 0.2, 1.5) };
}
function joinInt16(chunks) { let n = 0; for (const c of chunks) n += c.length; const out = new Int16Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }

/**
 * One film take.
 *   new VideoTake({ engine, source, draw, maxSec })
 *     engine: the AudioEngine (its createOutputStream() gives the mix);  source: the performance canvas;
 *     draw(ctx2d, width, height, seconds): optional extra drawing on top of each film frame (chords, title).
 *   await take.start({ mic, reverb, before })  — mic: also record the microphone (asks for permission); reverb 0…0.5;
 *     before: async function awaited after the permission prompt and before recording begins (a countdown)
 *   await take.stop() → { blob, mime, ext, seconds, mic, stems }
 *     stems (when the microphone was used and the browser has AudioWorklet): { sampleRate, engine: [Int16Array L, R],
 *     voice: Int16Array } — the instruments and the voice kept apart, so their levels can be set after the take.
 * The microphone is never sent to the speakers; it only goes into the film.
 */
export class VideoTake {
  constructor({ engine, source, draw = null, maxSec = 120, onLimit = null } = {}) {
    this.engine = engine; this.source = source; this.draw = draw; this.maxSec = maxSec; this.onLimit = onLimit;
    this.recorder = null; this.chunks = []; this.raf = 0; this.t0 = 0; this.mic = null; this.tap = null; this.nodes = []; this.active = false; this.usedMic = false; this.stemNodes = []; this.stems = null;
  }
  get seconds() { return this.active ? (performance.now() - this.t0) / 1000 : 0; }
  async start({ mic = false, reverb = 0.15, fps = 30, long = 1280, before = null } = {}) {
    const sup = videoSupport(); if (!sup.ok) throw new FilmError('unsupported');
    const ctx = this.engine?.ctx; if (!ctx) throw new FilmError('no-audio');
    let micStream = null;
    if (mic) {
      // iPhone and iPad: say beforehand that this page plays and records at once, so sound keeps coming from the speaker
      const session = navigator.audioSession; if (session) { try { this.sessionType = session.type; session.type = 'play-and-record'; } catch {} }
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false }); }
      catch (e) { this._session(); throw new FilmError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'mic-denied' : 'mic-missing', e); }
      // opening the microphone can leave the audio output asleep or very quiet on those devices: wake it, and make the speakers a little louder for the take
      const soon = p => Promise.race([p, new Promise(r => setTimeout(r, 600))]);
      try { if (isApple()) { await soon(ctx.suspend()); await soon(ctx.resume()); this.engine.setMonitor?.(1.6); this.boosted = true; } } catch {}
      if (ctx.state !== 'running') { try { await soon(ctx.resume()); } catch {} }
    }
    try {
      if (before) await before();                                   // layout change and countdown: after the permission prompt, before the first frame
      if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
      const { width, height } = filmSize(this.source.width, this.source.height, long);
      const cv = this.canvas = document.createElement('canvas'); cv.width = width; cv.height = height;
      const g = cv.getContext('2d', { alpha: false });
      const frame = () => { if (!this.active) return; this.raf = requestAnimationFrame(frame);
        try { g.drawImage(this.source, 0, 0, width, height); this.draw?.(g, width, height, this.seconds); } catch {} };
      // the engine's mix, delayed by roughly the time sound needs to reach the ear, so a voice that sings along lines up;
      // with a voice the instruments go a little lower in the film
      this.tap = this.engine.createOutputStream({ delay: micStream ? Math.min(0.3, (ctx.outputLatency || ctx.baseLatency || 0.02) + 0.02) : 0, level: micStream ? 0.6 : 1 });
      if (micStream) {
        this.mic = micStream; this.usedMic = true;
        const src = ctx.createMediaStreamSource(micStream), hp = ctx.createBiquadFilter(), comp = ctx.createDynamicsCompressor(), dry = ctx.createGain(), rv = ctx.createConvolver(), wet = ctx.createGain();
        hp.type = 'highpass'; hp.frequency.value = 90; comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.01; comp.release.value = 0.2;
        dry.gain.value = 1.8; rv.buffer = voiceImpulse(ctx); wet.gain.value = 1.8 * Math.max(0, Math.min(0.5, reverb));
        src.connect(hp).connect(comp); comp.connect(dry).connect(this.tap.dest); comp.connect(rv).connect(wet).connect(this.tap.dest);
        this.nodes = [src, hp, comp, dry, rv, wet]; this.wet = wet;
        await this._stems(ctx, comp);
      }
      const picture = cv.captureStream(fps);
      this.stream = new MediaStream([...picture.getVideoTracks(), ...this.tap.stream.getAudioTracks()]);
      this.mime = sup.mime; this.ext = sup.ext;
      this.recorder = new MediaRecorder(this.stream, { ...(sup.mime ? { mimeType: sup.mime } : {}), videoBitsPerSecond: Math.round(width * height * 3.6), audioBitsPerSecond: 128000 });
      this.chunks = []; this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.done = new Promise(res => { this.recorder.onstop = res; this.recorder.onerror = res; });
      this.active = true; this.t0 = performance.now(); frame(); this.recorder.start(1000);
      this._goFrame = Math.round(ctx.currentTime * ctx.sampleRate); this._stemGo = true;   // stems and picture begin together
      this.limit = setTimeout(() => this.onLimit?.(), this.maxSec * 1000);
    } catch (e) { this._release(); micStream?.getTracks().forEach(t => t.stop()); throw e instanceof FilmError ? e : new FilmError('failed', e); }
  }
  /** Keep the instruments and the voice apart as well (16-bit, in memory), so the balance can be set afterwards. */
  async _stems(ctx, voiceNode) {
    if (!ctx.audioWorklet || !globalThis.AudioWorkletNode) return;
    try {
      await ctx.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
      const mk = (channels, from) => { const n = new AudioWorkletNode(ctx, 'air-stem', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: channels, channelCountMode: 'explicit', processorOptions: { channels } });
        const sink = ctx.createGain(); sink.gain.value = 0; from.connect(n); n.connect(sink).connect(ctx.destination); this.nodes.push(sink); return n; };
      const eng = mk(2, this.tap.pre), voc = mk(1, voiceNode); const E = [[], []], V = [];
      this._stemGo = false;                                         // blocks that arrive before the film itself starts are dropped
      const keep = (e, into) => { if (!this._stemGo) return; let { f, d } = e.data; const cut = this._goFrame - f;
        if (cut >= d[0].length) return; if (cut > 0) d = d.map(a => a.subarray(cut)); into.forEach((arr, i) => arr.push(d[i] || d[0])); };
      eng.port.onmessage = e => keep(e, E); voc.port.onmessage = e => keep(e, [V]);
      this.stemNodes = [eng, voc]; this._collect = () => ({ sampleRate: ctx.sampleRate, engine: [joinInt16(E[0]), joinInt16(E[1])], voice: joinInt16(V) });
    } catch { this.stemNodes = []; this._collect = null; }
  }
  /** Voice reverb amount while filming (0…0.5). */
  setReverb(v) { if (this.wet) this.wet.gain.setTargetAtTime(1.8 * Math.max(0, Math.min(0.5, v)), this.engine.ctx.currentTime, 0.05); }
  async stop() {
    if (!this.recorder) return null;
    const seconds = this.seconds, rec = this.recorder; this.active = false;
    try { if (rec.state !== 'inactive') rec.stop(); } catch {}
    for (const n of this.stemNodes) { try { n.port.postMessage('stop'); } catch {} }
    await Promise.race([this.done, new Promise(r => setTimeout(r, 4000))]);
    await new Promise(r => setTimeout(r, 80));                                  // the last stem blocks
    const blob = new Blob(this.chunks, { type: (rec.mimeType || this.mime || 'video/webm').split(';')[0] });
    const stems = this._collect ? this._collect() : null;
    this._release();
    return { blob, mime: blob.type, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', seconds, mic: this.usedMic, stems: stems && stems.voice.length ? stems : null };
  }
  /** Stop and throw the take away. */
  cancel() { this.active = false; try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch {} this._release(); this.chunks = []; }
  _session() { const session = navigator.audioSession; if (session && this.sessionType !== undefined) { try { session.type = this.sessionType || 'auto'; } catch {} this.sessionType = undefined; } }
  _release() {
    this.active = false; cancelAnimationFrame(this.raf); clearTimeout(this.limit);
    for (const n of this.stemNodes) { try { n.port.onmessage = null; n.disconnect(); } catch {} } this.stemNodes = [];
    for (const n of this.nodes) { try { n.disconnect(); } catch {} } this.nodes = [];
    this.mic?.getTracks().forEach(t => t.stop()); this.mic = null;          // the microphone is released the moment the take ends
    this._session(); if (this.boosted) { this.engine.setMonitor?.(1); this.boosted = false; }
    this.stream?.getVideoTracks().forEach(t => t.stop()); this.stream = null;
    this.tap?.close(); this.tap = null; this.recorder = null; this.canvas = null; this._collect = null;
  }
}

/**
 * Setting the balance after a take. The picture comes from the recorded film; the sound is mixed again from the two
 * stems with the chosen levels and voice reverb.
 *   const mix = new FilmMix({ blob, stems });  mix.levels = { voice, engine, reverb }  (voice/engine: 0…2 around the
 *   suggested balance, reverb 0…0.5)
 *   await mix.preview(videoElement)   — plays the stems in step with the (muted) video; levels can be moved while it plays
 *   await mix.build(onProgress)       → { blob, mime, ext }  (takes as long as the film: it is filmed again with the new sound)
 *   mix.close()
 */
export class FilmMix {
  constructor({ blob, stems, ctx = null }) { this.blob = blob; this.stems = stems; this.shared = ctx; this.base = suggestBalance(stems); this.levels = { voice: 1, engine: 1, reverb: 0.15 }; this.ctx = null; this.live = null; this.seconds = stems.voice.length / stems.sampleRate; }
  _ctx() {
    if (this.ctx) return this.ctx;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext, c = this.ctx = this.shared || new AC(), st = this.stems;   // the instrument's own context is already allowed to sound
    const f32 = a => { const o = new Float32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] / 32768; return o; };
    this.engBuf = c.createBuffer(2, Math.max(1, st.engine[0].length), st.sampleRate); this.engBuf.copyToChannel(f32(st.engine[0]), 0); this.engBuf.copyToChannel(f32(st.engine[1]), 1);
    this.vocBuf = c.createBuffer(1, Math.max(1, st.voice.length), st.sampleRate); this.vocBuf.copyToChannel(f32(st.voice), 0);
    this.impulse = voiceImpulse(c); this.stems = null;             // the 16-bit copies are no longer needed
    return c;
  }
  /** Build the graph into `out`; returns { start(offset), stop(), apply() }. */
  _graph(out) {
    const c = this._ctx(), eg = c.createGain(), vg = c.createGain(), rv = c.createConvolver(), wg = c.createGain(), lim = c.createDynamicsCompressor(), trim = c.createGain();
    rv.buffer = this.impulse; lim.threshold.value = -3; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.003; lim.release.value = 0.15; trim.gain.value = 0.7;
    eg.connect(lim); vg.connect(lim); vg.connect(rv).connect(wg).connect(lim); lim.connect(trim).connect(out);
    let srcs = [];
    const apply = () => { const L = this.levels, t = c.currentTime; eg.gain.setTargetAtTime(this.base.engine * L.engine, t, 0.03); vg.gain.setTargetAtTime(this.base.voice * L.voice, t, 0.03); wg.gain.setTargetAtTime(Math.max(0, Math.min(0.5, L.reverb)) * 1.6, t, 0.03); };
    const stop = () => { for (const s of srcs) { try { s.stop(); s.disconnect(); } catch {} } srcs = []; };
    const start = (offset = 0, when = 0) => { stop(); const a = c.createBufferSource(), b = c.createBufferSource(); a.buffer = this.engBuf; b.buffer = this.vocBuf; a.connect(eg); b.connect(vg);
      const o = Math.max(0, Math.min(offset, this.seconds)); a.start(when, o); b.start(when, o); srcs = [a, b]; };
    apply();
    return { start, stop, apply, close: () => { stop(); for (const n of [eg, vg, rv, wg, lim, trim]) { try { n.disconnect(); } catch {} } } };
  }
  set(levels) { Object.assign(this.levels, levels); this.live?.apply(); this.job?.apply(); }
  /** Listen to the mix with the film: the video element is muted and the stems follow its play, pause and seeking. */
  async preview(video) {
    const c = this._ctx(); if (c.state !== 'running') { try { await c.resume(); } catch {} }
    if (this.live || this.building) return; const gph = this.live = this._graph(c.destination); video.muted = true;
    const sync = () => { if (!video.paused && !video.ended) gph.start(video.currentTime); else gph.stop(); };
    this._unhook = () => { for (const ev of ['play', 'pause', 'seeked', 'ended', 'waiting']) video.removeEventListener(ev, sync); };
    for (const ev of ['play', 'pause', 'seeked', 'ended', 'waiting']) video.addEventListener(ev, sync);
    sync();
  }
  /**
   * Film the picture again with the sound at the chosen levels. Real time: a one-minute film takes one minute.
   * `video`: the element to play the take in (the visible preview, so the player sees it being made).
   */
  async build(onProgress, video = null) {
    const sup = videoSupport(); if (!sup.ok) throw new FilmError('unsupported');
    const c = this._ctx(); if (c.state !== 'running') { try { await c.resume(); } catch {} }
    this.building = true; this._unhook?.(); this.live?.close(); this.live = null;
    const v = video || document.createElement('video'), url = URL.createObjectURL(this.blob); let job = null, stream = null;
    try {
      v.pause(); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise((res, rej) => { const ok = () => { v.removeEventListener('loadeddata', ok); res(); }; v.addEventListener('loadeddata', ok); v.addEventListener('error', () => rej(new FilmError('failed')), { once: true }); setTimeout(ok, 5000); v.load?.(); });
      const W = v.videoWidth || 720, H = v.videoHeight || 1280, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { alpha: false });
      const dest = c.createMediaStreamDestination(); job = this.job = this._graph(dest);
      stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(stream, { ...(sup.mime ? { mimeType: sup.mime } : {}), videoBitsPerSecond: Math.round(W * H * 5), audioBitsPerSecond: 160000 }), chunks = [];
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise(res => { rec.onstop = res; rec.onerror = res; });
      try { g.drawImage(v, 0, 0, W, H); } catch {}
      await v.play(); job.start(0, c.currentTime + 0.05); rec.start(1000);      // the picture needs a frame or two to reach the film; the sound waits for it
      const t0 = performance.now(), total = this.seconds;
      await new Promise(res => { const tick = () => { try { g.drawImage(v, 0, 0, W, H); } catch {} const t = (performance.now() - t0) / 1000; onProgress?.(Math.min(1, t / total));
        if (this.cancelled || v.ended || t > total + 0.25) res(); else requestAnimationFrame(tick); }; tick(); });
      try { rec.stop(); } catch {} await Promise.race([stopped, new Promise(r => setTimeout(r, 4000))]);
      if (this.cancelled) throw new FilmError('cancelled');
      const blob = new Blob(chunks, { type: (rec.mimeType || sup.mime || 'video/webm').split(';')[0] });
      if (!blob.size) throw new FilmError('failed');
      return { blob, mime: blob.type, ext: blob.type.includes('mp4') ? 'mp4' : 'webm' };
    } finally { this.building = false; job?.close(); this.job = null; stream?.getTracks().forEach(t => t.stop()); try { v.pause(); } catch {} URL.revokeObjectURL(url); }
  }
  close() { this.cancelled = true; this._unhook?.(); this.live?.close(); this.live = null; this.job?.close(); this.job = null; if (!this.shared) { try { this.ctx?.close(); } catch {} } this.ctx = null; this.engBuf = this.vocBuf = null; }
}
