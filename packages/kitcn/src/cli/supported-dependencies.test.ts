import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import {
  BASELINE_DEPENDENCY_INSTALL_SPECS,
  BETTER_AUTH_INSTALL_SPEC,
  getPackageNameFromInstallSpec,
  KITCN_INSTALL_SPEC_ENV,
  KITCN_RESEND_INSTALL_SPEC_ENV,
  OPENTELEMETRY_API_INSTALL_SPEC,
  PINNED_HONO_INSTALL_SPEC,
  PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC,
  PINNED_ZOD_INSTALL_SPEC,
  resolveScaffoldInstallSpec,
  resolveSupportedDependencyInstallSpec,
  resolveSupportedDependencyWarnings,
  SUPPORTED_DEPENDENCY_VERSIONS,
} from './supported-dependencies';

describe('cli/supported-dependencies', () => {
  test('extracts package names from install specs', () => {
    expect(getPackageNameFromInstallSpec('convex@1.35.1')).toBe('convex');
    expect(getPackageNameFromInstallSpec('better-auth@1.5.3')).toBe(
      'better-auth'
    );
    expect(getPackageNameFromInstallSpec('@scope/pkg@1.2.3')).toBe(
      '@scope/pkg'
    );
    expect(getPackageNameFromInstallSpec('@scope/pkg')).toBe('@scope/pkg');
    expect(getPackageNameFromInstallSpec('hono')).toBe('hono');
  });

  test('keeps pinned install specs in one place', () => {
    expect(BASELINE_DEPENDENCY_INSTALL_SPECS).toContain(
      `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`
    );
    expect(BASELINE_DEPENDENCY_INSTALL_SPECS).toContain(
      PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC
    );
    expect(BASELINE_DEPENDENCY_INSTALL_SPECS).toContain(
      PINNED_HONO_INSTALL_SPEC
    );
    expect(BASELINE_DEPENDENCY_INSTALL_SPECS).toContain(
      PINNED_ZOD_INSTALL_SPEC
    );
    expect(BETTER_AUTH_INSTALL_SPEC).toBe(
      `better-auth@${SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact}`
    );
    expect(OPENTELEMETRY_API_INSTALL_SPEC).toBe(
      `@opentelemetry/api@${SUPPORTED_DEPENDENCY_VERSIONS.opentelemetryApi.exact}`
    );
    expect(PINNED_TANSTACK_REACT_QUERY_INSTALL_SPEC).toBe(
      `@tanstack/react-query@${SUPPORTED_DEPENDENCY_VERSIONS.tanstackReactQuery.exact}`
    );
    expect(PINNED_HONO_INSTALL_SPEC).toBe(
      `hono@${SUPPORTED_DEPENDENCY_VERSIONS.hono.exact}`
    );
    expect(SUPPORTED_DEPENDENCY_VERSIONS.convex.range).toBe(
      `^${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`
    );
    expect(SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum).toBe('>=1.35');
  });

  test('resolves local install spec overrides for supported packages', () => {
    const env = {
      [KITCN_INSTALL_SPEC_ENV]: 'file:/tmp/kitcn.tgz',
      [KITCN_RESEND_INSTALL_SPEC_ENV]: 'file:/tmp/kitcn-resend.tgz',
    };

    expect(resolveSupportedDependencyInstallSpec('kitcn@0.11.0', env)).toBe(
      'file:/tmp/kitcn.tgz'
    );
    expect(resolveSupportedDependencyInstallSpec('@kitcn/resend', env)).toBe(
      'file:/tmp/kitcn-resend.tgz'
    );
    expect(
      resolveSupportedDependencyInstallSpec('better-auth@1.5.3', env)
    ).toBe('better-auth@1.5.3');
  });

  test('warns when the app pins an older supported peer dependency', () => {
    const dir = fs.mkdtempSync('/tmp/kitcn-peer-warning-');
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({
        dependencies: {
          convex: '^1.33.0',
        },
      })
    );

    expect(resolveSupportedDependencyWarnings(dir)).toEqual([
      {
        packageName: 'convex',
        current: '^1.33.0',
        minimum: '>=1.35',
        installSpec: `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`,
      },
    ]);
  });

  test('does not warn when the app has the supported Convex family', () => {
    const dir = fs.mkdtempSync('/tmp/kitcn-peer-current-');
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({
        dependencies: {
          convex: '^1.35.0',
        },
      })
    );

    expect(resolveSupportedDependencyWarnings(dir)).toEqual([]);
  });

  test('does not warn for open-ended ranges that can resolve to supported Convex', () => {
    const dir = fs.mkdtempSync('/tmp/kitcn-peer-range-');
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({
        dependencies: {
          convex: '>=1.0.0',
        },
      })
    );

    expect(resolveSupportedDependencyWarnings(dir)).toEqual([]);
  });

  test('warns for upper-bounded ranges below supported Convex', () => {
    const dir = fs.mkdtempSync('/tmp/kitcn-peer-upper-bound-');
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({
        dependencies: {
          convex: '<1.35.0',
        },
      })
    );

    expect(resolveSupportedDependencyWarnings(dir)).toEqual([
      {
        packageName: 'convex',
        current: '<1.35.0',
        minimum: '>=1.35',
        installSpec: `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`,
      },
    ]);
  });

  test('warns when installed Convex is older than the supported family', () => {
    const dir = fs.mkdtempSync('/tmp/kitcn-peer-installed-');
    fs.mkdirSync(`${dir}/node_modules/convex`, { recursive: true });
    fs.writeFileSync(
      `${dir}/package.json`,
      JSON.stringify({
        dependencies: {
          convex: '<1.36.0',
        },
      })
    );
    fs.writeFileSync(
      `${dir}/node_modules/convex/package.json`,
      JSON.stringify({
        name: 'convex',
        version: '1.34.1',
      })
    );

    expect(resolveSupportedDependencyWarnings(dir)).toEqual([
      {
        packageName: 'convex',
        current: '1.34.1',
        minimum: '>=1.35',
        installSpec: `convex@${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`,
      },
    ]);
  });

  test('pins scaffold kitcn installs to the current package version', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { version: string };

    expect(resolveScaffoldInstallSpec({})).toBe(`kitcn@${packageJson.version}`);
    expect(resolveSupportedDependencyInstallSpec('kitcn', {})).toBe(
      `kitcn@${packageJson.version}`
    );
  });
});
