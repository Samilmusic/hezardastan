// HezarAva Air Studio — Web Audio engine. One AudioContext, created/resumed from the start gesture.
// Layers: instruments (sampled or synthesized, any frequency) → voice pools → buses → limiter → output (+ recorder tap).
// Pitch is always given in Hz; sampled voices use playbackRate = f / f_sample, so microtones are exact, never rounded.

export const INSTRUMENTS = {
  piano: { fa: 'پیانو', kind: 'sampled', dir: 'acoustic_grand_piano', attack: 0.004, release: 0.35, gain: 0.9, loop: null, source: 'FluidR3_GM — Acoustic Grand Piano' },
  guitar: { fa: 'گیتار نایلون', kind: 'sampled', dir: 'acoustic_guitar_nylon', attack: 0.003, release: 0.3, gain: 1.0, loop: null, source: 'FluidR3_GM — Acoustic Guitar (nylon)' },
  epiano: { fa: 'پیانوی الکتریک', kind: 'sampled', dir: 'electric_piano_1', attack: 0.004, release: 0.4, gain: 0.9, loop: null, source: 'FluidR3_GM — Electric Piano 1' },
  violin: { fa: 'ویولن', kind: 'sampled', dir: 'violin', attack: 0.06, release: 0.22, gain: 0.85, loop: [0.55, 2.45], source: 'FluidR3_GM — Violin' },
  soft: { fa: 'سینت نرم', kind: 'synth', release: 0.45, gain: 0.5, source: 'سنتز در مرورگر' },
  pluck: { fa: 'زخمه‌ای سنتزی', kind: 'pluck', release: 0.25, gain: 0.8, source: 'سنتز Karplus–Strong در مرورگر؛ صدای واقعی تار یا سه‌تار نیست' },
};
// Sample grid: C, E♭, G♭, A in octaves 1–7 (FluidR3_GM via gleitz/midi-js-soundfonts, CC BY 3.0).
const SAMPLE_NOTES = [];
for (let o = 1; o <= 7; o++) for (const [n, pc] of [['C', 0], ['Eb', 3], ['Gb', 6], ['A', 9]]) SAMPLE_NOTES.push({ file: n + o, midi: (o + 1) * 12 + pc });
const BASE = new URL('./samples/', import.meta.url);

export class AudioEngine {
  constructor({ maxMelody = 10, maxAccomp = 6, recordLimitSec = 300 } = {}) {
    this.ctx = null; this.maxMelody = maxMelody; this.maxAccomp = maxAccomp; this.recordLimitSec = recordLimitSec;
    this.voices = new Map(); this.nextId = 1; this.listeners = new Set();
    this.instrument = 'soft'; this.cache = new Map(); this.loading = null;
    this.accompIds = []; this.rhythm = null; this.recording = null; this.disposed = false;
  }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e) { for (const fn of this.listeners) try { fn(e); } catch {} }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  async start() {
    if (this.disposed) throw new Error('disposed');
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('webaudio-unsupported');
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.8;
      this.limiter = c.createDynamicsCompressor();
      Object.assign(this.limiter, {}); this.limiter.threshold.value = -8; this.limiter.knee.value = 4; this.limiter.ratio.value = 18; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2;
      this.out = c.createGain(); this.out.gain.value = 1;
      this.buses = { melody: c.createGain(), accomp: c.createGain(), rhythm: c.createGain() };
      this.buses.accomp.gain.value = 0.35; this.buses.rhythm.gain.value = 0.5;
      for (const b of Object.values(this.buses)) b.connect(this.master);
      this.master.connect(this.limiter).connect(this.out).connect(c.destination);
      c.onstatechange = () => this.emit({ type: 'state', state: c.state });
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx.state;
  }
  get state() { return this.ctx ? this.ctx.state : 'none'; }
  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // ---------------------------------------------------------------- instruments
  async setInstrument(key, { onProgress, signal } = {}) {
    const def = INSTRUMENTS[key];
    if (!def) throw new Error('unknown instrument');
    if (def.kind === 'sampled' && !this.cache.has(key)) {
      if (!this.ctx) throw new Error('audio-not-started');
      const job = this._loadSamples(key, def, onProgress, signal);
      this.loading = job;
      await job;
    }
    this.instrument = key;
    this.emit({ type: 'instrument', key });
  }
  async _loadSamples(key, def, onProgress, signal) {
    const buffers = []; let done = 0;
    await Promise.all(SAMPLE_NOTES.map(async s => {
      const r = await fetch(new URL(def.dir + '/' + s.file + '.mp3', BASE), { signal });
      if (!r.ok) throw new Error('sample-missing');
      const data = await r.arrayBuffer();
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      const buf = await this.ctx.decodeAudioData(data);
      buffers.push({ ...s, buf }); done++; onProgress?.(done / SAMPLE_NOTES.length);
    }));
    buffers.sort((a, b) => a.midi - b.midi);
    this.cache.set(key, buffers);
    // keep decoded audio bounded: at most two sampled instruments in memory
    const sampled = [...this.cache.keys()].filter(k => k !== key);
    while (sampled.length > 1) { const k = sampled.shift(); if (k !== this.instrument) this.cache.delete(k); }
  }

  // ---------------------------------------------------------------- voices
  _countBus(bus) { let n = 0; for (const v of this.voices.values()) if (v.bus === bus && !v.releasing) n++; return n; }
  _steal(bus) {
    let oldest = null;
    for (const v of this.voices.values()) if (v.bus === bus && (!oldest || (v.releasing && !oldest.releasing) || v.start < oldest.start)) oldest = v;
    if (oldest) this.noteOff(oldest.id, { fast: true });
  }
  noteOn(freq, { velocity = 0.8, bus = 'melody', instrument = null, meta = {} } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || !(freq > 10 && freq < 20000)) return null;
    const max = bus === 'accomp' ? this.maxAccomp : this.maxMelody;
    while (this._countBus(bus) >= max) this._steal(bus);
    const key = instrument || (bus === 'accomp' ? 'pad' : this.instrument);
    const c = this.ctx, t = c.currentTime + 0.005, id = this.nextId++;
    const env = c.createGain(); env.gain.value = 0; env.connect(this.buses[bus]);
    const v = { id, bus, key, freq, env, nodes: [], start: t, releasing: false, release: 0.3 };
    const peak = Math.max(0.05, Math.min(1, velocity));
    if (key === 'pad') this._pad(v, freq, t, peak);
    else {
      const def = INSTRUMENTS[key];
      v.release = def.release;
      if (def.kind === 'sampled') this._sampled(v, def, freq, t, peak * def.gain);
      else if (def.kind === 'pluck') this._pluck(v, freq, t, peak * def.gain);
      else this._synth(v, freq, t, peak * def.gain);
    }
    this.voices.set(id, v);
    this.emit({ type: 'on', id, freq, time: t, velocity: peak, bus, ...meta });
    return id;
  }
  _sampled(v, def, freq, t, peak) {
    const set = this.cache.get(v.key);
    if (!set) return this._synth(v, freq, t, peak * 0.5);
    const midi = 69 + 12 * Math.log2(freq / 440);
    let best = set[0]; for (const s of set) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    const src = this.ctx.createBufferSource(); src.buffer = best.buf;
    src.playbackRate.value = freq / (440 * Math.pow(2, (best.midi - 69) / 12));
    if (def.loop) { src.loop = true; src.loopStart = def.loop[0]; src.loopEnd = Math.min(def.loop[1], best.buf.duration - 0.05); }
    src.connect(v.env);
    v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak, t + def.attack);
    src.start(t); v.nodes.push(src); v.rate = src.playbackRate; v.sampleFreq = 440 * Math.pow(2, (best.midi - 69) / 12);
    src.onended = () => this._cleanup(v.id);
  }
  _synth(v, freq, t, peak) {
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(8000, freq * 6); f.Q.value = 0.4;
    const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
    o1.type = 'triangle'; o2.type = 'sine'; o1.frequency.value = freq; o2.frequency.value = freq; o2.detune.value = 5; g2.gain.value = 0.5;
    o1.connect(f); o2.connect(g2).connect(f); f.connect(v.env);
    v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak, t + 0.025); v.env.gain.setTargetAtTime(peak * 0.7, t + 0.025, 0.25);
    o1.start(t); o2.start(t); v.nodes.push(o1, o2); v.oscs = [o1, o2]; v.filter = f;
  }
  _pad(v, freq, t, peak) {
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 0.3;
    const oscs = [-6, 0, 6].map(d => { const o = c.createOscillator(); o.type = d ? 'sawtooth' : 'triangle'; o.frequency.value = freq; o.detune.value = d; const g = c.createGain(); g.gain.value = d ? 0.12 : 0.5; o.connect(g).connect(f); return o; });
    f.connect(v.env);
    v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak * 0.5, t + 0.35);
    oscs.forEach(o => o.start(t)); v.nodes.push(...oscs); v.oscs = oscs; v.release = 0.8;
  }
  _pluck(v, freq, t, peak) {
    // Karplus–Strong rendered once per pitch into a buffer, then pitch-corrected exactly with playbackRate.
    const sr = this.ctx.sampleRate, N = Math.max(2, Math.round(sr / freq)), len = Math.floor(sr * 2.4);
    const key = 'ks' + N; let buf = this.cache.get(key);
    if (!buf) {
      buf = this.ctx.createBuffer(1, len, sr); const d = buf.getChannelData(0), line = new Float32Array(N);
      let seed = 12345; for (let i = 0; i < N; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; line[i] = (seed / 0x7fffffff) * 2 - 1; }
      let p = 0; for (let i = 0; i < len; i++) { const nx = (p + 1) % N; const val = line[p]; d[i] = val; line[p] = 0.996 * 0.5 * (val + line[nx]); p = nx; }
      this.cache.set(key, buf);
      if (this.cache.size > 80) { for (const k of this.cache.keys()) if (k.startsWith('ks') && k !== key) { this.cache.delete(k); break; } }
    }
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = freq / (sr / (N + 0.5));
    const tone = this.ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Math.min(9000, freq * 10);
    src.connect(tone).connect(v.env);
    v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak, t + 0.002);
    src.start(t); v.nodes.push(src, tone); v.rate = src.playbackRate; v.sampleFreq = sr / (N + 0.5);
    src.onended = () => this._cleanup(v.id);
  }
  /** Retune a sounding voice (glide policy, accompaniment expression). */
  setFrequency(id, freq, glide = 0.06) {
    const v = this.voices.get(id); if (!v || v.releasing) return;
    const t = this.ctx.currentTime;
    if (v.rate) v.rate.setTargetAtTime(freq / v.sampleFreq, t, glide / 3);
    if (v.oscs) v.oscs.forEach(o => o.frequency.setTargetAtTime(freq, t, glide / 3));
    v.freq = freq; this.emit({ type: 'bend', id, freq, time: t });
  }
  noteOff(id, { fast = false } = {}) {
    const v = this.voices.get(id); if (!v || v.releasing) return;
    v.releasing = true;
    const t = this.ctx.currentTime, r = fast ? 0.03 : v.release;
    v.env.gain.cancelScheduledValues(t); v.env.gain.setValueAtTime(Math.max(0.0001, v.env.gain.value), t);
    v.env.gain.setTargetAtTime(0, t, r / 4);
    for (const n of v.nodes) if (n.stop) try { n.stop(t + r + 0.1); } catch {}
    v.timer = setTimeout(() => this._cleanup(id), (r + 0.2) * 1000);
    this.emit({ type: 'off', id, time: t, bus: v.bus });
  }
  _cleanup(id) {
    const v = this.voices.get(id); if (!v) return;
    if (!v.releasing) this.emit({ type: 'off', id, time: this.ctx.currentTime, bus: v.bus }); // natural end of a one-shot sample
    clearTimeout(v.timer);
    for (const n of v.nodes) { try { n.disconnect(); } catch {} }
    try { v.env.disconnect(); } catch {}
    this.voices.delete(id);
  }
  get activeVoices() { let n = 0; for (const v of this.voices.values()) if (!v.releasing) n++; return n; }

  // ---------------------------------------------------------------- accompaniment & expression
  setAccompaniment(freqs, meta = {}) {
    for (const id of this.accompIds) this.noteOff(id);
    this.accompIds = (freqs || []).map(f => this.noteOn(f, { bus: 'accomp', velocity: 0.7, meta })).filter(Boolean);
  }
  releaseAccompaniment() { this.setAccompaniment([]); }
  setExpression(value) { // 0..1, smoothed
    if (!this.ctx) return;
    const g = 0.12 + Math.max(0, Math.min(1, value)) * 0.5;
    this.buses.accomp.gain.setTargetAtTime(g, this.ctx.currentTime, 0.08);
  }

  // ---------------------------------------------------------------- synthesized frame-drum pattern
  startRhythm({ bpm = 90, pattern = 'x..x..x.' } = {}) {
    if (!this.ctx || this.rhythm) return;
    const c = this.ctx, step = 60 / bpm / 2; let next = c.currentTime + 0.08, i = 0;
    const hit = (time, strong) => {
      const g = c.createGain(); g.connect(this.buses.rhythm);
      if (strong) { // «دُم»: low pitched membrane
        const o = c.createOscillator(); o.frequency.setValueAtTime(110, time); o.frequency.exponentialRampToValueAtTime(55, time + 0.18);
        g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(0.9, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);
        o.connect(g); o.start(time); o.stop(time + 0.4); o.onended = () => { o.disconnect(); g.disconnect(); };
      } else { // «تک»: short filtered noise
        const n = c.createBufferSource(), b = c.createBuffer(1, Math.floor(c.sampleRate * 0.08), c.sampleRate), d = b.getChannelData(0);
        for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / d.length);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.2;
        n.buffer = b; g.gain.value = 0.5; n.connect(f).connect(g); n.start(time); n.onended = () => { n.disconnect(); f.disconnect(); g.disconnect(); };
      }
    };
    const tick = () => { while (next < c.currentTime + 0.12) { const s = pattern[i % pattern.length]; if (s !== '.') hit(next, s === 'x'); else if (i % 2 === 1) hit(next, false); next += step; i++; } };
    tick(); this.rhythm = { timer: setInterval(tick, 25), bpm };
    this.emit({ type: 'rhythm', on: true });
  }
  stopRhythm() { if (!this.rhythm) return; clearInterval(this.rhythm.timer); this.rhythm = null; this.emit({ type: 'rhythm', on: false }); }

  /** Everything silent within ~30 ms. */
  panic() {
    this.stopRhythm();
    for (const id of [...this.voices.keys()]) this.noteOff(id, { fast: true });
    this.accompIds = [];
    this.emit({ type: 'panic' });
  }

  // ---------------------------------------------------------------- recording (post-limiter mix: melody + accompaniment + rhythm)
  async startRecording() {
    if (!this.ctx || this.recording) return false;
    const c = this.ctx, chunks = [[], []], limit = this.recordLimitSec * c.sampleRate;
    let frames = 0, node, stopTap;
    const push = (l, r) => { if (frames >= limit) { this.emit({ type: 'record-limit' }); return; } chunks[0].push(l); chunks[1].push(r); frames += l.length; };
    if (c.audioWorklet && window.AudioWorkletNode) {
      await c.audioWorklet.addModule(new URL('./recorder-worklet.js', import.meta.url));
      node = new AudioWorkletNode(c, 'air-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
      node.port.onmessage = e => push(e.data[0], e.data[1]);
      stopTap = () => { node.port.postMessage('stop'); node.port.onmessage = null; };
    } else {
      node = c.createScriptProcessor(4096, 2, 2);
      node.onaudioprocess = e => push(new Float32Array(e.inputBuffer.getChannelData(0)), new Float32Array(e.inputBuffer.getChannelData(1)));
      stopTap = () => { node.onaudioprocess = null; };
    }
    const sink = c.createGain(); sink.gain.value = 0;
    this.out.connect(node); node.connect(sink).connect(c.destination);
    this.recording = { node, sink, chunks, startedAt: c.currentTime, stopTap, frames: () => frames };
    this.emit({ type: 'record', on: true, time: c.currentTime });
    return true;
  }
  recordedSeconds() { return this.recording ? this.recording.frames() / this.ctx.sampleRate : 0; }
  async stopRecording() {
    const r = this.recording; if (!r) return null;
    await new Promise(res => setTimeout(res, 120)); // let the last render quantum arrive
    r.stopTap(); try { this.out.disconnect(r.node); } catch {} try { r.node.disconnect(); r.sink.disconnect(); } catch {}
    this.recording = null;
    this.emit({ type: 'record', on: false, time: this.ctx.currentTime });
    return { chunks: r.chunks, sampleRate: this.ctx.sampleRate, startedAt: r.startedAt, endedAt: this.ctx.currentTime };
  }

  async suspend() { this.panic(); if (this.ctx && this.ctx.state === 'running') await this.ctx.suspend(); }
  async dispose() {
    if (this.disposed) return;
    this.panic();
    if (this.recording) await this.stopRecording().catch(() => {});
    for (const v of [...this.voices.values()]) this._cleanup(v.id);
    this.disposed = true; this.cache.clear(); this.listeners.clear();
    if (this.ctx) { try { await this.ctx.close(); } catch {} }
    this.ctx = null;
  }
}
