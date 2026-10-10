import { Fragment, type ReactNode } from 'react';
import { parseLinks } from '../lib/links';
import type { User } from '../data/types';

/** Highlight @Name in the text */
export function renderMentions(text: string, users: User[]): ReactNode {
  const names = users
    .map((u) => u.name)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return text;
  const re = new RegExp(`(@(?:${names.join('|')}))`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <span key={i} className="mention">{part}</span> : <Fragment key={i}>{part}</Fragment>));
}

/** Text with clickable links (see lib/links.ts). `users` additionally highlights @mentions. */
export function RichText({ text, users }: { text: string; users?: User[] }) {
  return (
    <>
      {parseLinks(text).map((s, i) =>
        s.kind === 'link' ? (
          <a key={i} href={s.href} target="_blank" rel="noopener noreferrer">
            {s.text}
          </a>
        ) : (
          <Fragment key={i}>{users ? renderMentions(s.text, users) : s.text}</Fragment>
        ),
      )}
    </>
  );
}
