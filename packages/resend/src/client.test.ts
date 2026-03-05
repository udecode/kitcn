import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import { resolvePluginMiddlewareOptions } from '../../better-convex/src/plugins';
import * as resendPackage from './index';
import { ResendPlugin } from './index';

describe('resend middleware api', () => {
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

    expect(resolvePluginMiddlewareOptions(plugin, { ctx: {} })).toEqual({
      apiKey: 're_configured',
      webhookSecret: 'whsec_configured',
      initialBackoffMs: 42_000,
      retryAttempts: 7,
      testMode: false,
    });
  });
});
