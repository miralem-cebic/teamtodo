import { describe, expect, it } from 'vitest';
import { err, must, ok } from '../../src/data/result';
import { FsRepository } from '../../src/data/fs/FsRepository';
import { MemDir } from '../../src/data/fs/memoryFs';
import { sampleSnapshot } from '../../src/data/seed';
import type { Task } from '../../src/data/types';

describe('results', () => {
  it('ok and err carry their value or error', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });

  it('must returns the value, or throws the original exception', () => {
    expect(must(ok(3))).toBe(3);
    const cause = new Error('disk gone');
    expect(() => must({ ok: false, error: { kind: 'other', cause } })).toThrow(cause);
    expect(() => must({ ok: false, error: { kind: 'quota', cause: 'no exception' } })).toThrow(/quota/);
  });
});

describe('a failed write is a value, not an exception', () => {
  it('the browser refusing access gives a permission error', async () => {
    const root = new MemDir('T');
    const repo = new FsRepository(root.asHandle());
    must(await repo.initialize(sampleSnapshot('T')));
    const denied = new DOMException('denied', 'NotAllowedError');
    // the folder refuses every access from now on
    const refusing = {
      getDirectoryHandle: async () => {
        throw denied;
      },
      getFileHandle: async () => {
        throw denied;
      },
    } as unknown as FileSystemDirectoryHandle;
    const broken = new FsRepository(refusing);
    const res = await broken.saveTask({ ...sampleSnapshot('T').tasks[0]!, id: 'a1b2c3d4-0000-4000-8000-000000000001' } as Task);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.kind).toBe('permission');
      expect(res.error.cause).toBe(denied);
    }
  });
});
