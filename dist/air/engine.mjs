// HezarAva Air Studio — Web Audio engine. One AudioContext, created/resumed from the start gesture.
// Layers: instruments (sampled or synthesized, any frequency) → voice pools → buses → limiter → output (+ recorder tap).
// Pitch is always given in Hz; sampled voices use playbackRate = f / f_sample, so microtones are exact, never rounded.

export const INSTRUMENTS = {
  piano: { fa: 'پیانو', kind: 'sampled', dir: 'acoustic_grand_piano', attack: 0.004, release: 0.35, gain: 0.9, loop: null, source: 'FluidR3_GM — Acoustic Grand Piano' },
  guitar: { fa: 'گیتار نایلون', kind: 'sampled', dir: 'acoustic_guitar_nylon', attack: 0.003, release: 0.3, gain: 1.0, loop: null, source: 'FluidR3_GM — Acoustic Guitar (nylon)' },
  epiano: { fa: 'پیانوی الکتریک', kind: 'sampled', dir: 'electric_piano_1', attack: 0.004, release: 0.4, gain: 0.9, loop: null, source: 'FluidR3_GM — Electric Piano 1' },
  violin: { fa: 'ویولن', kind: 'sampled', dir: 'violin', attack: 0.06, release: 0.22, gain: 0.85, loop: [0.55, 2.45], source: 'FluidR3_GM — Violin' },
  soft: { fa: 'سینت نرم', kind: 'synth', release: 0.45, gain: 0.5, source: 'سنتز در مرورگر' },
  pluck: { fa: 'زخمه‌ای سنتزی', kind: 'pluck', release: 0.25, gain: 1.2, source: 'سنتز Karplus–Strong در مرورگر؛ صدای واقعی تار یا سه‌تار نیست' },
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
    this.pad = { ids: [], label: null, slot: null }; this.rhythm = null; this.recording = null; this.disposed = false;
    this.padSettings = { volume: 0.45, brightness: 'warm', expression: 0.6 };
  }
  get accompIds() { return this.pad.ids; }
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
      this.buses.accomp.gain.value = 1; this.buses.rhythm.gain.value = 0.5;
      for (const b of Object.values(this.buses)) b.connect(this.master);
      this._buildPadChain();
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
      // level-match: the source samples differ by up to ~20 dB between instruments, so each one is scaled to a common
      // peak (bounded) — otherwise a quiet piano would sit under the pad and the limiter would pump on loud ones
      let pk = 1e-4; const ch = buf.getChannelData(0); for (let i = 0; i < ch.length; i += 4) { const a = Math.abs(ch[i]); if (a > pk) pk = a; }
      buffers.push({ ...s, buf, norm: Math.min(8, 0.7 / pk) }); done++; onProgress?.(done / SAMPLE_NOTES.length);
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
    const peak = key === 'pad' ? Math.max(0.01, Math.min(0.5, velocity)) : Math.max(0.05, Math.min(1, velocity));
    if (key === 'pad') this._padVoice(v, freq, t, peak, meta.pan || 0, meta.attack);
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
    v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak * (best.norm || 1), t + def.attack);
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
  // ---------------------------------------------------------------- warm pad (original synthesis, no samples)
  // Shared chain: voices → tone low-pass (brightness) → high-pass 70 Hz (no sub-bass) → dry + slow two-tap chorus
  // (stereo) + short generated reverb → expression gain → pad volume (accomp bus) → master limiter.
  _buildPadChain() {
    const c = this.ctx, P = this.padNodes = {};
    P.in = c.createGain();
    P.tone = c.createBiquadFilter(); P.tone.type = 'lowpass'; P.tone.Q.value = 0.5; P.tone.frequency.value = 1500;
    P.hp = c.createBiquadFilter(); P.hp.type = 'highpass'; P.hp.frequency.value = 70; P.hp.Q.value = 0.5;
    P.expr = c.createGain(); P.expr.gain.value = 0.35 + 0.65 * this.padSettings.expression;
    P.in.connect(P.tone).connect(P.hp);
    const dry = c.createGain(); dry.gain.value = 0.78; P.hp.connect(dry).connect(P.expr);
    // chorus: two short modulated delays, one per side
    const merger = c.createChannelMerger(2), wet = c.createGain(); wet.gain.value = 0.32;
    P.lfos = [];
    [[0.0135, 0.21, 0], [0.0175, 0.27, 1]].forEach(([d, rate, ch]) => {
      const dl = c.createDelay(0.05); dl.delayTime.value = d;
      const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = rate; depth.gain.value = 0.0022;
      lfo.connect(depth).connect(dl.delayTime); lfo.start(); P.lfos.push(lfo);
      P.hp.connect(dl).connect(merger, 0, ch);
    });
    merger.connect(wet).connect(P.expr);
    // reverb: generated stereo impulse, ~2.2 s, darker as it decays
    const rv = c.createConvolver(), len = Math.floor(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let lp = 0, seed = 7 + ch * 101;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const n = seed / 0x3fffffff - 1, k = i / len;
        lp += (n - lp) * (0.55 - 0.45 * k); d[i] = lp * Math.pow(1 - k, 2.6) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1); } }
    rv.buffer = ir; const rvGain = c.createGain(); rvGain.gain.value = 0.2;
    P.hp.connect(rv).connect(rvGain).connect(P.expr);
    P.expr.connect(this.buses.accomp);
    // slow shared detune drift for subtle movement (±4 cents)
    P.drift = c.createOscillator(); P.drift.frequency.value = 0.13; P.driftAmt = c.createGain(); P.driftAmt.gain.value = 4;
    P.driftInv = c.createGain(); P.driftInv.gain.value = -4; P.drift.connect(P.driftAmt); P.drift.connect(P.driftInv); P.drift.start(); P.lfos.push(P.drift);
    this.setPadVolume(this.padSettings.volume); this.setPadBrightness(this.padSettings.brightness);
  }
  _padVoice(v, freq, t, peak, pan = 0, attack = 0.55) {
    const c = this.ctx, P = this.padNodes;
    const vf = c.createBiquadFilter(); vf.type = 'lowpass'; vf.frequency.value = Math.min(5200, freq * 5); vf.Q.value = 0.3;
    const sp = c.createStereoPanner ? c.createStereoPanner() : null; if (sp) sp.pan.value = pan;
    const mk = (type, detune, gain) => { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq; o.detune.value = detune; g.gain.value = gain; o.connect(g).connect(vf); return o; };
    const o1 = mk('sawtooth', -7, 0.32), o2 = mk('sawtooth', 7, 0.32), o3 = mk('triangle', 0, 0.55);
    P.driftAmt.connect(o1.detune); P.driftInv.connect(o2.detune);
    vf.connect(v.env); v.env.disconnect(); v.env.connect(sp || P.in); if (sp) sp.connect(P.in);
    v.peak = peak; v.env.gain.setValueAtTime(0, t); v.env.gain.linearRampToValueAtTime(peak, t + Math.max(0.05, attack));
    [o1, o2, o3].forEach(o => o.start(t)); v.nodes.push(o1, o2, o3, vf); if (sp) v.nodes.push(sp); v.oscs = [o1, o2, o3]; v.release = 1.1;
    v.disconnectDrift = () => { try { P.driftAmt.disconnect(o1.detune); P.driftInv.disconnect(o2.detune); } catch {} };
  }
  /** Pad volume 0..1 (bounded so the pad stays under the melody). */
  setPadVolume(v) { this.padSettings.volume = Math.max(0, Math.min(1, v)); if (this.ctx) this.buses.accomp.gain.setTargetAtTime(1.4 * this.padSettings.volume, this.ctx.currentTime, 0.05); }
  setPadBrightness(b) { this.padSettings.brightness = b; if (this.ctx) this.padNodes.tone.frequency.setTargetAtTime({ soft: 900, warm: 1500, bright: 2400 }[b] || 1500, this.ctx.currentTime, 0.1); }
  /**
   * Sound a chord/texture on the pad (Hz). This is a crossfade, not a restart: voices whose pitch is already sounding
   * (±8 cents) are kept, the others fade out over the transition time while the new tones fade in over the same time.
   * Per-voice level follows the number of tones, so a four-note chord is not louder than a triad, and the number of
   * fading tails is bounded. meta.transition: seconds (0.08 … 2, default 0.55).
   */
  setPad(freqs, meta = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return [];
    const tr = Math.max(0.08, Math.min(2, meta.transition ?? 0.55)), now = this.ctx.currentTime;
    const keep = [], fresh = [];
    const live = this.pad.ids.map(id => this.voices.get(id)).filter(v => v && !v.releasing);
    for (const f of freqs) { const hit = live.find(v => !keep.includes(v) && Math.abs(1200 * Math.log2(f / v.freq)) < 8); if (hit) keep.push(hit); else fresh.push(f); }
    for (const v of live) if (!keep.includes(v)) this.noteOff(v.id, { release: tr * 1.3 });
    this._trimPadTails(6);
    const peak = 0.6 / Math.sqrt(Math.max(1, freqs.length));
    for (const v of keep) if (Math.abs((v.peak ?? peak) - peak) > 1e-3) { // common tones stay, only their level settles to the new chord size
      const g = v.env.gain; g.cancelScheduledValues(now); g.setValueAtTime(Math.max(0.0001, g.value), now); g.linearRampToValueAtTime(peak, now + tr); v.peak = peak; }
    const ids = fresh.map((f, i) => this.noteOn(f, { bus: 'accomp', velocity: peak, meta: { ...meta, attack: tr, pan: ((i % 2) ? 1 : -1) * 0.28 } })).filter(id => id != null);
    this.pad = { ids: [...keep.map(v => v.id), ...ids], label: meta.label ?? null, slot: meta.slot ?? null };
    this.emit({ type: 'pad', on: true, label: this.pad.label, slot: this.pad.slot, voices: this.pad.ids.length, kept: keep.length, source: meta.source || null });
    return this.pad.ids;
  }
  releasePad({ tail = 1.1 } = {}) {
    if (!this.pad.ids.length) return;
    for (const id of this.pad.ids) this.noteOff(id, { release: tail });
    this.pad = { ids: [], label: null, slot: null };
    this._trimPadTails(8);
    this.emit({ type: 'pad', on: false });
  }
  _trimPadTails(max) { // bound the number of releasing pad voices so tails never accumulate into a wash
    const tails = [...this.voices.values()].filter(v => v.bus === 'accomp' && v.releasing && !v.trimmed).sort((a, b) => a.start - b.start);
    while (tails.length > max) {
      const v = tails.shift(); v.trimmed = true; // fade out fast once; never postpone its cleanup again
      v.env.gain.cancelScheduledValues(this.ctx.currentTime); v.env.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      clearTimeout(v.timer); v.timer = setTimeout(() => this._cleanup(v.id), 150);
    }
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
  noteOff(id, { fast = false, release = null } = {}) {
    const v = this.voices.get(id); if (!v || v.releasing) return;
    v.releasing = true;
    const t = this.ctx.currentTime, r = fast ? 0.03 : (release ?? v.release);
    v.env.gain.cancelScheduledValues(t); v.env.gain.setValueAtTime(Math.max(0.0001, v.env.gain.value), t);
    v.env.gain.setTargetAtTime(0, t, r / 4);
    for (const n of v.nodes) if (n.stop) try { n.stop(t + r + 0.1); } catch {}
    v.timer = setTimeout(() => this._cleanup(id), (r + 0.2) * 1000);
    this.emit({ type: 'off', id, time: t, bus: v.bus });
  }
  _cleanup(id) {
    const v = this.voices.get(id); if (!v) return;
    if (!v.releasing) this.emit({ type: 'off', id, time: this.ctx.currentTime, bus: v.bus }); // natural end of a one-shot sample
    clearTimeout(v.timer); v.disconnectDrift?.();
    for (const n of v.nodes) { try { n.disconnect(); } catch {} }
    try { v.env.disconnect(); } catch {}
    this.voices.delete(id);
  }
  get activeVoices() { let n = 0; for (const v of this.voices.values()) if (!v.releasing) n++; return n; }

  // ---------------------------------------------------------------- accompaniment & expression
  setAccompaniment(freqs, meta = {}) { if (!freqs || !freqs.length) this.releasePad(); else this.setPad(freqs, meta); }
  releaseAccompaniment() { this.releasePad(); }
  /** Accompaniment expression 0..1 → pad level within a safe range (never silent, never above unity). */
  setExpression(value) {
    this.padSettings.expression = Math.max(0, Math.min(1, value));
    if (this.ctx) this.padNodes.expr.gain.setTargetAtTime(0.35 + 0.65 * this.padSettings.expression, this.ctx.currentTime, 0.12);
  }
  /** Melody level 0..1, independent of the pad volume. */
  setMelodyVolume(v) { this.melodyVolume = Math.max(0, Math.min(1, v)); if (this.ctx) this.buses.melody.gain.setTargetAtTime(this.melodyVolume, this.ctx.currentTime, 0.05); }
  setMasterVolume(v) { if (this.ctx) this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.95, this.ctx.currentTime, 0.05); }

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
    const origin = next; tick(); this.rhythm = { timer: setInterval(tick, 25), bpm, origin, beat: 60 / bpm };
    this.emit({ type: 'rhythm', on: true });
  }
  /** Seconds until the next beat of the running rhythm (the only musical clock); null when no clock is running. */
  timeToNextBeat() {
    if (!this.ctx || !this.rhythm) return null;
    const { origin, beat } = this.rhythm, c = this.ctx.currentTime, k = Math.max(0, Math.ceil((c - origin) / beat - 1e-6));
    return Math.max(0, origin + k * beat - c);
  }
  stopRhythm() { if (!this.rhythm) return; clearInterval(this.rhythm.timer); this.rhythm = null; this.emit({ type: 'rhythm', on: false }); }

  /** Everything silent within ~30 ms. */
  panic() {
    this.stopRhythm();
    for (const id of [...this.voices.keys()]) this.noteOff(id, { fast: true });
    const hadPad = this.pad.ids.length > 0; this.pad = { ids: [], label: null, slot: null };
    if (hadPad) this.emit({ type: 'pad', on: false });
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
    this.padNodes?.lfos?.forEach(o => { try { o.stop(); } catch {} });
    this.disposed = true; this.cache.clear(); this.listeners.clear();
    if (this.ctx) { try { await this.ctx.close(); } catch {} }
    this.ctx = null;
  }
}
