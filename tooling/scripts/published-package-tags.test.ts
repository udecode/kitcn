import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublishedPackageTags } from './published-package-tags.mjs';

test('builds package tag names from Changesets published packages', () => {
  assert.deepEqual(
    getPublishedPackageTags(
      JSON.stringify([
        { name: '@kitcn/ai', version: '53.0.3' },
        { name: 'kitcn', version: '53.0.3' },
      ])
    ),
    ['@kitcn/ai@53.0.3', 'kitcn@53.0.3']
  );
});

test('ignores malformed published package entries', () => {
  assert.deepEqual(
    getPublishedPackageTags(
      JSON.stringify([
        { name: '@kitcn/ai' },
        { version: '53.0.3' },
        { name: '', version: '53.0.3' },
        { name: 'kitcn', version: '53.0.3' },
      ])
    ),
    ['kitcn@53.0.3']
  );
  assert.deepEqual(getPublishedPackageTags('not json'), []);
});
