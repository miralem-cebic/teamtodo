// Names of attachment files. Writes build a safe name from the user's file name; reads only accept
// names that are already safe, because the name in a task file comes from other people's copies of the data folder.

export const MAX_FILE_NAME_LENGTH = 200;

const SEPARATORS = '\\/:*?"<>|';

/** Characters that are not allowed in a file name: path separators, Windows-reserved characters, and control characters. */
const isForbidden = (ch: string): boolean => {
  const code = ch.charCodeAt(0);
  return SEPARATORS.includes(ch) || code < 0x20 || code === 0x7f;
};

/** A name that can be used as a single path segment in the data folder. */
export function isSafeFileName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_FILE_NAME_LENGTH &&
    name === name.trim() &&
    name !== '.' &&
    name !== '..' &&
    ![...name].some(isForbidden)
  );
}

/** Turns a user-supplied file name into a safe one; the result is always accepted by `isSafeFileName`. */
export function toSafeFileName(name: string): string {
  const clean = [...name]
    .map((ch) => (isForbidden(ch) ? '_' : ch))
    .join('')
    .trim()
    .slice(0, MAX_FILE_NAME_LENGTH)
    .trim();
  return clean === '' || clean === '.' || clean === '..' ? 'file' : clean;
}

export class UnsafeFileNameError extends Error {
  override name = 'UnsafeFileNameError';
  constructor(readonly fileName: string) {
    super(`Unsafe attachment file name: ${JSON.stringify(fileName)}`);
  }
}
