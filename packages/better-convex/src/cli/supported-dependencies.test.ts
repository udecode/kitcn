import { describe, expect, test } from 'bun:test';
import {
  BASELINE_DEPENDENCY_INSTALL_SPECS,
  BETTER_AUTH_INSTALL_SPEC,
  BETTER_CONVEX_INSTALL_SPEC_ENV,
  BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV,
  getPackageNameFromInstallSpec,
  resolveSupportedDependencyInstallSpec,
  SUPPORTED_DEPENDENCY_VERSIONS,
} from './supported-dependencies';

describe('cli/supported-dependencies', () => {
  test('extracts package names from install specs', () => {
    expect(getPackageNameFromInstallSpec('convex@1.33.0')).toBe('convex');
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
    expect(BETTER_AUTH_INSTALL_SPEC).toBe(
      `better-auth@${SUPPORTED_DEPENDENCY_VERSIONS.betterAuth.exact}`
    );
    expect(SUPPORTED_DEPENDENCY_VERSIONS.convex.range).toBe(
      `^${SUPPORTED_DEPENDENCY_VERSIONS.convex.exact}`
    );
    expect(SUPPORTED_DEPENDENCY_VERSIONS.convex.minimum).toBe('>=1.33');
  });

  test('resolves local install spec overrides for supported packages', () => {
    const env = {
      [BETTER_CONVEX_INSTALL_SPEC_ENV]: 'file:/tmp/better-convex.tgz',
      [BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV]:
        'file:/tmp/better-convex-resend.tgz',
    };

    expect(
      resolveSupportedDependencyInstallSpec('better-convex@0.11.0', env)
    ).toBe('file:/tmp/better-convex.tgz');
    expect(
      resolveSupportedDependencyInstallSpec('@better-convex/resend', env)
    ).toBe('file:/tmp/better-convex-resend.tgz');
    expect(
      resolveSupportedDependencyInstallSpec('better-auth@1.5.3', env)
    ).toBe('better-auth@1.5.3');
  });
});
