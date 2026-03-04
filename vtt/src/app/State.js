export class State {
  constructor(initial) {
    this.data = structuredClone(initial);
    this.listeners = new Set();
  }
  get() { return this.data; }
  set(mutator) {
    mutator(this.data);
    this.emit();
  }
  emit() { for (const fn of this.listeners) fn(this.data); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
