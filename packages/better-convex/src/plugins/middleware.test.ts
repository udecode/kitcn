import { describe, expect, test } from 'bun:test';
import { initCRPC } from '../server';
import { definePluginMiddleware } from './middleware';

describe('plugin middleware', () => {
  test('configure injects ctx.plugins and merges options with last-write-wins', async () => {
    const plugin = definePluginMiddleware<
      'example',
      { options: { enabled?: boolean; mode?: string } },
      { enabled?: boolean; mode?: string }
    >({
      key: 'example',
      provide: ({ options }) => ({
        options: options ?? {},
      }),
    })
      .configure({ enabled: true, mode: 'safe' })
      .configure({ mode: 'fast' });

    const c = initCRPC.create();
    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.plugins.example.options);

    await expect((proc as any)._handler({}, {})).resolves.toEqual({
      enabled: true,
      mode: 'fast',
    });
  });

  test('configure resolver receives { ctx } and can derive options', async () => {
    const plugin = definePluginMiddleware<
      'example',
      { options: { testMode: boolean | undefined } },
      { testMode: boolean }
    >({
      key: 'example',
      provide: ({ options }) => ({
        options: {
          testMode: options?.testMode,
        },
      }),
    }).configure(({ ctx }: { ctx: { env: 'dev' | 'prod' } }) => ({
      testMode: ctx.env !== 'prod',
    }));

    const c = initCRPC
      .context({
        query: () => ({ env: 'prod' as const }),
      })
      .create();

    const proc = c.query
      .use(plugin.middleware())
      .query(async ({ ctx }) => ctx.plugins.example.options.testMode);

    await expect((proc as any)._handler({}, {})).resolves.toBe(false);
  });
});
