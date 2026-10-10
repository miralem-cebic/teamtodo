import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../src/store/prefs';

// Every palette needs a light, a dark (system) and a dark (manual) block, plus a swatch for the menu.
const css = readFileSync(resolve('src/styles/themes.css'), 'utf8');

describe('color palettes', () => {
  it.each(PALETTES.filter((p) => p !== 'standard'))('%s has light, dark and swatch rules', (p) => {
    expect(css).toContain(`:root[data-palette="${p}"]{`);
    expect(css).toContain(`:root:not([data-theme="light"])[data-palette="${p}"]{`);
    expect(css).toContain(`:root[data-theme="dark"][data-palette="${p}"]{`);
    expect(css).toContain(`.c-pal-${p}{`);
  });
});
