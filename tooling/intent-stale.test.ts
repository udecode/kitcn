import { describe, expect, test } from 'bun:test';

import {
  getRepoIntentInstallSpec,
  resolveInstalledIntentCliPath,
} from './intent-stale.mjs';

describe('tooling/intent-stale', () => {
  test('resolves the intent cli from the packed temp install', () => {
    expect(resolveInstalledIntentCliPath('/tmp/intent-stale-123')).toBe(
      '/tmp/intent-stale-123/node_modules/@tanstack/intent/dist/cli.mjs'
    );
  });

  test('uses the package devDependency version for the temp install', () => {
    expect(getRepoIntentInstallSpec()).toBe('@tanstack/intent@0.0.23');
  });
});
