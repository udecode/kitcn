import { expect, test } from 'bun:test';

import config from './tsdown.config';

test('client builds do not require the React compiler runtime', () => {
  const clientBuild = config[0];
  expect(clientBuild?.plugins).toBeUndefined();
});
