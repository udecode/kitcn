import { fc } from '@fast-check/vitest';
import type { Value } from './btree.js';

const objectKeys = 'abcdefghijklmnopqrstuvwxyz'.split('');

export const arbitraryValue = fc.letrec((tie) => ({
  tree: fc.oneof({ depthSize: 'small' }, tie('leaf'), tie('obj')),
  leaf: fc.oneof(
    fc.constant(null),
    fc.boolean(),
    fc.string(),
    fc
      .float({ noDefaultInfinity: true, noNaN: true })
      .filter((f) => f !== 0 || 1 / f > 0) // exclude negative zero
    // fc.bigInt(),
    // fc.uint8Array().map((a) => a.buffer),
  ),
  obj: fc.dictionary(
    fc.string({ unit: fc.constantFrom(...objectKeys) }),
    tie('tree'),
    { maxKeys: 3 }
  ),
  arr: fc.array(tie('tree'), { maxLength: 4 }),
})).tree as fc.Arbitrary<Value>;
