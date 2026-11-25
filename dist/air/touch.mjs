// Multitouch / pointer note tracking. Each pointer owns at most one voice; every exit path releases it.
export class PointerVoices {
  constructor(start, stop) { this.start = start; this.stop = stop; this.map = new Map(); }
  down(pointerId, pad) {
    this.up(pointerId);
    const voice = this.start(pad);
    if (voice != null) this.map.set(pointerId, { pad, voice });
  }
  /** Sliding onto a different pad releases the old note and plays the new one (glissando). */
  move(pointerId, pad) {
    const cur = this.map.get(pointerId);
    if (!cur || pad == null || pad === cur.pad) return;
    this.down(pointerId, pad);
  }
  up(pointerId) { const cur = this.map.get(pointerId); if (!cur) return; this.map.delete(pointerId); this.stop(cur.voice); }
  cancel(pointerId) { this.up(pointerId); }
  releaseAll() { for (const id of [...this.map.keys()]) this.up(id); }
  get size() { return this.map.size; }
}
