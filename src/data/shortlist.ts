export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export const SHORTLIST_KEY = 'stufa3d.shortlist';

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const ls = window.localStorage;
    ls.setItem('__stufa3d', '1');
    ls.removeItem('__stufa3d');
    return ls;
  } catch {
    return null;
  }
}

export class Shortlist {
  private list: string[];
  private listeners = new Set<() => void>();

  constructor(private store: KeyValueStore | null) {
    this.list = this.read();
  }

  private read(): string[] {
    try {
      const v: unknown = JSON.parse(this.store?.getItem(SHORTLIST_KEY) ?? '[]');
      return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
    } catch {
      return [];
    }
  }

  private commit(): void {
    try {
      this.store?.setItem(SHORTLIST_KEY, JSON.stringify(this.list));
    } catch {
      this.store = null;
    }
    this.listeners.forEach((l) => l());
  }

  /** True when the list survives reloads (storage available), so URLs need not carry it. */
  get persistent(): boolean {
    return this.store !== null;
  }

  /** Re-reads the stored list, e.g. after another page or tab changed it. */
  reload(): void {
    if (!this.store) return;
    this.list = this.read();
    this.listeners.forEach((l) => l());
  }

  ids(): string[] {
    return [...this.list];
  }

  has(id: string): boolean {
    return this.list.includes(id);
  }

  add(id: string): void {
    if (this.has(id)) return;
    this.list.push(id);
    this.commit();
  }

  remove(id: string): void {
    if (!this.has(id)) return;
    this.list = this.list.filter((x) => x !== id);
    this.commit();
  }

  toggle(id: string): void {
    if (this.has(id)) this.remove(id);
    else this.add(id);
  }

  move(id: string, delta: -1 | 1): void {
    const i = this.list.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this.commit();
  }

  merge(ids: string[]): void {
    const missing = ids.filter((id, i) => !this.has(id) && ids.indexOf(id) === i);
    if (!missing.length) return;
    this.list.push(...missing);
    this.commit();
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
