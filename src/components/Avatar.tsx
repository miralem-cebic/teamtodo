import type { User } from '../data/types';

export const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  const [first = '', second = ''] = p;
  return (p.length > 1 ? first.charAt(0) + second.charAt(0) : (first || '?').slice(0, 2)).toUpperCase();
};

export function Avatar({ user, size = 22 }: { user: User | undefined | null; size?: number }) {
  if (!user) return null;
  return (
    <span className={'av c-' + user.color} style={{ width: size, height: size, fontSize: size < 24 ? 10 : 12 }} title={user.name} aria-hidden="true">
      {initials(user.name)}
    </span>
  );
}
