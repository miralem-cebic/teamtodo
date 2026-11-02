import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The conformance job runs the reusable workflow and the checker of the engineering baseline.
// Both must name the released version from baseline.json, never a moving branch, so that CI
// only changes through a teamtodo change (see issue #50).
const ci = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
const baselineJson = readFileSync(resolve('baseline.json'), 'utf8');
const baseline = /"baseline":\s*"([^"]+)"/.exec(baselineJson)?.[1];
const releasedRef = `v${baseline}`;

describe('engineering baseline pin', () => {
  it('declares a released version in baseline.json', () => {
    expect(baseline).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('runs the conformance workflow at the released tag, not at main', () => {
    const uses = /uses:\s*miralem-cebic\/engineering-baseline\/\.github\/workflows\/conformance\.yml@(\S+)/.exec(
      ci,
    )?.[1];
    expect(uses).toBe(releasedRef);
  });

  it('passes the same released tag to the checker as baseline-ref', () => {
    const ref = /baseline-ref:\s*(\S+)/.exec(ci)?.[1];
    expect(ref).toBe(releasedRef);
  });
});
