import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OPENTELEMETRY_API_INSTALL_SPEC } from '../supported-dependencies';
import {
  applyPluginDependencyInstall,
  resolveBunPeerWarningPreinstallSpecs,
  resolveMissingDependencyHints,
} from './dependencies';

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

  test('flags the Bun better-auth peer warning seam for preinstall in kitcn apps', () => {
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          private: true,
          dependencies: {
            kitcn: '0.12.5',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(process.cwd(), 'bun.lock'),
      '"@better-auth/core": ["@better-auth/core@1.5.6"]\n'
    );

    expect(resolveBunPeerWarningPreinstallSpecs()).toEqual([
      OPENTELEMETRY_API_INSTALL_SPEC,
    ]);
  });

  test('skips Bun peer warning preinstall when opentelemetry is already installed', () => {
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          private: true,
          dependencies: {
            '@opentelemetry/api': '1.9.0',
            kitcn: '0.12.5',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(process.cwd(), 'bun.lock'),
      '"@better-auth/core": ["@better-auth/core@1.5.6"]\n'
    );

    expect(resolveBunPeerWarningPreinstallSpecs()).toEqual([]);
  });

  test('preinstalls opentelemetry before plugin installs when Bun lockfile would warn', async () => {
    fs.writeFileSync(
      path.join(process.cwd(), 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          private: true,
          dependencies: {
            kitcn: '0.12.5',
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(process.cwd(), 'bun.lock'),
      '"@better-auth/core": ["@better-auth/core@1.5.6"]\n'
    );

    const execaStub = mock(async () => ({ exitCode: 0 }) as any);

    await applyPluginDependencyInstall(
      {
        installed: false,
        packageJsonPath: path.join(process.cwd(), 'package.json'),
        packageName: '@kitcn/resend',
        packageSpec: '@kitcn/resend@0.12.5',
        skipped: false,
      },
      execaStub as any
    );

    expect(execaStub.mock.calls.map((call) => call.slice(0, 2))).toStrictEqual([
      ['bun', ['add', OPENTELEMETRY_API_INSTALL_SPEC]],
      ['bun', ['add', '@kitcn/resend@0.12.5']],
    ]);
  });
});
