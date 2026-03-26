import { describe, expect, mock, test } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkTemplates,
  normalizeTemplateSnapshot,
  parseTemplateArgs,
} from './fixtures';
import { TEMPLATE_DEFINITIONS, TEMPLATE_KEYS } from './template.config';

describe('tooling/fixtures', () => {
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
      'Usage: bun tooling/fixtures.ts <sync|check> [all|next|next-auth|vite|vite-auth] [--backend <convex|concave>]'
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

  test('normalizeTemplateSnapshot versions local dev port 3005 in committed templates', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'better-convex-template-normalize-')
    );

    try {
      const getEnvDir = path.join(templateDir, 'convex', 'lib');
      writeFileSync(
        path.join(templateDir, 'package.json'),
        `${JSON.stringify(
          {
            name: 'app',
            private: true,
            scripts: {
              dev: 'next dev --turbopack',
            },
            dependencies: {
              'better-convex': '^0.11.0',
            },
          },
          null,
          2
        )}\n`
      );
      writeFileSync(
        path.join(templateDir, '.env.local'),
        'NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\n'
      );
      writeFileSync(
        path.join(templateDir, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              paths: {
                '@/*': ['./*'],
              },
            },
          },
          null,
          2
        )}\n`
      );
      mkdirSync(getEnvDir, { recursive: true });
      writeFileSync(
        path.join(getEnvDir, 'get-env.ts'),
        "export const envSchema = { SITE_URL: z.string().default('http://localhost:3000') };\n"
      );
      mkdirSync(path.join(templateDir, 'convex'), { recursive: true });
      mkdirSync(path.join(templateDir, 'convex', 'functions'), {
        recursive: true,
      });
      writeFileSync(
        path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {},
          },
          null,
          2
        )}\n`
      );

      normalizeTemplateSnapshot(templateDir, 'next');

      const packageJson = JSON.parse(
        readFileSync(path.join(templateDir, 'package.json'), 'utf8')
      ) as {
        scripts?: Record<string, string>;
      };

      expect(packageJson.scripts?.dev).toBe('next dev --turbopack --port 3005');
      expect(
        readFileSync(path.join(templateDir, '.env.local'), 'utf8')
      ).toContain('NEXT_PUBLIC_SITE_URL=http://localhost:3005');
      expect(
        readFileSync(path.join(getEnvDir, 'get-env.ts'), 'utf8')
      ).toContain("SITE_URL: z.string().default('http://localhost:3005')");
      expect(
        readFileSync(path.join(templateDir, 'tsconfig.json'), 'utf8')
      ).toContain('"better-convex/server": [');
      expect(
        readFileSync(
          path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('packages/better-convex/src/server/index.ts');
      expect(
        readFileSync(
          path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('../../../../packages/better-convex/src/server/index.ts');
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });
});
