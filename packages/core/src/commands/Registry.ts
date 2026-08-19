export type CommandFn<E> = (editor: E, args?: unknown) => boolean;
export type GuardFn<E> = (editor: E) => boolean;

interface Entry<E> {
  run: CommandFn<E>;
  guard?: GuardFn<E>;
}

/**
 * Jediné místo, kde se mění obsah. Vstup z klávesnice, kliknutí v liště
 * i volání z aplikace končí tady — takže neexistuje úprava, kterou by minula
 * historie nebo událost `change`.
 */
export class CommandRegistry<E> {
  private readonly map = new Map<string, Entry<E>>();

  add(name: string, run: CommandFn<E>, guard?: GuardFn<E>): this {
    this.map.set(name, guard ? { run, guard } : { run });
    return this;
  }

  has(name: string): boolean { return this.map.has(name); }

  can(editor: E, name: string): boolean {
    const entry = this.map.get(name);
    if (!entry) return false;
    return entry.guard ? entry.guard(editor) : true;
  }

  exec(editor: E, name: string, args?: unknown): boolean {
    const entry = this.map.get(name);
    if (!entry) return false;
    if (entry.guard && !entry.guard(editor)) return false;
    return entry.run(editor, args);
  }

  names(): string[] { return Array.from(this.map.keys()); }
}
