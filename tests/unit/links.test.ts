import { describe, expect, it } from 'vitest';
import { insertLink, normalizeUrl, parseLinks } from '../../src/lib/links';

describe('parseLinks', () => {
  it('detects a pasted URL in plain text', () => {
    expect(parseLinks('Siehe https://abc.de/efg bitte')).toEqual([
      { kind: 'text', text: 'Siehe ' },
      { kind: 'link', text: 'https://abc.de/efg', href: 'https://abc.de/efg' },
      { kind: 'text', text: ' bitte' },
    ]);
  });

  it('keeps sentence punctuation out of the URL', () => {
    const [, link] = parseLinks('Mehr unter https://abc.de/efg.');
    expect(link).toEqual({ kind: 'link', text: 'https://abc.de/efg', href: 'https://abc.de/efg' });
  });

  it('detects www. links and adds the scheme for the href', () => {
    const [link] = parseLinks('www.abc.de');
    expect(link).toEqual({ kind: 'link', text: 'www.abc.de', href: 'https://www.abc.de' });
  });

  it('renders Markdown links with their label', () => {
    expect(parseLinks('Doku: [Spec](https://x.y/spec) fertig')).toEqual([
      { kind: 'text', text: 'Doku: ' },
      { kind: 'link', text: 'Spec', href: 'https://x.y/spec' },
      { kind: 'text', text: ' fertig' },
    ]);
  });

  it('does not make other schemes clickable', () => {
    expect(parseLinks('javascript:alert(1) und [x](javascript:alert(1))').every((s) => s.kind === 'text')).toBe(true);
  });

  it('returns plain text unchanged', () => {
    expect(parseLinks('nur Text')).toEqual([{ kind: 'text', text: 'nur Text' }]);
    expect(parseLinks('')).toEqual([]);
  });
});

describe('normalizeUrl', () => {
  it('adds https to bare domains and rejects other schemes', () => {
    expect(normalizeUrl('abc.de/efg')).toBe('https://abc.de/efg');
    expect(normalizeUrl(' http://x.y ')).toBe('http://x.y');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('mit leerzeichen.de')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
  });
});

describe('insertLink', () => {
  it('wraps the selected text', () => {
    const r = insertLink('Lies die Doku heute', 9, 13, 'https://docs.example');
    expect(r?.text).toBe('Lies die [Doku](https://docs.example) heute');
    expect(r?.cursor).toBe('Lies die [Doku](https://docs.example)'.length);
  });

  it('uses the URL as label without a selection', () => {
    expect(insertLink('', 0, 0, 'abc.de')?.text).toBe('[https://abc.de](https://abc.de)');
  });

  it('returns null for invalid input', () => {
    expect(insertLink('x', 0, 1, 'ftp://nope')).toBeNull();
  });
});

describe('link targets stay http(s)', () => {
  const hostile = [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
  ];

  it.each(hostile)('normalizeUrl rejects %s', (input) => {
    expect(normalizeUrl(input)).toBeNull();
  });

  it.each(hostile)('insertLink does not create a link for %s', (input) => {
    expect(insertLink('Text', 0, 4, input)).toBeNull();
  });

  it.each(hostile)('parseLinks never produces a link for %s', (input) => {
    const links = parseLinks(`see ${input} here`).filter((s) => s.kind === 'link');
    for (const link of links) expect(link.href).toMatch(/^https?:\/\//);
  });

  it('parseLinks never turns a Markdown link with a foreign scheme into a link', () => {
    const segments = parseLinks('[click](javascript:alert(1))');
    expect(segments.some((s) => s.kind === 'link')).toBe(false);
  });
});
