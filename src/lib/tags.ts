// Tags of a task: short names, stored as plain strings. A tag is unique within a task regardless of case.

export const MAX_TAG_LENGTH = 30;

/** Trims and collapses spaces; the result is '' if nothing usable is left. */
export function normalizeTag(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH).trim();
}

/** The tags with `name` added at the end, unless it is empty or already there (compared without case). */
export function withTag(tags: string[], name: string): string[] {
  const tag = normalizeTag(name);
  if (!tag || tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return tags;
  return [...tags, tag];
}

export const withoutTag = (tags: string[], name: string): string[] => tags.filter((x) => x !== name);

/** Every tag in use, once each (compared without case), sorted for display. */
export function uniqueTags(lists: (string[] | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) for (const tag of list ?? []) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * The tags with `from` replaced by `to` (on every task that has it). If `to` is already there, the two merge.
 * Null if the task does not have `from`.
 */
export function renameInList(tags: string[], from: string, to: string): string[] | null {
  if (!tags.some((x) => same(x, from))) return null;
  let out: string[] = [];
  for (const x of tags) out = withTag(out, same(x, from) ? to : x);
  return out;
}

/** The tags without `name` (compared without case). Null if the task does not have it. */
export function withoutTagEverywhere(tags: string[], name: string): string[] | null {
  if (!tags.some((x) => same(x, name))) return null;
  return tags.filter((x) => !same(x, name));
}

/** Each tag in use with the number of live tasks that have it. The name is the first spelling found. */
export function tagCounts(lists: { tags?: string[]; deletedAt?: string | null }[]): { name: string; count: number }[] {
  const byKey = new Map<string, { name: string; count: number }>();
  for (const t of lists) {
    if (t.deletedAt) continue;
    for (const tag of new Set(t.tags ?? [])) {
      const key = tag.toLowerCase();
      const hit = byKey.get(key);
      if (hit) hit.count += 1;
      else byKey.set(key, { name: tag, count: 1 });
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
