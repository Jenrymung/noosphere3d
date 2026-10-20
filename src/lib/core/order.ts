import { generateKeyBetween } from "fractional-indexing";

/** A fractional-index order key: any non-empty string without whitespace. */
export function isOrderKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !/\s/.test(value);
}

export function compareOrder(aOrder: string, aId: string, bOrder: string, bId: string): number {
  if (aOrder < bOrder) return -1;
  if (aOrder > bOrder) return 1;
  if (aId < bId) return -1;
  if (aId > bId) return 1;
  return 0;
}

/** A key that sorts after every existing key. */
export function orderKeyAfter(existing: string[]): string {
  let last: string | null = null;
  for (const key of existing) {
    if (!isOrderKey(key)) continue;
    if (last === null || key > last) last = key;
  }
  return generateKeyBetween(last, null);
}
