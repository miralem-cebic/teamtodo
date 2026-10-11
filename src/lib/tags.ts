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
