import { describe, expect, test } from 'bun:test';
import {
  createOrmWriteMemo,
  runInOrmWriteScope,
  withoutOrmWriteCache,
} from './write-cache';

describe('ORM write cache lifetime', () => {
  test('rows are reusable only inside their statement', async () => {
    const db = {};
    const memo = createOrmWriteMemo<number>();
    memo.set(db, 'row', 0);
    expect(memo.get(db, 'row')).toBeUndefined();
    await runInOrmWriteScope(db, async () => {
      memo.set(db, 'row', 1);
      expect(memo.get(db, 'row')).toBe(1);
      expect(memo.get({}, 'row')).toBeUndefined();
    });
    expect(memo.get(db, 'row')).toBeUndefined();
  });

  test('failed statements cannot leave snapshots for the next statement', async () => {
    const db = {};
    const memo = createOrmWriteMemo<number>();
    const failure = new Error('statement failed');
    await expect(
      runInOrmWriteScope(db, async () => {
        memo.set(db, 'row', 1);
        throw failure;
      })
    ).rejects.toBe(failure);
    await runInOrmWriteScope(db, async () => {
      expect(memo.get(db, 'row')).toBeUndefined();
      memo.set(db, 'row', 2);
      expect(memo.get(db, 'row')).toBe(2);
    });
  });

  test('failed callbacks suspend reentrant writes and never restore stale rows', async () => {
    const db = {};
    const memo = createOrmWriteMemo<number>();
    const failure = new Error('callback failed');
    await runInOrmWriteScope(db, async () => {
      memo.set(db, 'row', 1);
      await expect(
        withoutOrmWriteCache(async () => {
          expect(memo.get(db, 'row')).toBeUndefined();
          await runInOrmWriteScope(db, async () => {
            memo.set(db, 'row', 2);
            expect(memo.get(db, 'row')).toBeUndefined();
          });
          throw failure;
        })
      ).rejects.toBe(failure);
      expect(memo.get(db, 'row')).toBeUndefined();
      memo.set(db, 'row', 3);
      expect(memo.get(db, 'row')).toBe(3);
    });
  });
});
