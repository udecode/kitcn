import { describe, expect, mock, test } from 'bun:test';
import { TEMPLATE_DEFINITIONS, TEMPLATE_KEYS } from './template.config';
import { checkTemplates, parseTemplateArgs } from './templates';

describe('tooling/templates', () => {
  test('parseTemplateArgs defaults to concave and targets all templates', () => {
    expect(parseTemplateArgs(['sync'])).toEqual({
      backend: 'concave',
      mode: 'sync',
      target: 'all',
    });

    expect(
      parseTemplateArgs(['check', 'next-auth', '--backend', 'convex'])
    ).toEqual({
      backend: 'convex',
      mode: 'check',
      target: 'next-auth',
    });

    expect(() => parseTemplateArgs(['prepare'])).toThrow(
      'Usage: bun tooling/templates.ts <sync|check> [all|next|next-auth|vite|vite-auth] [--backend <convex|concave>]'
    );
  });

  test('checkTemplates validates every committed template in registry order by default', async () => {
    const callOrder: string[] = [];

    await checkTemplates({
      backend: 'concave',
      checkTemplateFn: mock(async (templateKey) => {
        callOrder.push(templateKey);
      }) as typeof checkTemplates extends (params?: infer T) => Promise<unknown>
        ? NonNullable<T extends { checkTemplateFn?: infer U } ? U : never>
        : never,
    });

    expect(callOrder).toEqual([...TEMPLATE_KEYS]);
  });

  test('template registry only lints starters worth linting', () => {
    expect(TEMPLATE_DEFINITIONS.next.validation.lint).toBe(true);
    expect(TEMPLATE_DEFINITIONS['next-auth'].validation.lint).toBe(true);
    expect(TEMPLATE_DEFINITIONS.vite.validation.lint).toBe(false);
    expect(TEMPLATE_DEFINITIONS['vite-auth'].validation.lint).toBe(false);
  });
});
