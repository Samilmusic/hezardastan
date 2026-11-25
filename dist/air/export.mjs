// HezarAva Air Studio — WAV and MIDI writers. Pure functions over captured data; no DOM.

/** 16-bit PCM WAV (RIFF) from Float32 channel arrays. */
export function encodeWav(channels, sampleRate) {
  const ch = channels.length, frames = channels[0]?.length || 0;
  const bytes = 44 + frames * ch * 2, buf = new ArrayBuffer(bytes), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, frames * ch * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
  }
  return new Uint8Array(buf);
}

export function concatChunks(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0), out = new Float32Array(total);
  let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

// ---------------------------------------------------------------- MIDI
const vlq = n => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };

/**
 * Standard MIDI File (format 0) from performance events.
 * events: [{type:'on'|'off', id, time (seconds), freq, velocity (0..1)}]
 *
 * mode 'microtonal': each sounding note gets its own channel (1–16 except 10, the GM drum channel) with
 *   pitch-bend range set to ±2 semitones by RPN 0 at the start; the bend encodes the exact deviation from the
 *   nearest MIDI key. Bend is sent before note-on and centred again after note-off. Up to 15 simultaneous
 *   microtonal pitches are exact; beyond that a note shares a channel and is rounded (counted in `rounded`).
 *   Playback is exact in synths that honour per-channel pitch bend and RPN 0 (most GM/DAW instruments; MPE-style).
 * mode 'rounded': nearest semitone, no bends — compatible everywhere, tuning lost. Melody on channel 1, accompaniment
 *   (events with bus 'accomp') on channel 2.
 * Programs: melody uses `program`; accompaniment uses `padProgram` (GM 89, «Pad 2 (warm)»). In microtonal mode a
 *   program change is sent whenever a channel switches between melody and accompaniment notes.
 */
export function encodeMidi(events, { mode = 'microtonal', refA4 = 440, bpm = 120, ppq = 480, program = 0, padProgram = 89 } = {}) {
  const sorted = [...events].sort((a, b) => a.time - b.time || (a.type === 'off' ? -1 : 1));
  const t0 = sorted.length ? sorted[0].time : 0;
  const tick = s => Math.round((s - t0) * (bpm / 60) * ppq);
  const out = []; let last = 0;
  const ev = (ticks, bytes) => { out.push(...vlq(Math.max(0, ticks - last)), ...bytes); last = Math.max(last, ticks); };
  ev(0, [0xff, 0x51, 0x03, ...[16, 8, 0].map(s => (Math.round(60e6 / bpm) >> s) & 0xff)]);
  const channels = mode === 'rounded' ? [0, 1] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  const chProgram = new Map();
  const progFor = e => (e.bus === 'accomp' ? padProgram : program) & 0x7f;
  for (const c of channels) {
    const p = mode === 'rounded' && c === 1 ? padProgram & 0x7f : program & 0x7f;
    ev(0, [0xc0 | c, p]); chProgram.set(c, p);
    if (mode !== 'rounded') for (const [cc, val] of [[101, 0], [100, 0], [6, 2], [38, 0], [101, 127], [100, 127]]) ev(0, [0xb0 | c, cc, val]);
  }
  const busy = new Map(), active = new Map(); let rr = 0, rounded = 0, notes = 0;
  for (const e of sorted) {
    const tk = tick(e.time);
    if (e.type === 'on') {
      const exact = 69 + 12 * Math.log2(e.freq / refA4), key = Math.max(0, Math.min(127, Math.round(exact)));
      let ch;
      if (mode === 'rounded') ch = e.bus === 'accomp' ? 1 : 0;
      else {
        const freeIdx = channels.findIndex((_, i) => !busy.has(channels[(rr + i) % channels.length]));
        const shared = freeIdx < 0;
        ch = shared ? channels[rr % channels.length] : channels[(rr + freeIdx) % channels.length];
        rr = (channels.indexOf(ch) + 1) % channels.length;
        if (shared) rounded++; // channel already bent for another note: this one plays at the nearest key
        else {
          const bend = Math.max(0, Math.min(16383, Math.round(8192 + (exact - key) / 2 * 8192)));
          ev(tk, [0xe0 | ch, bend & 0x7f, bend >> 7]);
        }
      }
      if (mode === 'rounded' && Math.abs(exact - key) > 0.01) rounded++;
      if (mode !== 'rounded' && chProgram.get(ch) !== progFor(e) && !busy.has(ch)) { ev(tk, [0xc0 | ch, progFor(e)]); chProgram.set(ch, progFor(e)); }
      const vel = Math.max(1, Math.min(127, Math.round((e.velocity ?? 0.8) * 127)));
      ev(tk, [0x90 | ch, key, vel]);
      busy.set(ch, (busy.get(ch) || 0) + 1); active.set(e.id, { ch, key }); notes++;
    } else if (e.type === 'off') {
      const a = active.get(e.id); if (!a) continue;
      ev(tk, [0x80 | a.ch, a.key, 0]);
      active.delete(e.id);
      const n = (busy.get(a.ch) || 1) - 1;
      if (n <= 0) { busy.delete(a.ch); if (mode !== 'rounded') ev(tk, [0xe0 | a.ch, 0x00, 0x40]); } else busy.set(a.ch, n);
    }
  }
  // close anything still open so no note hangs in a sequencer
  const end = sorted.length ? tick(sorted[sorted.length - 1].time) : 0;
  for (const [, a] of active) ev(end, [0x80 | a.ch, a.key, 0]);
  ev(end, [0xff, 0x2f, 0x00]);
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (ppq >> 8) & 0xff, ppq & 0xff];
  const len = out.length;
  const track = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff];
  return { bytes: new Uint8Array([...header, ...track, ...out]), rounded, notes };
}

/** Minimal SMF reader for tests: returns [{tick, status, data}] of channel events and meta events. */
export function parseMidi(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ppq = v.getUint16(12); let o = 14 + 8; const end = 22 + v.getUint32(18);
  const evs = []; let tick = 0, running = 0;
  const readVlq = () => { let n = 0, b; do { b = bytes[o++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
  while (o < end) {
    tick += readVlq();
    let st = bytes[o];
    if (st & 0x80) o++; else st = running;
    if (st === 0xff) { const type = bytes[o++], len = readVlq(); evs.push({ tick, status: 0xff, type, data: [...bytes.slice(o, o + len)] }); o += len; continue; }
    running = st;
    const n = (st & 0xf0) === 0xc0 || (st & 0xf0) === 0xd0 ? 1 : 2;
    evs.push({ tick, status: st, data: [...bytes.slice(o, o + n)] }); o += n;
  }
  return { ppq, events: evs };
}
