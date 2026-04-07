import { describe, expect, mock, test } from 'bun:test';
import {
  existsSync,
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
import {
  runAppValidation,
  stripAppleDoubleSidecars,
  stripVolatileArtifacts,
} from './scaffold-utils';
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
    expect(parseTemplateArgs(['check', 'start-auth'])).toEqual({
      backend: 'concave',
      mode: 'check',
      target: 'start-auth',
    });

    expect(() => parseTemplateArgs(['prepare'])).toThrow(
      'Usage: bun tooling/fixtures.ts <sync|check> [all|next|next-auth|start|start-auth|vite|vite-auth] [--backend <convex|concave>]'
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
    expect(TEMPLATE_DEFINITIONS.start.validation.lint).toBe(false);
    expect(TEMPLATE_DEFINITIONS['start-auth'].validation.lint).toBe(false);
  });

  test('normalizeTemplateSnapshot strips .env.local from committed templates', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-normalize-')
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
              kitcn: '^0.11.0',
              shadcn: '^4.2.0',
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
      expect(packageJson.dependencies?.shadcn).toBe('latest');
      expect(existsSync(path.join(templateDir, '.env.local'))).toBe(false);
      expect(
        readFileSync(path.join(getEnvDir, 'get-env.ts'), 'utf8')
      ).toContain("SITE_URL: z.string().default('http://localhost:3005')");
      expect(
        readFileSync(path.join(templateDir, 'tsconfig.json'), 'utf8')
      ).toContain('"kitcn/server": [');
      expect(
        readFileSync(path.join(templateDir, 'tsconfig.json'), 'utf8')
      ).toContain('"kitcn/auth/start": [');
      expect(
        readFileSync(
          path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('packages/kitcn/src/server/index.ts');
      expect(
        readFileSync(
          path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('../../../../packages/kitcn/src/auth-start/index.ts');
      expect(
        readFileSync(
          path.join(templateDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('../../../../packages/kitcn/src/server/index.ts');
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });

  test('stripVolatileArtifacts removes AppleDouble sidecars', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-junk-')
    );
    const keptPath = path.join(templateDir, 'next.config.mjs');
    const junkPath = path.join(templateDir, '._next.config.mjs');

    try {
      writeFileSync(keptPath, 'export default {};\n');
      writeFileSync(junkPath, 'junk\n');

      stripVolatileArtifacts(templateDir);

      expect(readFileSync(keptPath, 'utf8')).toBe('export default {};\n');
      expect(existsSync(junkPath)).toBe(false);
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });

  test('stripAppleDoubleSidecars keeps install artifacts intact', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-sidecars-')
    );
    const nodeModulesDir = path.join(templateDir, 'node_modules');
    const keptPath = path.join(nodeModulesDir, '.bin', 'kitcn');
    const junkPath = path.join(templateDir, '._eslint.config.mjs');

    try {
      mkdirSync(path.dirname(keptPath), { recursive: true });
      writeFileSync(keptPath, 'bin\n');
      writeFileSync(junkPath, 'junk\n');

      stripAppleDoubleSidecars(templateDir);

      expect(readFileSync(keptPath, 'utf8')).toBe('bin\n');
      expect(existsSync(junkPath)).toBe(false);
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });

  test('runAppValidation strips AppleDouble sidecars before lint can see them', async () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-validate-')
    );

    try {
      writeFileSync(
        path.join(templateDir, 'package.json'),
        `${JSON.stringify(
          {
            name: 'app',
            private: true,
            scripts: {
              lint: 'eslint',
            },
          },
          null,
          2
        )}\n`
      );
      writeFileSync(
        path.join(templateDir, 'eslint.config.mjs'),
        'export default [];'
      );
      writeFileSync(path.join(templateDir, '._eslint.config.mjs'), 'junk\n');

      const calls: string[][] = [];

      await runAppValidation(
        templateDir,
        mock(async (args) => {
          calls.push(args);
        }) as never
      );

      expect(calls).toEqual([['bun', 'run', 'lint']]);
      expect(existsSync(path.join(templateDir, '._eslint.config.mjs'))).toBe(
        false
      );
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });
});
