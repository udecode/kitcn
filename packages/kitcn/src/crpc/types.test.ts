import { FUNC_REF_SYMBOL } from './types';

test('FUNC_REF_SYMBOL uses global symbol registry', () => {
  expect(typeof FUNC_REF_SYMBOL).toBe('symbol');
  expect(Symbol.keyFor(FUNC_REF_SYMBOL)).toBe('convex.funcRef');
});
