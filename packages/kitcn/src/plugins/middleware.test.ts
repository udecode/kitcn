import { describe, expect, test } from 'bun:test';
import { initCRPC } from '../server';
import { definePlugin } from './middleware';

describe('plugin runtime api', () => {
  test('configure injects ctx.api and merges options with last-write-wins', async () => {
    const plugin = definePlugin<
      'example',
      { enabled?: boolean; mode?: string },
      { enabled?: boolean; mode?: string }
    >('example', ({ options }) => ({
      ...(options ?? {}),
    }))
      .configure({ enabled: true, mode: 'safe' })
      .configure({ mode: 'fast' });

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.api.example);

    await expect((proc as any)._handler({}, {})).resolves.toEqual({
      enabled: true,
      mode: 'fast',
    });
  });

  test('configure resolver receives { ctx } and can derive options', async () => {
    const plugin = definePlugin<
      'example',
      { testMode: boolean | undefined },
      { testMode: boolean | undefined }
    >('example', ({ options }) => ({
      testMode: options?.testMode,
    })).configure(({ ctx }: { ctx: { env: 'dev' | 'prod' } }) => ({
      testMode: ctx.env !== 'prod',
    }));

    const c = initCRPC
      .context({
        query: () => ({ env: 'prod' as const }),
      })
      .create();

    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.api.example.testMode);

    await expect((proc as any)._handler({}, {})).resolves.toBe(false);
  });

  test('plugin with no public surface still injects empty ctx.api namespace', async () => {
    const plugin = definePlugin<'example'>('example', () => ({}));

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.api.example);

    await expect((proc as any)._handler({}, {})).resolves.toEqual({});
  });

  test('extend() attaches named middleware presets with typed ctx.api access', async () => {
    const plugin = definePlugin<
      'example',
      { enabled?: boolean },
      { enabled?: boolean }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
    }))
      .configure({ enabled: true })
      .extend(({ middleware }) => ({
        enabledOnly: () =>
          middleware().pipe(async ({ ctx, next }) => {
            const enabled: boolean | undefined = ctx.api.example.enabled;
            if (!enabled) {
              throw new Error('expected enabled plugin');
            }
            return next();
          }),
      }));

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.enabledOnly())
      .query(async ({ ctx }) => ctx.api.example.enabled);

    await expect((proc as any)._handler({}, {})).resolves.toBe(true);
  });

  test('extend() named middleware is preserved after configure()', async () => {
    const basePlugin = definePlugin<
      'example',
      { enabled?: boolean },
      { enabled?: boolean }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
    })).extend(({ middleware }) => ({
      enabledOnly: () =>
        middleware().pipe(async ({ ctx, next }) => {
          if (!ctx.api.example.enabled) {
            throw new Error('expected enabled plugin');
          }
          return next();
        }),
    }));

    const plugin = basePlugin.configure({ enabled: true });

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.enabledOnly())
      .query(async ({ ctx }) => ctx.api.example.enabled);

    await expect((proc as any)._handler({}, {})).resolves.toBe(true);
  });

  test('extend() can merge multiple calls', async () => {
    const plugin = definePlugin<
      'example',
      { enabled?: boolean; mode?: string },
      { enabled?: boolean; mode?: string }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
      mode: options?.mode,
    }))
      .configure({ enabled: true, mode: 'fast' })
      .extend(({ middleware }) => ({
        enabledOnly: () =>
          middleware().pipe(async ({ ctx, next }) => {
            if (!ctx.api.example.enabled) {
              throw new Error('expected enabled plugin');
            }
            return next();
          }),
      }))
      .extend(({ middleware }) => ({
        fastOnly: () =>
          middleware().pipe(async ({ ctx, next }) => {
            if (ctx.api.example.mode !== 'fast') {
              throw new Error('expected fast mode');
            }
            return next();
          }),
      }));

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.enabledOnly())
      .use(plugin.fastOnly())
      .query(async ({ ctx }) => ctx.api.example.mode);

    await expect((proc as any)._handler({}, {})).resolves.toBe('fast');
  });

  test('extend() can override plugin.middleware() and still inject ctx.api', async () => {
    const plugin = definePlugin<
      'example',
      { enabled?: boolean },
      { enabled?: boolean }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
    }))
      .configure({ enabled: true })
      .extend(({ middleware }) => ({
        middleware: () =>
          middleware().pipe(async ({ ctx, next }) => {
            if (!ctx.api.example.enabled) {
              throw new Error('expected enabled plugin');
            }
            return next();
          }),
      }));

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.api.example.enabled);

    await expect((proc as any)._handler({}, {})).resolves.toBe(true);
  });

  test('extend() middleware override is preserved after configure()', async () => {
    const basePlugin = definePlugin<
      'example',
      { enabled?: boolean },
      { enabled?: boolean }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
    })).extend(({ middleware }) => ({
      middleware: () =>
        middleware().pipe(async ({ ctx, next }) => {
          if (!ctx.api.example.enabled) {
            throw new Error('expected enabled plugin');
          }
          return next();
        }),
    }));

    const plugin = basePlugin.configure({ enabled: true });

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.api.example.enabled);

    await expect((proc as any)._handler({}, {})).resolves.toBe(true);
  });

  test('extend() can add middleware override and named presets together', async () => {
    const plugin = definePlugin<
      'example',
      { enabled?: boolean; mode?: string },
      { enabled?: boolean; mode?: string }
    >('example', ({ options }) => ({
      enabled: options?.enabled,
      mode: options?.mode,
    }))
      .configure({ enabled: true, mode: 'fast' })
      .extend(({ middleware }) => ({
        middleware: () =>
          middleware().pipe(async ({ ctx, next }) => {
            if (!ctx.api.example.enabled) {
              throw new Error('expected enabled plugin');
            }
            return next();
          }),
        fastOnly: () =>
          middleware().pipe(async ({ ctx, next }) => {
            if (ctx.api.example.mode !== 'fast') {
              throw new Error('expected fast mode');
            }
            return next();
          }),
      }));

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .use(plugin.fastOnly())
      .query(async ({ ctx }) => ctx.api.example.mode);

    await expect((proc as any)._handler({}, {})).resolves.toBe('fast');
  });

  test('extend() throws when middleware override is defined twice', () => {
    expect(() =>
      definePlugin<'example'>('example', () => ({}))
        .extend(({ middleware }) => ({
          middleware: () => middleware(),
        }))
        .extend(({ middleware }) => ({
          middleware: () => middleware(),
        }))
    ).toThrow('Duplicate plugin middleware override on plugin "example".');
  });

  test('extend() throws on duplicate names', () => {
    expect(() =>
      definePlugin<'example'>('example', () => ({}))
        .extend(({ middleware }) => ({
          foo: () => middleware(),
        }))
        .extend(({ middleware }) => ({
          foo: () => middleware(),
        }))
    ).toThrow('Duplicate plugin middleware "foo" on plugin "example".');
  });
});
