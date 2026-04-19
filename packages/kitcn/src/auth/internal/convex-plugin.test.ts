import { expect, test } from 'bun:test';
import type { AuthConfig } from 'convex/server';
import { convex } from './convex-plugin';

test('convex suppresses the internal oidc provider deprecation warning', () => {
  const originalSiteUrl = process.env.CONVEX_SITE_URL;
  const originalWarn = console.warn;
  const warnings: string[] = [];

  process.env.CONVEX_SITE_URL = 'https://convex.invalid';
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };

  try {
    convex({
      authConfig: {
        providers: [
          {
            applicationID: 'convex',
            issuer: 'https://issuer.invalid',
          },
        ],
      } as AuthConfig,
    });
  } finally {
    console.warn = originalWarn;
    if (originalSiteUrl === undefined) {
      delete process.env.CONVEX_SITE_URL;
    } else {
      process.env.CONVEX_SITE_URL = originalSiteUrl;
    }
  }

  expect(
    warnings.some((warning) =>
      warning.includes('"oidc-provider" plugin is deprecated')
    )
  ).toBe(false);
});
