import { BETTER_AUTH_INSTALL_SPEC } from '../supported-dependencies';
import { getPluginCatalogEntry, getSupportedPluginKeys } from './index';

describe('cli/registry', () => {
  test('maps item-owned integration hooks into catalog entries', () => {
    const auth = getPluginCatalogEntry('auth');
    const resend = getPluginCatalogEntry('resend');
    const ratelimit = getPluginCatalogEntry('ratelimit');

    expect(auth.integration).toEqual(
      expect.objectContaining({
        resolveScaffoldRoots: expect.any(Function),
        resolveTemplates: expect.any(Function),
        buildPlanFiles: expect.any(Function),
        reconcileScaffoldFiles: expect.any(Function),
      })
    );
    expect(resend.integration).toEqual(
      expect.objectContaining({
        buildPlanFiles: expect.any(Function),
      })
    );
    expect(ratelimit.integration).toEqual(
      expect.objectContaining({
        buildPlanFiles: expect.any(Function),
      })
    );
  });

  test('maps auth registry item dependencies and files into catalog entry fields', () => {
    const descriptor = getPluginCatalogEntry('auth');
    const templateIds = descriptor.templates.map((template) => template.id);

    expect(descriptor.key).toBe('auth');
    expect(descriptor.label).toBe('Auth');
    expect(descriptor.packageName).toBe('better-auth');
    expect(descriptor.packageInstallSpec).toBe(BETTER_AUTH_INSTALL_SPEC);
    expect(descriptor.docs.publicUrl).toBe(
      'https://better-convex.vercel.app/docs/auth/server'
    );
    expect(templateIds).toEqual([
      'auth-config',
      'auth-runtime',
      'auth-client',
      'auth-page',
      'auth-schema-convex',
      'auth-config-convex',
      'auth-runtime-convex',
      'auth-client-convex',
    ]);
    expect(
      descriptor.templates.find((template) => template.id === 'auth-page')
    ).toEqual(
      expect.objectContaining({
        path: 'auth/page.tsx',
        target: 'app',
      })
    );
    expect(descriptor.presets).toEqual([
      {
        key: 'default',
        description:
          'Scaffold minimal Better Auth server + client wiring on top of init.',
        templateIds: [
          'auth-config',
          'auth-runtime',
          'auth-client',
          'auth-page',
        ],
      },
      {
        key: 'convex',
        description:
          'Adopt a raw Convex app with auth only, without Better Convex baseline files.',
        templateIds: [
          'auth-schema-convex',
          'auth-config-convex',
          'auth-runtime-convex',
          'auth-client-convex',
        ],
      },
    ]);
  });

  test('parses scoped dependency specs into package names', () => {
    const descriptor = getPluginCatalogEntry('resend');

    expect(descriptor.packageName).toBe('@better-convex/resend');
    expect(descriptor.packageInstallSpec).toBe('@better-convex/resend');
  });

  test('keeps supported plugin keys in registry order', () => {
    expect(getSupportedPluginKeys()).toEqual(['auth', 'resend', 'ratelimit']);
  });
});
