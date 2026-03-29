import { createHashFn } from './hash';

describe('internal/hash', () => {
  test('createHashFn falls back for non-Convex query keys', () => {
    const fallback = mock(
      (key: readonly unknown[]) => `fallback:${JSON.stringify(key)}`
    );
    const hashFn = createHashFn(fallback);

    const key = ['not-convex', { value: 1 }] as const;
    expect(hashFn(key)).toBe('fallback:["not-convex",{"value":1}]');
    expect(fallback).toHaveBeenCalledWith(key);
  });
});
