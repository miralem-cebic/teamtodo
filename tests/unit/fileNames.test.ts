import { describe, expect, it } from 'vitest';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { isSafeFileName, MAX_FILE_NAME_LENGTH, toSafeFileName } from '../../src/data/fs/fileNames';
import { MemDir } from '../../src/data/fs/memoryFs';

describe('attachment file names', () => {
  it.each(['report.pdf', 'Plan (2).docx', 'no-extension', '.hidden'])('accepts %s', (name) => {
    expect(isSafeFileName(name)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['current directory', '.'],
    ['parent directory', '..'],
    ['path separator', '../secret.txt'],
    ['backslash', '..\\secret.txt'],
    ['absolute path', '/etc/passwd'],
    ['drive colon', 'C:evil.txt'],
    ['control character', 'a\u0000b.txt'],
    ['surrounding spaces', ' a.txt '],
    ['too long', 'x'.repeat(MAX_FILE_NAME_LENGTH + 1)],
  ])('rejects %s', (_label, name) => {
    expect(isSafeFileName(name)).toBe(false);
  });

  it('turns user input into a name that is always accepted', () => {
    for (const input of ['../../x', 'a/b\\c:d*e?f"g<h>i|j', '..', '.', '   ', 'x'.repeat(500)]) {
      expect(isSafeFileName(toSafeFileName(input))).toBe(true);
    }
    expect(toSafeFileName('a/b.txt')).toBe('a_b.txt');
  });

  it('never writes outside the attachment folder of the task', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    const name = await repo.writeAttachment('task-1', '../../escape.txt', new Blob(['x']));
    expect(isSafeFileName(name)).toBe(true);
    expect(root.children.has('escape.txt')).toBe(false);
  });

  it('refuses to read names that come unchecked from task files', async () => {
    const root = new MemDir('teamtodo');
    const repo = new FsRepository(root.asHandle());
    await expect(repo.readAttachment('task-1', '../workspace.json')).rejects.toThrow(/Unsafe attachment file name/);
    await expect(repo.readAttachment('task-1', '..')).rejects.toThrow(/Unsafe attachment file name/);
  });
});
