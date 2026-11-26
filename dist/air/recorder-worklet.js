// Copies the post-limiter mix to the main thread in small Float32 blocks. Records generated audio only (no microphone).
class AirRecorder extends AudioWorkletProcessor {
  constructor() { super(); this.on = true; this.port.onmessage = e => { if (e.data === 'stop') this.on = false; }; }
  process(inputs, outputs) {
    const input = inputs[0];
    if (this.on && input && input.length) {
      const l = input[0], r = input[1] || input[0];
      this.port.postMessage([new Float32Array(l), new Float32Array(r)]);
    }
    const out = outputs[0]; if (out) for (const ch of out) ch.fill(0);
    return this.on;
  }
}
registerProcessor('air-recorder', AirRecorder);

// Collects one stem of a film take (the instruments, or the processed voice) as 16-bit blocks, so levels can be set
// after the take. Used only while the player is filming; the blocks stay in the page's memory.
class AirStem extends AudioWorkletProcessor {
  constructor(o) { super(); this.ch = o?.processorOptions?.channels || 1; this.size = 4096; this.n = 0; this.on = true;
    this.buf = Array.from({ length: this.ch }, () => new Int16Array(this.size));
    this.port.onmessage = e => { if (e.data === 'stop') { this.flush(); this.on = false; } }; }
  flush() { if (!this.n) return; const d = this.buf.map(b => b.slice(0, this.n)); this.port.postMessage({ f: this.f0, d }, d.map(b => b.buffer)); this.n = 0; }
  process(inputs, outputs) {
    const input = inputs[0];
    if (this.on && input && input.length) { const len = input[0].length;
      for (let i = 0; i < len; i++) { if (this.n === 0) this.f0 = currentFrame + i;   // frame of the block's first sample, so stems can be cut to the film's start
        for (let c = 0; c < this.ch; c++) { const v = (input[c] || input[0])[i]; this.buf[c][this.n] = v > 1 ? 32767 : v < -1 ? -32768 : Math.round(v * 32767); } if (++this.n === this.size) this.flush(); } }
    const out = outputs[0]; if (out) for (const ch of out) ch.fill(0);
    return this.on;
  }
}
registerProcessor('air-stem', AirStem);
