// Links in task descriptions and comments.
// Stored as plain text: a bare URL (https://… or www.…) is a link by itself, and [label](https://…) is a link with a label
// (created with Ctrl/⌘ + K on a selection). Only http(s) links are recognised, so nothing else can become clickable.

export type Segment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const TOKEN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

/** Trailing punctuation belongs to the sentence, not to the URL */
const trimTail = (url: string) => url.replace(/[.,;:!?)\]]+$/, '');

export function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Splits text into plain text and links. */
export function parseLinks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (m[1] !== undefined) {
      if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
      out.push({ kind: 'link', text: m[1], href: m[2]! });
      last = at + m[0].length;
    } else {
      const url = trimTail(m[3]!);
      if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
      out.push({ kind: 'link', text: url, href: toHref(url) });
      last = at + url.length;
    }
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** A user-entered link target: accepts "abc.de/x" and "https://abc.de/x", rejects anything that is not http(s). */
export function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v || /\s/.test(v)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return null;
  const href = toHref(v);
  try {
    const u = new URL(href);
    return u.protocol === 'http:' || u.protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

/** Replaces the range [start, end) by a Markdown link. Without a selection, the URL is the label. */
export function insertLink(text: string, start: number, end: number, url: string): { text: string; cursor: number } | null {
  const href = normalizeUrl(url);
  if (!href) return null;
  const label = (text.slice(start, end) || href).replace(/[[\]\n]/g, '').trim() || href;
  const md = `[${label}](${href})`;
  return { text: text.slice(0, start) + md + text.slice(end), cursor: start + md.length };
}
