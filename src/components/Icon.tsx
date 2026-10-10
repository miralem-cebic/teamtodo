const P = {
  check: 'M5 12.5l4.2 4.2L19 7',
  chevR: 'M9 6l6 6-6 6',
  chevD: 'M6 9l6 6 6-6',
  chevL: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  cal: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 10h16M8 3v4M16 3v4',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM5 20a7 7 0 0114 0',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sort: 'M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3',
  group: 'M4 5h16M4 12h16M4 19h10',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  board: 'M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v11h-4z',
  mine: 'M8.5 12l2.5 2.5 4.5-5M12 21a9 9 0 100-18 9 9 0 000 18z',
  comment: 'M5 18l-1 3 4-2h9a3 3 0 003-3V7a3 3 0 00-3-3H7a3 3 0 00-3 3v9',
  clip: 'M16 7l-7.5 7.5a2 2 0 002.8 2.8L19 9.6a4 4 0 00-5.7-5.7L5.6 11.6a6 6 0 008.5 8.5L20 14',
  sub: 'M6 4v10a2 2 0 002 2h10M14 12l4 4-4 4',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3',
  key: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM7 10h.01M11 10h.01M15 10h.01M8 14h8',
  menu: 'M4 7h16M4 12h16M4 17h16',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  status: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  archive: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  palette: 'M12 3a9 9 0 100 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a5 5 0 005-5c0-4.1-4-7.8-9-7.8zM7.5 12h.01M9.5 8h.01M14.5 8h.01',
  swap: 'M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4',
  bell: 'M6 16V11a6 6 0 0112 0v5l1.5 2h-15zM10 20a2 2 0 004 0',
} as const;

export type IconName = keyof typeof P;

export function Icon({ n, s = 16, className = '' }: { n: IconName; s?: number; className?: string }) {
  return (
    <svg className={'ic ' + className} width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={n === 'grip' || n === 'dots' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[n]} />
    </svg>
  );
}
