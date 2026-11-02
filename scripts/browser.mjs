// Chooses the browser for the build checks (scripts/check-file-protocol.mjs) and reports what to
// do when none can be started. No I/O in here, so tests/unit/browserLaunch.test.ts can cover it.

// Candidates in the order they are tried:
// - CHROME_PATH: an explicit executable. If set, it is the only candidate.
// - BROWSER_CHANNEL: an installed browser channel. If set, it is the only candidate.
// - default: the installed Google Chrome, then Playwright's bundled Chromium if it is on disk.
export function browserCandidates(env, bundledExecutable) {
  if (env.CHROME_PATH) {
    return [{ label: `CHROME_PATH=${env.CHROME_PATH}`, options: { executablePath: env.CHROME_PATH } }];
  }
  if (env.BROWSER_CHANNEL) {
    return [{ label: `channel "${env.BROWSER_CHANNEL}"`, options: { channel: env.BROWSER_CHANNEL } }];
  }
  const candidates = [{ label: 'channel "chrome"', options: { channel: 'chrome' } }];
  if (bundledExecutable) {
    candidates.push({ label: 'bundled Chromium', options: { executablePath: bundledExecutable } });
  }
  return candidates;
}

// Starts the first candidate that launches. `launch` is chromium.launch (a stub in tests).
// If none starts, throws one error that lists every attempt and the fix, not the Playwright call log.
export async function launchFirstAvailable(candidates, launch, extraOptions = {}) {
  const failures = [];
  for (const { label, options } of candidates) {
    try {
      const browser = await launch({ ...options, ...extraOptions });
      return { browser, label };
    } catch (error) {
      const firstLine = String(error instanceof Error ? error.message : error).split('\n')[0];
      failures.push(`  - ${label}: ${firstLine}`);
    }
  }
  throw new Error(
    [
      'check:file needs a browser, and none could be started.',
      'Tried:',
      ...failures,
      'Fix one of these:',
      '  - install Google Chrome, or',
      '  - set CHROME_PATH to the executable of another Chromium-based browser, or',
      '  - install Playwright\'s Chromium with: npx playwright install chromium',
    ].join('\n'),
  );
}
