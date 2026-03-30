import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveMissingDependencyHints } from './dependencies';

describe('cli/registry/dependencies', () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-dependency-hints-')
    );
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('keeps exact install specs for missing dependency hints', () => {
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json'),
      JSON.stringify({ name: 'test-app', private: true }, null, 2)
    );

    expect(resolveMissingDependencyHints(['@opentelemetry/api@1.9.0'])).toEqual(
      ['@opentelemetry/api@1.9.0']
    );
  });

  test('treats exact install specs as present when the package is already installed', () => {
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          private: true,
          dependencies: {
            '@opentelemetry/api': '1.9.0',
          },
        },
        null,
        2
      )
    );

    expect(resolveMissingDependencyHints(['@opentelemetry/api@1.9.0'])).toEqual(
      []
    );
  });
});
