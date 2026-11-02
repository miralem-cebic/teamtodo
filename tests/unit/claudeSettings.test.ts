import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The project permissions in .claude/settings.json apply to everyone who opens the repository in
// Claude Code (see issue #52). A wildcard for npm scripts would let every script run without a
// prompt, including `npm run deploy`, which overwrites the team's shared folder.
type Settings = { permissions?: { allow?: string[]; ask?: string[]; deny?: string[] } };
const settings: Settings = JSON.parse(readFileSync(resolve('.claude/settings.json'), 'utf8'));
const scripts: Record<string, string> = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).scripts;
const allow = settings.permissions?.allow ?? [];
const ask = settings.permissions?.ask ?? [];

describe('.claude/settings.json permissions', () => {
  it('does not allow npm scripts through a wildcard', () => {
    expect(allow.filter((rule) => rule.includes('npm run') && rule.includes('*'))).toEqual([]);
  });

  it('allows only npm scripts that exist in package.json', () => {
    const named = allow.flatMap((rule) => {
      const match = /^Bash\(npm run ([^\s)*]+)\)$/.exec(rule);
      return match?.[1] ? [match[1]] : [];
    });
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) {
      expect(Object.keys(scripts)).toContain(name);
    }
  });

  it('never allows the deploy script without a prompt', () => {
    expect(allow.some((rule) => rule.includes('npm run deploy'))).toBe(false);
  });

  it('asks before the deploy script runs', () => {
    expect(ask).toContain('Bash(npm run deploy*)');
  });
});
