import type { Bookmark } from '../selection/Bookmark.js';

export interface Snapshot {
  html: string;
  mark: Bookmark | null;
  /** Druh úpravy — po sobě jdoucí úhozy stejného druhu se slučují do jednoho kroku. */
  kind: string;
  at: number;
}

const MERGE_WINDOW_MS = 700;

/**
 * Zásobník undo.
 *
 * Ukládá se výstup `getHTML()`, ne `innerHTML`. Vypadá to jako detail, ale drží
 * to celou záruku zachování obsahu: vrácením se dokument znovu načte ze zdroje,
 * takže po undo až na začátek se uloží přesně to, co se původně otevřelo.
 */
export class History {
  private readonly undoStack: Snapshot[] = [];
  private readonly redoStack: Snapshot[] = [];
  private depth = 0;

  constructor(initial: Snapshot) {
    this.undoStack.push(initial);
  }

  get canUndo(): boolean { return this.undoStack.length > 1; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  /**
   * Zamkne zásobník na dobu, kdy sám obnovuje obsah.
   *
   * Počítadlo, ne příznak: plugin může v `transact` spustit příkaz, který si
   * `transact` volá sám — a vnitřní konec by jinak zámek uvolnil předčasně.
   */
  get isLocked(): boolean { return this.depth > 0; }

  push(snapshot: Snapshot): void {
    if (this.depth > 0) return;

    const top = this.undoStack[this.undoStack.length - 1];
    if (top && top.html === snapshot.html) return;

    // Psaní ve slovech, ne po písmenech: souvislá řada úhozů je jeden krok.
    if (
      top &&
      top.kind === snapshot.kind &&
      snapshot.kind === 'type' &&
      snapshot.at - top.at < MERGE_WINDOW_MS
    ) {
      this.undoStack[this.undoStack.length - 1] = { ...snapshot, at: top.at };
    } else {
      this.undoStack.push(snapshot);
    }

    this.redoStack.length = 0;
  }

  undo(): Snapshot | null {
    if (!this.canUndo) return null;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    return this.undoStack[this.undoStack.length - 1] ?? null;
  }

  redo(): Snapshot | null {
    if (!this.canRedo) return null;
    const next = this.redoStack.pop()!;
    this.undoStack.push(next);
    return next;
  }

  transact<T>(fn: () => T): T {
    this.depth++;
    try { return fn(); } finally { this.depth--; }
  }
}
