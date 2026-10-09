// DOM-Helfer für die Tastaturnavigation in Listen.
// Zeilen tragen `data-row="<id>"` und `data-scope="list|panel"`, Titelfelder `data-title`.

export type NavScope = 'list' | 'panel';

export function rowsIn(scope: NavScope): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-row][data-scope="${scope}"]`)];
}

export function titleOf(row: Element | null | undefined): HTMLInputElement | null {
  return row?.querySelector<HTMLInputElement>('[data-title]') ?? null;
}

export function focusTitle(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  const n = input.value.length;
  input.setSelectionRange(n, n);
  input.closest('[data-row]')?.scrollIntoView({ block: 'nearest' });
}

export function focusRow(row: HTMLElement | null | undefined) {
  if (!row) return;
  row.focus();
  row.scrollIntoView({ block: 'nearest' });
}

/** Nachbarzeile relativ zu `row` (dir −1/+1) im selben Bereich */
export function neighbour(row: HTMLElement, dir: number): HTMLElement | null {
  const scope = (row.dataset.scope ?? 'list') as NavScope;
  const rows = rowsIn(scope);
  return rows[rows.indexOf(row) + dir] ?? null;
}

export function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => e.metaKey || e.ctrlKey;
