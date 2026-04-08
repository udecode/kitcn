import { describe, expect, test } from 'bun:test';
import { convexBetterAuthReactStart } from './index';

describe('auth/start', () => {
  test('re-exports the react-start helper surface', () => {
    expect(typeof convexBetterAuthReactStart).toBe('function');
  });
});
