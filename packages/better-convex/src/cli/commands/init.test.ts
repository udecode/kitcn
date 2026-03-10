import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writePackageJson,
  writeShadcnNextApp,
} from '../test-utils';
import {
  handleInitCommand,
  INIT_HELP_TEXT,
  INIT_SHADCN_PACKAGE_SPEC,
  parseInitCommandArgs,
  resolveInitProjectDir,
  resolveInitTargetCwd,
  resolveSupportedInitTemplate,
} from './init';

const SHADCN_LAYOUT_PROVIDERS_RE =
  /ThemeProvider>\s*<Providers>\{children\}<\/Providers>\s*<\/ThemeProvider>/s;

describe('cli/commands/init', () => {
  test('parseInitCommandArgs supports template, cwd, name, defaults, yes, and json', () => {
    expect(
      parseInitCommandArgs([
        '--template',
        'next',
        '--cwd',
        'apps/web',
        '--name',
        'app',
        '--team',
        'udecode',
        '--project',
        'better-convex',
        '--dev-deployment',
        'local',
        '--defaults',
        '--yes',
        '--json',
      ])
    ).toEqual({
      yes: true,
      json: true,
      defaults: true,
      template: 'next',
      cwd: 'apps/web',
      name: 'app',
      team: 'udecode',
      project: 'better-convex',
      devDeployment: 'local',
    });
  });

  test('resolveSupportedInitTemplate only allows next', () => {
    expect(resolveSupportedInitTemplate('next')).toBe('next');
    expect(resolveSupportedInitTemplate(undefined)).toBeUndefined();
    expect(() => resolveSupportedInitTemplate('vite')).toThrow(
      'Unsupported init template "vite". Only "next" is currently supported.'
    );
  });

  test('resolveInitTargetCwd uses cwd when provided', () => {
    expect(
      resolveInitTargetCwd({
        yes: false,
        json: false,
        defaults: false,
        cwd: 'apps/web',
      } as any)
    ).toBe(path.resolve('apps/web'));
  });

  test('resolveInitProjectDir nests under cwd when name is provided', () => {
    expect(
      resolveInitProjectDir({
        yes: false,
        json: false,
        defaults: false,
        cwd: 'apps',
        name: 'web',
      } as any)
    ).toBe(path.resolve('apps/web'));
  });

  test('handleInitCommand(--help) prints init help', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const exitCode = await handleInitCommand(['init', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(INIT_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleInitCommand shells out to pinned shadcn defaults and overlays the generated app dir', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-next-')
    );
    const expectedProjectDir = path.join(tmpDir, 'apps', 'web');
    const expectedShadcnCwd = path.join(fs.realpathSync(tmpDir), 'apps');

    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args.includes(INIT_SHADCN_PACKAGE_SPEC)) {
        const cwdFlagIndex = args.indexOf('--cwd');
        const nameFlagIndex = args.indexOf('--name');
        const baseDir =
          cwdFlagIndex >= 0 && args[cwdFlagIndex + 1]
            ? args[cwdFlagIndex + 1]!
            : tmpDir;
        const projectName =
          nameFlagIndex >= 0 && args[nameFlagIndex + 1]
            ? args[nameFlagIndex + 1]!
            : 'web';
        const projectDir = path.join(baseDir, projectName);
        writeShadcnNextApp(projectDir);
        return { exitCode: 0 } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '-t', 'next', '--yes', '--cwd', 'apps', '--name', 'web'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const shadcnCall = execaStub.mock.calls.find((call) =>
        (
          call as unknown as [string, string[], Record<string, unknown>]
        )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
      ) as [string, string[], Record<string, unknown>] | undefined;
      expect(shadcnCall?.[1]?.slice(0, 8)).toEqual([
        INIT_SHADCN_PACKAGE_SPEC,
        'init',
        '--template',
        'next',
        '--cwd',
        expectedShadcnCwd,
        '--name',
        'web',
      ]);
      expect(shadcnCall?.[1]).toContain('--defaults');
      expect(shadcnCall?.[1]).toContain('--yes');
      expect(fs.existsSync(path.join(expectedProjectDir, 'package.json'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(expectedProjectDir, 'convex.json'))).toBe(
        true
      );
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'convex', 'functions', 'schema.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'convex', 'lib', 'crpc.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'tsconfig.json'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'convex', 'tsconfig.json'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'eslint.config.mjs'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'next.config.mjs'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'postcss.config.mjs'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'components.json'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'app', 'layout.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'app', 'page.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'app', 'globals.css'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'components', 'theme-provider.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'lib', 'utils.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'components', 'providers.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'lib', 'convex', 'query-client.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'lib', 'convex', 'crpc.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'lib', 'convex', 'convex-provider.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'lib', 'convex', 'server.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'lib', 'convex', 'rsc.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'app', 'convex', 'page.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'convex', 'functions', 'messages.ts')
        )
      ).toBe(true);
      expect(fs.existsSync(path.join(expectedProjectDir, '.env.local'))).toBe(
        true
      );
      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(expectedProjectDir, 'tsconfig.json'), 'utf8')
      );
      expect(tsconfig.compilerOptions.strictFunctionTypes).toBe(false);
      expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./*']);
      expect(tsconfig.compilerOptions.paths['@convex/*']).toEqual([
        './convex/shared/*',
      ]);
      const convexTsconfig = JSON.parse(
        fs.readFileSync(
          path.join(expectedProjectDir, 'convex', 'tsconfig.json'),
          'utf8'
        )
      );
      expect(convexTsconfig.compilerOptions.strictFunctionTypes).toBe(false);
      const componentsConfig = JSON.parse(
        fs.readFileSync(
          path.join(expectedProjectDir, 'components.json'),
          'utf8'
        )
      );
      expect(componentsConfig.style).toBe('base-nova');
      expect(componentsConfig.tailwind.css).toBe('app/globals.css');
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'eslint.config.mjs'),
            'utf8'
          )
          .includes('eslint-config-next/core-web-vitals')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'eslint.config.mjs'),
            'utf8'
          )
          .includes('"**/*generated/**"')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'next.config.mjs'),
            'utf8'
          )
          .includes('const nextConfig = {}')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'postcss.config.mjs'),
            'utf8'
          )
          .includes('"@tailwindcss/postcss"')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'layout.tsx'),
            'utf8'
          )
          .includes('Providers')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'layout.tsx'),
            'utf8'
          )
          .includes('@/components/providers')
      ).toBe(true);
      expect(
        SHADCN_LAYOUT_PROVIDERS_RE.test(
          fs.readFileSync(
            path.join(expectedProjectDir, 'app', 'layout.tsx'),
            'utf8'
          )
        )
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'page.tsx'),
            'utf8'
          )
          .includes('shadcn page')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'globals.css'),
            'utf8'
          )
          .includes('--shadcn-shell')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'components', 'theme-provider.tsx'),
            'utf8'
          )
          .includes('next-themes')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'lib', 'utils.ts'),
            'utf8'
          )
          .includes('filter(Boolean)')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'lib', 'convex', 'server.ts'),
            'utf8'
          )
          .includes('createCallerFactory')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'convex', 'page.tsx'),
            'utf8'
          )
          .includes('crpc.messages.list.queryOptions()')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'app', 'convex', 'page.tsx'),
            'utf8'
          )
          .includes('crpc.messages.create.mutationOptions()')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'convex', 'functions', 'messages.ts'),
            'utf8'
          )
          .includes('publicQuery')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'convex', 'functions', 'messages.ts'),
            'utf8'
          )
          .includes('publicMutation')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(expectedProjectDir, 'convex', 'functions', 'schema.ts'),
            'utf8'
          )
          .includes('messagesTable')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(expectedProjectDir, '.env.local'), 'utf8')
          .includes('NEXT_PUBLIC_CONVEX_URL=')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(expectedProjectDir, '.env.local'), 'utf8')
          .includes('NEXT_PUBLIC_CONVEX_SITE_URL=')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(expectedProjectDir, 'package.json'), 'utf8')
          .includes('"superjson"')
      ).toBe(true);
      expect(
        execaStub.mock.calls.some(
          (call) =>
            (call as unknown as [string, string[]])[1]?.[0] ===
              '/fake/convex/main.js' &&
            (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
        )
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand keeps template mode anchored to the existing target dir', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-existing-next-')
    );
    writeShadcnNextApp(tmpDir);
    const expectedShadcnCwd = path.dirname(fs.realpathSync(tmpDir));
    const expectedProjectName = path.basename(tmpDir);

    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '-t', 'next', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const shadcnCall = execaStub.mock.calls.find((call) =>
        (
          call as unknown as [string, string[], Record<string, unknown>]
        )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
      ) as [string, string[], Record<string, unknown>] | undefined;
      expect(shadcnCall?.[1]?.slice(0, 8)).toEqual([
        INIT_SHADCN_PACKAGE_SPEC,
        'init',
        '--template',
        'next',
        '--cwd',
        expectedShadcnCwd,
        '--name',
        expectedProjectName,
      ]);
      expect(fs.existsSync(path.join(tmpDir, 'convex.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'tsconfig.json'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand scaffolds client files into src roots when the existing app uses src layout', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-src-next-')
    );
    writeShadcnNextApp(tmpDir, { usesSrc: true });

    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '-t', 'next', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(tmpDir, 'src', 'app', 'layout.tsx'))).toBe(
        true
      );
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'components', 'providers.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'app', 'convex', 'page.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'lib', 'convex', 'crpc.tsx'))
      ).toBe(true);
      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'tsconfig.json'), 'utf8')
      );
      expect(tsconfig.compilerOptions.strictFunctionTypes).toBe(false);
      expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
      expect(tsconfig.compilerOptions.paths['@convex/*']).toEqual([
        './convex/shared/*',
      ]);
      const convexTsconfig = JSON.parse(
        fs.readFileSync(path.join(tmpDir, 'convex', 'tsconfig.json'), 'utf8')
      );
      expect(convexTsconfig.compilerOptions.strictFunctionTypes).toBe(false);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'components.json'), 'utf8')
          .includes('"css": "src/app/globals.css"')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'eslint.config.mjs'), 'utf8')
          .includes('eslint-config-next/typescript')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'eslint.config.mjs'), 'utf8')
          .includes('"**/*generated/**"')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'next.config.mjs'), 'utf8')
          .includes('nextConfig = {}')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'postcss.config.mjs'), 'utf8')
          .includes('"@tailwindcss/postcss"')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(tmpDir, 'src', 'app', 'convex', 'page.tsx'),
            'utf8'
          )
          .includes('crpc.messages.list.queryOptions()')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'src', 'app', 'page.tsx'), 'utf8')
          .includes('shadcn page')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'src', 'app', 'globals.css'), 'utf8')
          .includes('--shadcn-shell')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(tmpDir, 'src', 'components', 'theme-provider.tsx'),
            'utf8'
          )
          .includes('next-themes')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(tmpDir, 'src', 'lib', 'utils.ts'), 'utf8')
          .includes('filter(Boolean)')
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails when both root and src app layouts exist', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-ambiguous-next-')
    );
    fs.mkdirSync(path.join(tmpDir, 'app'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'src', 'app'), { recursive: true });
    writePackageJson(tmpDir);

    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await expect(
        handleInitCommand(['init', '-t', 'next', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('Ambiguous Next scaffold roots');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand bootstraps anonymous convex before retrying codegen in non-interactive mode', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-anonymous-')
    );
    const execaStub = mock(
      async (
        _cmd: string,
        args: string[],
        options?: Record<string, unknown>
      ) => {
        if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
          const attempt = execaStub.mock.calls.filter(
            (call) =>
              (call as unknown as [string, string[]])[1]?.[0] ===
                '/fake/convex/main.js' &&
              (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
          ).length;
          if (attempt === 1) {
            return {
              exitCode: 1,
              stdout: '',
              stderr:
                'No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project',
            } as any;
          }
          return { exitCode: 0, stdout: '', stderr: '' } as any;
        }
        if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
          if (
            (options?.env as Record<string, string | undefined>)
              ?.CONVEX_AGENT_MODE === 'anonymous'
          ) {
            return { exitCode: 0, stdout: '', stderr: '' } as any;
          }
          return {
            exitCode: 1,
            stdout: '',
            stderr: 'missing anonymous bootstrap env',
          } as any;
        }
        return { exitCode: 0 } as any;
      }
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      const codegenCalls = execaStub.mock.calls.filter(
        (call) =>
          (call as unknown as [string, string[]])[1]?.[0] ===
            '/fake/convex/main.js' &&
          (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
      ) as [string, string[]][];
      expect(codegenCalls).toHaveLength(2);
      const bootstrapCall = execaStub.mock.calls.find(
        (call) =>
          (call as unknown as [string, string[]])[1]?.[0] ===
            '/fake/convex/main.js' &&
          (call as unknown as [string, string[]])[1]?.[1] === 'dev'
      ) as [string, string[], Record<string, unknown>] | undefined;
      expect(bootstrapCall?.[1]?.slice(1)).toEqual([
        'dev',
        '--local',
        '--local-force-upgrade',
        '--typecheck',
        'disable',
        '--tail-logs',
        'disable',
      ]);
      expect(bootstrapCall?.[2]?.env).toMatchObject({
        CONVEX_AGENT_MODE: 'anonymous',
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand uses concave for init codegen/bootstrap when backend is concave', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-concave-')
    );
    const fakeConcaveCliPath = path.join(tmpDir, 'concave-cli.mjs');
    fs.writeFileSync(fakeConcaveCliPath, 'export {};\n');
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === fakeConcaveCliPath && args[1] === 'codegen') {
        const attempt = execaStub.mock.calls.filter(
          (call) =>
            (call as unknown as [string, string[]])[0] === 'bun' &&
            (call as unknown as [string, string[]])[1]?.[0] ===
              fakeConcaveCliPath &&
            (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
        ).length;
        if (attempt === 1) {
          return {
            exitCode: 1,
            stdout: '',
            stderr: "✖ Local backend isn't running.",
          } as any;
        }
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === fakeConcaveCliPath && args[1] === 'dev') {
        return {
          exitCode: 0,
          stdout: 'Concave functions ready!',
          stderr: '',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['--backend', 'concave', 'init', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          realConcave: fakeConcaveCliPath,
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const codegenCalls = execaStub.mock.calls.filter(
        (call) =>
          (call as unknown as [string, string[]])[0] === 'bun' &&
          (call as unknown as [string, string[]])[1]?.[0] ===
            fakeConcaveCliPath &&
          (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
      );
      expect(codegenCalls).toHaveLength(2);
      expect(
        execaStub.mock.calls.some((call) => {
          const [command, args] = call as unknown as [string, string[]];
          return (
            command === 'bun' &&
            args[0] === fakeConcaveCliPath &&
            JSON.stringify(args.slice(1)) === JSON.stringify(['dev', '--bun'])
          );
        })
      ).toBe(true);
      expect(
        execaStub.mock.calls.some((call) => {
          const [command, args] = call as unknown as [string, string[]];
          return command === 'node' && args[0] === '/fake/convex/main.js';
        })
      ).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand uses concave static codegen for template init when backend is concave', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-concave-template-')
    );
    writeShadcnNextApp(tmpDir);
    const fakeConcaveCliPath = path.join(tmpDir, 'concave-cli.mjs');
    fs.writeFileSync(fakeConcaveCliPath, 'export {};\n');
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args.includes(INIT_SHADCN_PACKAGE_SPEC)) {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === fakeConcaveCliPath && args[1] === 'codegen') {
        const attempt = execaStub.mock.calls.filter(
          (call) =>
            (call as unknown as [string, string[]])[0] === 'bun' &&
            (call as unknown as [string, string[]])[1]?.[0] ===
              fakeConcaveCliPath &&
            (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
        ).length;
        if (attempt === 1) {
          return {
            exitCode: 1,
            stdout: '',
            stderr: "✖ Local backend isn't running.",
          } as any;
        }
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === fakeConcaveCliPath && args[1] === 'dev') {
        return {
          exitCode: 0,
          stdout: 'Concave functions ready!',
          stderr: '',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['--backend', 'concave', 'init', '-t', 'next', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          realConcave: fakeConcaveCliPath,
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const codegenCalls = execaStub.mock.calls.filter(
        (call) =>
          (call as unknown as [string, string[]])[0] === 'bun' &&
          (call as unknown as [string, string[]])[1]?.[0] ===
            fakeConcaveCliPath &&
          (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
      ) as [string, string[]][];
      expect(codegenCalls).toHaveLength(2);
      expect(codegenCalls[0]?.[1]).toEqual([
        fakeConcaveCliPath,
        'codegen',
        '--static',
      ]);
      expect(codegenCalls[1]?.[1]).toEqual([
        fakeConcaveCliPath,
        'codegen',
        '--static',
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails clearly when backend concave cannot resolve the CLI', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-concave-missing-')
    );
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await expect(
        handleInitCommand(['--backend', 'concave', 'init', '--yes'], {
          realConvex: '/fake/convex/main.js',
          realConcave: '/definitely/missing/concave.mjs',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('backend=concave could not find Concave CLI');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand bootstraps anonymous convex when configured local backend is not running', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-anonymous-local-')
    );
    const execaStub = mock(
      async (
        _cmd: string,
        args: string[],
        options?: Record<string, unknown>
      ) => {
        if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
          const attempt = execaStub.mock.calls.filter(
            (call) =>
              (call as unknown as [string, string[]])[1]?.[0] ===
                '/fake/convex/main.js' &&
              (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
          ).length;
          if (attempt === 1) {
            return {
              exitCode: 1,
              stdout: '',
              stderr:
                "✖ Local backend isn't running. (it's not listening at http://127.0.0.1:3210)\nRun `npx convex dev` in another terminal first.",
            } as any;
          }
          return { exitCode: 0, stdout: '', stderr: '' } as any;
        }
        if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
          expect(options?.env).toMatchObject({
            CONVEX_AGENT_MODE: 'anonymous',
          });
          return { exitCode: 0, stdout: '', stderr: '' } as any;
        }
        return { exitCode: 0 } as any;
      }
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        execaStub.mock.calls.some(
          (call) =>
            (call as unknown as [string, string[]])[1]?.[0] ===
              '/fake/convex/main.js' &&
            (call as unknown as [string, string[]])[1]?.[1] === 'dev'
        )
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand bootstraps convex explicitly before retrying codegen when team/project are provided', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-bootstrap-')
    );
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        const attempt = execaStub.mock.calls.filter(
          (call) =>
            (call as unknown as [string, string[]])[1]?.[0] ===
              '/fake/convex/main.js' &&
            (call as unknown as [string, string[]])[1]?.[1] === 'codegen'
        ).length;
        if (attempt === 1) {
          return {
            exitCode: 1,
            stdout: '',
            stderr:
              'No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project',
          } as any;
        }
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        [
          'init',
          '--yes',
          '--team',
          'udecode',
          '--project',
          'better-convex',
          '--dev-deployment',
          'local',
        ],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(
        execaStub.mock.calls.some((call) => {
          const args = (call as unknown as [string, string[]])[1];
          return (
            args?.[0] === '/fake/convex/main.js' &&
            JSON.stringify(args.slice(1)) ===
              JSON.stringify([
                'dev',
                '--configure',
                'new',
                '--team',
                'udecode',
                '--project',
                'better-convex',
                '--dev-deployment',
                'local',
                '--local-force-upgrade',
                '--typecheck',
                'disable',
                '--tail-logs',
                'disable',
              ])
          );
        })
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand falls back to a generated server stub for plain init when bootstrap stays unavailable', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-stub-')
    );
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return {
          exitCode: 1,
          stdout: '',
          stderr:
            'No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as Record<
        string,
        unknown
      >;
      expect(payload.backend).toBe('convex');
      expect(payload.codegen).toBe('stubbed');
      expect(payload.convexBootstrap).toBe('missing');
      const stubPath = path.join(
        tmpDir,
        'convex',
        'functions',
        'generated',
        'server.ts'
      );
      expect(fs.existsSync(stubPath)).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'lib', 'convex', 'crpc.tsx'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(tmpDir, 'components', 'providers.tsx'))
      ).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, '.env.local'))).toBe(false);
    } finally {
      console.info = originalInfo;
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails in template mode when real codegen cannot be produced', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-template-fail-')
    );
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args.includes(INIT_SHADCN_PACKAGE_SPEC)) {
        const cwdFlagIndex = args.indexOf('--cwd');
        const nameFlagIndex = args.indexOf('--name');
        const baseDir =
          cwdFlagIndex >= 0 && args[cwdFlagIndex + 1]
            ? args[cwdFlagIndex + 1]!
            : tmpDir;
        const projectName =
          nameFlagIndex >= 0 && args[nameFlagIndex + 1]
            ? args[nameFlagIndex + 1]!
            : 'web';
        const projectDir = path.join(baseDir, projectName);
        writeShadcnNextApp(projectDir);
        return { exitCode: 0 } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return {
          exitCode: 1,
          stdout: '',
          stderr:
            'No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      await expect(
        handleInitCommand(['init', '-t', 'next', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Failed to generate a real Better Convex runtime during init.'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
