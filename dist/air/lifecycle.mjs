// Central lifecycle: every resource registers its own teardown; stop() runs them in reverse order exactly once.
export class Lifecycle {
  constructor() { this.items = []; this.pending = new Map(); this.generation = 0; }
  /** Register a disposer; returns a function that disposes just this item early. */
  add(name, dispose) {
    const item = { name, dispose, done: false };
    this.items.push(item);
    return () => this._run(item);
  }
  async _run(item) { if (item.done) return; item.done = true; this.items = this.items.filter(i => i !== item); try { await item.dispose(); } catch (e) { console.warn('dispose failed', item.name, e); } }
  /** Run an initialiser once per generation even if called repeatedly (double clicks, permission retries). */
  once(name, init) {
    const key = this.generation + ':' + name;
    if (!this.pending.has(key)) this.pending.set(key, Promise.resolve().then(init).catch(e => { this.pending.delete(key); throw e; }));
    return this.pending.get(key);
  }
  has(name) { return this.items.some(i => i.name === name); }
  async stop() {
    this.generation++; this.pending.clear();
    const items = [...this.items].reverse();
    for (const i of items) await this._run(i);
  }
}
