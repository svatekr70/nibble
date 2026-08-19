type Handler = (payload: unknown) => void;

/**
 * Sběrnice událostí. `on()` vrací funkci pro odhlášení — odpadá tím zvyk
 * schovávat si referenci na callback jen proto, aby šel později odebrat.
 */
export class Events {
  private readonly map = new Map<string, Set<Handler>>();

  on(name: string, fn: Handler): () => void {
    let set = this.map.get(name);
    if (!set) { set = new Set(); this.map.set(name, set); }
    set.add(fn);
    return () => { set!.delete(fn); };
  }

  off(name: string, fn: Handler): void {
    this.map.get(name)?.delete(fn);
  }

  dispatch(name: string, payload?: unknown): void {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of Array.from(set)) fn(payload);
  }

  clear(): void { this.map.clear(); }
}
