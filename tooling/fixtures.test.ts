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
  normalizeFixtureComparisonPackageJson,
  normalizeTemplateSnapshot,
  parseTemplateArgs,
  stripFixtureComparisonArtifacts,
} from './fixtures';
import {
  runAppValidation,
  stripAppleDoubleSidecars,
  stripVolatileArtifacts,
  type WorkspacePackageJson,
} from './scaffold-utils';
import { TEMPLATE_DEFINITIONS, TEMPLATE_KEYS } from './template.config';

describe('tooling/fixtures', () => {
  test('parseTemplateArgs defaults to concave and targets all templates', () => {
    expect(parseTemplateArgs(['sync'])).toEqual({
      backend: 'concave',
      mode: 'sync',
      scope: 'owned',
      target: 'all',
    });

    expect(
      parseTemplateArgs([
        'check',
        'next-auth',
        '--backend',
        'convex',
        '--scope',
        'full',
      ])
    ).toEqual({
      backend: 'convex',
      mode: 'check',
      scope: 'full',
      target: 'next-auth',
    });
    expect(parseTemplateArgs(['check', 'start-auth'])).toEqual({
      backend: 'concave',
      mode: 'check',
      scope: 'owned',
      target: 'start-auth',
    });

    expect(() => parseTemplateArgs(['prepare'])).toThrow(
      'Usage: bun tooling/fixtures.ts <sync|check> [all|expo|expo-auth|next|next-auth|start|start-auth|vite|vite-auth] [--backend <convex|concave>]'
    );
    expect(() => parseTemplateArgs(['check', '--scope', 'thin'])).toThrow(
      'Invalid --scope value "thin". Expected one of: owned, full.'
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

  test('checkTemplates forwards the selected fixture check scope', async () => {
    const scopes: Array<string | undefined> = [];

    await checkTemplates({
      scope: 'full',
      target: 'next',
      checkTemplateFn: mock(async (_templateKey, params) => {
        scopes.push(params?.scope);
      }) as typeof checkTemplates extends (params?: infer T) => Promise<unknown>
        ? NonNullable<T extends { checkTemplateFn?: infer U } ? U : never>
        : never,
    });

    expect(scopes).toEqual(['full']);
  });

  test('template registry only lints starters worth linting', () => {
    expect(TEMPLATE_DEFINITIONS.expo.validation.lint).toBe(false);
    expect(TEMPLATE_DEFINITIONS['expo-auth'].validation.lint).toBe(false);
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
      ) as WorkspacePackageJson;
      const rootPackageJson = JSON.parse(
        readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
      ) as WorkspacePackageJson;

      expect(packageJson.scripts?.dev).toBe('next dev --turbopack --port 3005');
      expect(packageJson.dependencies?.shadcn).toBe('latest');
      expect(packageJson.packageManager).toBe(rootPackageJson.packageManager);
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
        readFileSync(path.join(templateDir, 'tsconfig.json'), 'utf8')
      ).toContain('"kitcn/auth/start/server": [');
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
      ).toContain('../../../../packages/kitcn/src/auth-start/server.ts');
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

  test('stripFixtureComparisonArtifacts ignores shadcn-owned UI component output by default', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-comparison-')
    );
    const nextButtonPath = path.join(
      templateDir,
      'components',
      'ui',
      'button.tsx'
    );
    const viteButtonPath = path.join(
      templateDir,
      'src',
      'components',
      'ui',
      'button.tsx'
    );
    const providerPath = path.join(templateDir, 'components', 'providers.tsx');

    try {
      mkdirSync(path.dirname(nextButtonPath), { recursive: true });
      mkdirSync(path.dirname(viteButtonPath), { recursive: true });
      mkdirSync(path.dirname(providerPath), { recursive: true });
      writeFileSync(nextButtonPath, 'next button\n');
      writeFileSync(viteButtonPath, 'vite button\n');
      writeFileSync(providerPath, 'provider\n');

      stripFixtureComparisonArtifacts(templateDir, 'next');

      expect(existsSync(nextButtonPath)).toBe(false);
      expect(existsSync(viteButtonPath)).toBe(false);
      expect(readFileSync(providerPath, 'utf8')).toBe('provider\n');
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });

  test('stripFixtureComparisonArtifacts keeps Expo UI fixtures', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-expo-comparison-')
    );
    const expoUiPath = path.join(
      templateDir,
      'src',
      'components',
      'ui',
      'collapsible.tsx'
    );

    try {
      mkdirSync(path.dirname(expoUiPath), { recursive: true });
      writeFileSync(expoUiPath, 'expo ui\n');

      stripFixtureComparisonArtifacts(templateDir, 'expo');

      expect(readFileSync(expoUiPath, 'utf8')).toBe('expo ui\n');
    } finally {
      rmSync(templateDir, { force: true, recursive: true });
    }
  });

  test('normalizeFixtureComparisonPackageJson only scrubs packageManager drift', () => {
    const templateDir = mkdtempSync(
      path.join(tmpdir(), 'kitcn-template-package-manager-')
    );
    const packageJsonPath = path.join(templateDir, 'package.json');
    const rootPackageJson = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as WorkspacePackageJson;

    try {
      writeFileSync(
        packageJsonPath,
        `${JSON.stringify(
          {
            name: 'fixture',
            packageManager: 'bun@0.0.0',
            scripts: {
              dev: 'upstream dev',
            },
          },
          null,
          2
        )}\n`
      );

      normalizeFixtureComparisonPackageJson(templateDir);

      const packageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf8')
      ) as WorkspacePackageJson;
      expect(packageJson.packageManager).toBe(rootPackageJson.packageManager);
      expect(packageJson.scripts?.dev).toBe('upstream dev');
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
