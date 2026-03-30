import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { resolvePluginOptions } from '../../kitcn/src/plugins';
import { initCRPC } from '../../kitcn/src/server';
import * as resendPackage from './index';
import { ResendPlugin } from './index';

const originalResendApiKey = process.env.RESEND_API_KEY;
const originalResendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET;

describe('resend plugin api', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_env';
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_env';
  });

  afterEach(() => {
    if (originalResendApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalResendApiKey;
    }

    if (originalResendWebhookSecret === undefined) {
      delete process.env.RESEND_WEBHOOK_SECRET;
    } else {
      process.env.RESEND_WEBHOOK_SECRET = originalResendWebhookSecret;
    }
  });

  test('package root no longer exports createResendRuntime', () => {
    expect('createResendRuntime' in resendPackage).toBe(false);
  });

  test('package root no longer exports buildResendHandlers', () => {
    expect('buildResendHandlers' in resendPackage).toBe(false);
  });

  test('package root no longer exports class/helper alternatives', () => {
    expect('Resend' in resendPackage).toBe(false);
    expect('createResend' in resendPackage).toBe(false);
    expect('createResendApi' in resendPackage).toBe(false);
    expect('resolveResendOptions' in resendPackage).toBe(false);
    expect('verifyResendWebhookEvent' in resendPackage).toBe(false);
  });

  test('package root no longer exports validator values', () => {
    expect('vEmailId' in resendPackage).toBe(false);
    expect('vEmailEvent' in resendPackage).toBe(false);
    expect('vOptions' in resendPackage).toBe(false);
    expect('vStatus' in resendPackage).toBe(false);
    expect('vTemplate' in resendPackage).toBe(false);
  });

  test('shared runtime options no longer use fnHandle callback wiring', () => {
    const source = fs.readFileSync(new URL('./shared.ts', import.meta.url), {
      encoding: 'utf-8',
    });
    expect(source).not.toContain('fnHandle');
  });

  test('ResendPlugin exposes middleware and no token create()', () => {
    expect(
      'create' in (ResendPlugin as unknown as Record<string, unknown>)
    ).toBe(false);
    expect(
      typeof (ResendPlugin as unknown as { middleware?: unknown }).middleware
    ).toBe('function');
  });

  test('configure resolves resend options with defaults', () => {
    const plugin = ResendPlugin.configure({
      apiKey: 're_configured',
      webhookSecret: 'whsec_configured',
      testMode: false,
      retryAttempts: 7,
      initialBackoffMs: 42_000,
    });

    expect(resolvePluginOptions(plugin, { ctx: {} })).toEqual({
      apiKey: 're_configured',
      webhookSecret: 'whsec_configured',
      initialBackoffMs: 42_000,
      retryAttempts: 7,
      testMode: false,
    });
  });

  test('runtime api does not read resend secrets from process.env', async () => {
    const c = initCRPC.create();
    const proc = c.query
      .use(ResendPlugin.middleware())
      .query(async ({ ctx }) => ctx.api.resend);

    const api = await (proc as any)._handler({}, {});
    expect(api.apiKey).toBe('');
    expect(api.webhookSecret).toBe('');
    expect(api.initialBackoffMs).toBe(30_000);
    expect(api.retryAttempts).toBe(5);
    expect(api.testMode).toBe(true);
    expect(typeof api.verifyWebhookEvent).toBe('function');
  });
});
