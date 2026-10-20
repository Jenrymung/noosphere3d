export interface WorkspaceTab<T> {
  id: string;
  path: string | null;
  title: string;
  session: T;
}

export interface ClosedTab<T> extends WorkspaceTab<T> {
  closedAt: number;
}

/**
 * Open maps. Each tab owns its document, so undo, selection and save state
 * stay inside that tab.
 */
export class Workspace<T> {
  tabs: WorkspaceTab<T>[] = [];
  activeId = "";
  closed: ClosedTab<T>[] = [];

  constructor(tabs: WorkspaceTab<T>[]) {
    this.tabs = [...tabs];
    this.activeId = tabs[0]?.id ?? "";
  }

  active(): WorkspaceTab<T> | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  activate(id: string): WorkspaceTab<T> | null {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return null;
    this.activeId = id;
    return tab;
  }

  add(tab: WorkspaceTab<T>): void {
    this.tabs = [...this.tabs, tab];
    this.activeId = tab.id;
  }

  findByPath(path: string): WorkspaceTab<T> | null {
    return this.tabs.find((tab) => tab.path === path) ?? null;
  }

  /** Index from the left, 0-based. Mod+1 is the first tab and Mod+9 is the last. */
  tabAt(index: number, last: boolean): WorkspaceTab<T> | null {
    if (this.tabs.length === 0) return null;
    const tab = last ? this.tabs[this.tabs.length - 1] : this.tabs[index];
    return tab ?? null;
  }

  cycle(delta: 1 | -1): WorkspaceTab<T> | null {
    if (this.tabs.length === 0) return null;
    const index = this.tabs.findIndex((tab) => tab.id === this.activeId);
    const next = this.tabs[(index + delta + this.tabs.length) % this.tabs.length];
    this.activeId = next.id;
    return next;
  }

  close(id: string, now: number): ClosedTab<T> | null {
    const tab = this.tabs.find((item) => item.id === id);
    if (!tab) return null;
    const closed: ClosedTab<T> = { ...tab, closedAt: now };
    this.tabs = this.tabs.filter((item) => item.id !== id);
    this.closed = [closed, ...this.closed].slice(0, 12);
    if (this.activeId === id) this.activeId = this.tabs[0]?.id ?? "";
    return closed;
  }

  reopen(): ClosedTab<T> | null {
    const tab = this.closed[0];
    if (!tab) return null;
    this.closed = this.closed.slice(1);
    this.add(tab);
    return tab;
  }
}
