import { describe, expect, it, vi } from 'vitest';
import { browserCandidates, launchFirstAvailable } from '../../scripts/browser.mjs';

const chrome = { label: 'channel "chrome"', options: { channel: 'chrome' } };

describe('browserCandidates', () => {
  it('tries the installed Google Chrome first, then the bundled Chromium', () => {
    expect(browserCandidates({}, '/bundled/chromium')).toEqual([
      chrome,
      { label: 'bundled Chromium', options: { executablePath: '/bundled/chromium' } },
    ]);
  });

  it('leaves out the bundled Chromium when it is not on disk', () => {
    expect(browserCandidates({}, undefined)).toEqual([chrome]);
  });

  it('uses BROWSER_CHANNEL as the only candidate when it is set', () => {
    expect(browserCandidates({ BROWSER_CHANNEL: 'msedge' }, '/bundled/chromium')).toEqual([
      { label: 'channel "msedge"', options: { channel: 'msedge' } },
    ]);
  });

  it('uses CHROME_PATH as the only candidate, before BROWSER_CHANNEL', () => {
    expect(browserCandidates({ CHROME_PATH: '/usr/bin/chromium', BROWSER_CHANNEL: 'msedge' }, undefined)).toEqual([
      { label: 'CHROME_PATH=/usr/bin/chromium', options: { executablePath: '/usr/bin/chromium' } },
    ]);
  });
});

describe('launchFirstAvailable', () => {
  const bundled = { label: 'bundled Chromium', options: { executablePath: '/bundled/chromium' } };

  it('returns the first browser that starts and passes the extra launch options', async () => {
    const launch = vi.fn().mockResolvedValueOnce({ version: () => '153' });

    const result = await launchFirstAvailable([chrome, bundled], launch, { headless: true });

    expect(result.label).toBe('channel "chrome"');
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith({ channel: 'chrome', headless: true });
  });

  it('moves on to the next candidate when one cannot start', async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Chromium distribution 'chrome' is not found"))
      .mockResolvedValueOnce({ version: () => '148' });

    const result = await launchFirstAvailable([chrome, bundled], launch, { headless: true });

    expect(result.label).toBe('bundled Chromium');
    expect(launch).toHaveBeenLastCalledWith({ executablePath: '/bundled/chromium', headless: true });
  });

  it('throws one message that lists each attempt and how to fix it, not the launch call log', async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("Chromium distribution 'chrome' is not found at /opt/google/chrome/chrome\nCall log:\n  - foo"),
      )
      .mockRejectedValueOnce(new Error("Executable doesn't exist at /bundled/chromium"));

    const error = await launchFirstAvailable([chrome, bundled], launch, { headless: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toContain('channel "chrome": Chromium distribution \'chrome\' is not found at /opt/google/chrome/chrome');
    expect(message).toContain("bundled Chromium: Executable doesn't exist at /bundled/chromium");
    expect(message).not.toContain('Call log');
    expect(message).toContain('CHROME_PATH');
    expect(message).toContain('npx playwright install chromium');
  });
});
