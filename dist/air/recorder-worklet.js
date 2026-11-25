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
