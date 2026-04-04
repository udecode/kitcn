import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runInitCommandFlow } from '../backend-core.js';
import { AUTH_CONVEX_PROVIDER_TEMPLATE } from '../registry/items/auth/auth-convex-provider.template.js';
import { renderAuthCrpcTemplate } from '../registry/items/auth/auth-crpc.template.js';
import { AUTH_NEXT_SERVER_TEMPLATE } from '../registry/items/auth/auth-next-server.template.js';
import {
  createDefaultConfig,
  writePackageJson,
  writeShadcnNextApp,
  writeShadcnStartApp,
  writeShadcnViteApp,
} from '../test-utils';
import {
  detectProjectFramework,
  handleInitCommand,
  INIT_HELP_TEXT,
  INIT_SHADCN_PACKAGE_SPEC,
  mapFrameworkToScaffoldMode,
  parseInitCommandArgs,
  resolveInitProjectDir,
  resolveSupportedInitTemplate,
} from './init';

const SHADCN_LAYOUT_PROVIDERS_RE =
  /ThemeProvider>\s*<Providers>\{children\}<\/Providers>\s*<\/ThemeProvider>/s;
const LEGACY_GENERATED_CONVEX_TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "allowJs": true,
    "strict": true,
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "target": "ESNext",
    "lib": ["ES2023", "dom"],
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["./**/*"],
  "exclude": ["./_generated"]
}
`;

describe('cli/commands/init', () => {
  test('parseInitCommandArgs supports template, cwd, name, defaults, overwrite, yes, json, and Convex target args', () => {
    expect(
      parseInitCommandArgs([
        '--template',
        'next',
        '--cwd',
        'apps',
        '--name',
        'web',
        '--defaults',
        '--overwrite',
        '--yes',
        '--json',
        '--env-file',
        '.env.agent',
        '--prod',
      ])
    ).toEqual({
      yes: true,
      json: true,
      defaults: true,
      overwrite: true,
      template: 'next',
      cwd: 'apps',
      name: 'web',
      targetArgs: ['--env-file', '.env.agent', '--prod'],
    });
  });

  test('parseInitCommandArgs rejects removed init bootstrap flag', () => {
    expect(() => parseInitCommandArgs(['--bootstrap'])).toThrow(
      'Unknown init flag "--bootstrap".'
    );
  });

  test('parseInitCommandArgs rejects removed bootstrap flags', () => {
    expect(() => parseInitCommandArgs(['--team', 'acme'])).toThrow(
      'Removed `kitcn init` bootstrap flags. Use `convex init` for deployment setup.'
    );
  });

  test('resolveSupportedInitTemplate allows next, start, and vite', () => {
    expect(resolveSupportedInitTemplate('next')).toBe('next');
    expect(resolveSupportedInitTemplate('start')).toBe('start');
    expect(resolveSupportedInitTemplate('vite')).toBe('vite');
    expect(resolveSupportedInitTemplate(undefined)).toBeUndefined();
    expect(() => resolveSupportedInitTemplate('nope')).toThrow(
      'Unsupported init template "nope". Expected one of: next, start, vite.'
    );
  });

  test('detectProjectFramework maps concrete frameworks to scaffold modes', () => {
    const nextDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-detect-next-')
    );
    writeShadcnNextApp(nextDir);

    const viteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-detect-vite-')
    );
    writeShadcnViteApp(viteDir);

    const reactRouterDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-detect-react-router-')
    );
    writePackageJson(reactRouterDir, {
      name: 'react-router-app',
      private: true,
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
    });
    fs.writeFileSync(
      path.join(reactRouterDir, 'react-router.config.ts'),
      'export default {};\n'
    );

    const tanstackDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-detect-tanstack-')
    );
    writePackageJson(tanstackDir, {
      name: 'tanstack-start-app',
      private: true,
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        '@tanstack/react-start': '^1.0.0',
      },
    });

    expect(detectProjectFramework(nextDir)).toBe('next-app');
    expect(mapFrameworkToScaffoldMode('next-app')).toBe('next-app');
    expect(detectProjectFramework(viteDir)).toBe('vite');
    expect(mapFrameworkToScaffoldMode('vite')).toBe('react');
    expect(detectProjectFramework(reactRouterDir)).toBe('react-router');
    expect(mapFrameworkToScaffoldMode('react-router')).toBe('react');
    expect(detectProjectFramework(tanstackDir)).toBe('tanstack-start');
    expect(mapFrameworkToScaffoldMode('tanstack-start')).toBe('react');
    expect(mapFrameworkToScaffoldMode('manual')).toBe('react');
  });

  test('resolveInitProjectDir uses cwd when provided', () => {
    expect(
      resolveInitProjectDir({
        yes: false,
        json: false,
        cwd: 'apps/web',
      })
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
      })
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(INIT_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleInitCommand scaffolds the next baseline with -t next', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-next-')
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
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
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
        ['init', '-t', 'next', '--yes', '--cwd', 'apps', '--name', 'web'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
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
      const convexInitCall = execaStub.mock.calls.find((call) => {
        const [, args] = call as unknown as [string, string[]];
        return args[0] === '/fake/convex/main.js' && args[1] === 'init';
      }) as [string, string[], Record<string, unknown>] | undefined;
      expect(convexInitCall).toBeDefined();
      expect(convexInitCall?.[1]).not.toContain('--yes');
      expect(
        (
          convexInitCall?.[2] as
            | { env?: Record<string, string | undefined> }
            | undefined
        )?.env?.CONVEX_AGENT_MODE
      ).toBe('anonymous');
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
        fs.existsSync(
          path.join(expectedProjectDir, 'convex', 'functions', 'tsconfig.json')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'convex', 'tsconfig.json'))
      ).toBe(false);
      expect(
        fs.readFileSync(
          path.join(expectedProjectDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('"../lib/**/*"');
      expect(
        fs.readFileSync(
          path.join(expectedProjectDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('"../shared/**/*"');
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'convex', 'lib', 'crpc.ts'))
      ).toBe(true);
      expect(
        SHADCN_LAYOUT_PROVIDERS_RE.test(
          fs.readFileSync(
            path.join(expectedProjectDir, 'app', 'layout.tsx'),
            'utf8'
          )
        )
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand scaffolds the start baseline with -t start', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-start-')
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
        writeShadcnStartApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
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
        ['init', '-t', 'start', '--yes', '--cwd', 'apps', '--name', 'web'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
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
        'start',
        '--cwd',
        expectedShadcnCwd,
        '--name',
        'web',
      ]);
      expect(
        fs.existsSync(path.join(expectedProjectDir, 'src', 'router.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(expectedProjectDir, 'src', 'routes', '__root.tsx')
        )
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand scaffolds into the current empty directory with -t next', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-next-current-dir-')
    );
    const expectedProjectDir = fs.realpathSync(tmpDir);
    const expectedProjectName = path.basename(expectedProjectDir);
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
            : null;
        if (!projectName) {
          return { exitCode: 1, stdout: '', stderr: 'missing --name' } as any;
        }
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
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
        ['init', '-t', 'next', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const shadcnCall = execaStub.mock.calls.find((call) =>
        (
          call as unknown as [string, string[], Record<string, unknown>]
        )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
      ) as [string, string[], Record<string, unknown>] | undefined;
      expect(shadcnCall?.[1]).toContain('--name');
      expect(shadcnCall?.[1]).toContain(expectedProjectName);
      expect(shadcnCall?.[1]).not.toContain(path.dirname(expectedProjectDir));
      expect(fs.existsSync(path.join(expectedProjectDir, 'package.json'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(expectedProjectDir, 'kitcn.json'))).toBe(
        true
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand does not rerun local bootstrap after fresh scaffold when --yes defaults bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-bootstrap-')
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
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
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
          loadCliConfig: loadConfigStub as any,
          runLocalBootstrap: runLocalBootstrapStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand runs local bootstrap after in-place adoption when --yes defaults bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-adopt-bootstrap-')
    );
    writeShadcnNextApp(tmpDir);
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const bootstrapCalls: Array<{ cwd: string; params: unknown }> = [];
    const runLocalBootstrapStub = mock(async (params: unknown) => {
      bootstrapCalls.push({ cwd: process.cwd(), params });
      return 0;
    });
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
      });
      expect(exitCode).toBe(0);
      expect(bootstrapCalls).toHaveLength(1);
      expect(fs.realpathSync(bootstrapCalls[0]!.cwd)).toBe(
        fs.realpathSync(tmpDir)
      );
      expect(bootstrapCalls[0]?.params).toMatchObject({
        realConvexPath: '/fake/convex/main.js',
        sharedDir: createDefaultConfig().paths.shared,
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand skips duplicate local bootstrap when init already used bootstrap fallback for codegen', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-bootstrap-reuse-')
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
            : path.basename(tmpDir);
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return { exitCode: 1, stdout: '', stderr: 'codegen nope' } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
        return {
          exitCode: 0,
          stdout: 'Convex functions ready!\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
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
          loadCliConfig: loadConfigStub as any,
          runLocalBootstrap: runLocalBootstrapStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand resolves explicit --config paths before default adoption bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-bootstrap-config-')
    );
    const absoluteConfigPath = path.join(
      fs.realpathSync(tmpDir),
      'custom.json'
    );
    writeShadcnNextApp(tmpDir);
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const resolvedConfigPaths: string[] = [];
    const loadConfigStub = mock((configPath?: string) => {
      if (configPath) {
        resolvedConfigPaths.push(path.resolve(configPath));
      }
      return createDefaultConfig();
    });
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '--yes', '--config', './custom.json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
          runLocalBootstrap: runLocalBootstrapStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(resolvedConfigPaths.at(-1)).toBe(absoluteConfigPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand resolves relative --config paths from the init target directory', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-bootstrap-target-config-')
    );
    const projectDir = path.join(tmpDir, 'apps', 'web');
    writeShadcnNextApp(projectDir);
    const expectedConfigPath = path.join(
      fs.realpathSync(projectDir),
      'concave.json'
    );
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const resolvedConfigPaths: string[] = [];
    const loadConfigStub = mock((configPath?: string) => {
      if (configPath) {
        resolvedConfigPaths.push(path.resolve(configPath));
      }
      return createDefaultConfig();
    });
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '--cwd', 'apps/web', '--yes', '--config', 'concave.json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
          runLocalBootstrap: runLocalBootstrapStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(resolvedConfigPaths.at(-1)).toBe(expectedConfigPath);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand prompts for local bootstrap during in-place adoption and skips when declined', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-adopt-bootstrap-prompt-')
    );
    writeShadcnNextApp(tmpDir);
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
    const confirmStub = mock(async () => false);
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: confirmStub as any,
          select: async () => 'ignored',
          multiselect: async () => [],
        },
      });
      expect(exitCode).toBe(0);
      expect(
        confirmStub.mock.calls.some(
          (call) =>
            (call as unknown[])[0] ===
            'Run one-shot local Convex bootstrap after init completes?'
        )
      ).toBe(true);
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand does not auto-bootstrap when Convex deployment target flags are present', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-remote-target-')
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
            : path.basename(tmpDir);
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '-t', 'next', '--yes', '--prod'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
          runLocalBootstrap: runLocalBootstrapStub as any,
        }
      );
      expect(exitCode).toBe(0);
      const convexInitCall = execaStub.mock.calls.find((call) => {
        const [, args] = call as unknown as [string, string[]];
        return args[0] === '/fake/convex/main.js' && args[1] === 'init';
      }) as [string, string[], Record<string, unknown>] | undefined;
      expect(
        (
          convexInitCall?.[2] as
            | { env?: Record<string, string | undefined> }
            | undefined
        )?.env?.CONVEX_AGENT_MODE
      ).toBeUndefined();
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand scaffolds the vite baseline with -t vite', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-vite-')
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
            : undefined;
        writeShadcnViteApp(
          projectName ? path.join(baseDir, projectName) : baseDir
        );
        return { exitCode: 0, stdout: '', stderr: '' } as any;
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
        ['init', '-t', 'vite', '--yes'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'components', 'providers.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'lib', 'convex', 'crpc.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tmpDir, 'src', 'lib', 'convex', 'convex-provider.tsx')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'app', 'convex', 'page.tsx'))
      ).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand adopts an existing next app without shelling out to shadcn', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-existing-next-')
    );
    writeShadcnNextApp(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'messages.ts'),
      'export const list = "keep-existing-messages";\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'schema.ts'),
      'export default "keep-existing-schema";\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'README.md'),
      'keep-existing-readme\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'tsconfig.json'),
      LEGACY_GENERATED_CONVEX_TSCONFIG_TEMPLATE
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
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        execaStub.mock.calls.some((call) =>
          (
            call as unknown as [string, string[], Record<string, unknown>]
          )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
        )
      ).toBe(false);
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'messages.ts'), 'utf8')
      ).toBe('export const list = "keep-existing-messages";\n');
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'schema.ts'), 'utf8')
      ).toBe('export default "keep-existing-schema";\n');
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'README.md'), 'utf8')
      ).toBe('keep-existing-readme\n');
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'tsconfig.json'), 'utf8')
      ).toContain('"lib/**/*"');
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'tsconfig.json'), 'utf8')
      ).toContain('"shared/**/*"');
      expect(fs.existsSync(path.join(tmpDir, 'convex.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'convex', 'lib', 'crpc.ts'))).toBe(
        true
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand --yes skips changed scaffold files without --overwrite', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-skip-custom-crpc-')
    );
    writeShadcnNextApp(tmpDir);
    const crpcPath = path.join(tmpDir, 'convex', 'lib', 'crpc.ts');
    fs.mkdirSync(path.dirname(crpcPath), { recursive: true });
    fs.writeFileSync(crpcPath, 'export const customCrpc = true;\n');

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(fs.readFileSync(crpcPath, 'utf8')).toBe(
        'export const customCrpc = true;\n'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand --yes skips changed Start root route without --overwrite', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-skip-start-root-')
    );
    writeShadcnStartApp(tmpDir);
    const rootRoutePath = path.join(tmpDir, 'src', 'routes', '__root.tsx');
    fs.mkdirSync(path.dirname(rootRoutePath), { recursive: true });
    fs.writeFileSync(rootRoutePath, 'export const customStartRoot = true;\n');

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(fs.readFileSync(rootRoutePath, 'utf8')).toBe(
        'export const customStartRoot = true;\n'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand --yes --overwrite replaces changed scaffold files', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-overwrite-custom-crpc-')
    );
    writeShadcnNextApp(tmpDir);
    const crpcPath = path.join(tmpDir, 'convex', 'lib', 'crpc.ts');
    fs.mkdirSync(path.dirname(crpcPath), { recursive: true });
    fs.writeFileSync(crpcPath, 'export const customCrpc = true;\n');

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '--yes', '--overwrite'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
      expect(fs.readFileSync(crpcPath, 'utf8')).toContain(
        'export const publicMutation = c.mutation;'
      );
      expect(fs.readFileSync(crpcPath, 'utf8')).not.toContain(
        'customCrpc = true'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('runInitCommandFlow prompts per changed scaffold file when interactive', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-interactive-custom-crpc-')
    );
    writeShadcnNextApp(tmpDir);
    const crpcPath = path.join(tmpDir, 'convex', 'lib', 'crpc.ts');
    fs.mkdirSync(path.dirname(crpcPath), { recursive: true });
    fs.writeFileSync(crpcPath, 'export const customCrpc = true;\n');

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const promptMessages: string[] = [];
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = await runInitCommandFlow({
        initArgs: {
          yes: false,
          json: false,
          defaults: false,
          overwrite: false,
          targetArgs: [],
        },
        execaFn: execaStub as any,
        generateMetaFn: generateMetaStub as any,
        syncEnvFn: syncEnvStub as any,
        loadCliConfigFn: loadConfigStub as any,
        ensureConvexGitignoreEntryFn: () => {},
        promptAdapter: {
          isInteractive: () => true,
          confirm: async (message) => {
            promptMessages.push(message);
            return false;
          },
          select: async () => {
            throw new Error('not used');
          },
          multiselect: async () => {
            throw new Error('not used');
          },
        },
        realConvexPath: '/fake/convex/main.js',
      });
      expect(result.updated).not.toContain('convex/lib/crpc.ts');
      expect(result.skipped).toContain('convex/lib/crpc.ts');
      expect(promptMessages).toContain('Overwrite convex/lib/crpc.ts?');
      expect(fs.readFileSync(crpcPath, 'utf8')).toBe(
        'export const customCrpc = true;\n'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand patches convex/functions/tsconfig.json and removes the legacy managed root tsconfig', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-existing-next-functions-dir-')
    );
    writeShadcnNextApp(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'convex', 'functions'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'),
      `{
  "compilerOptions": {
    "allowJs": true,
    "strict": true,
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "allowSyntheticDefaultImports": true,
    "target": "ESNext",
    "lib": ["ES2023", "dom"],
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["./**/*"],
  "exclude": ["./_generated"]
}
`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'tsconfig.json'),
      `{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "strictFunctionTypes": false,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "lib": ["esnext", "dom"],
    "types": ["bun-types"],
    "target": "esnext",
    "moduleDetection": "force",
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "allowJs": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "**/*.spec.ts", "**/*.test.ts"]
}
`
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
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        fs.readFileSync(
          path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('"../lib/**/*"');
      expect(
        fs.readFileSync(
          path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('"../shared/**/*"');
      expect(fs.existsSync(path.join(tmpDir, 'convex', 'tsconfig.json'))).toBe(
        false
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand keeps a custom root convex tsconfig when functions live under convex/functions', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        'kitcn-init-command-existing-next-custom-root-tsconfig-'
      )
    );
    writeShadcnNextApp(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'convex', 'functions'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'convex.json'),
      `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'),
      LEGACY_GENERATED_CONVEX_TSCONFIG_TEMPLATE
    );
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'tsconfig.json'),
      '{ "compilerOptions": { "customRoot": true } }\n'
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
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        fs.readFileSync(path.join(tmpDir, 'convex', 'tsconfig.json'), 'utf8')
      ).toContain('"customRoot": true');
      expect(
        fs.readFileSync(
          path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'),
          'utf8'
        )
      ).toContain('"../lib/**/*"');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand adopts an existing next app without eslint.config.mjs', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-existing-next-without-eslint-')
    );
    writeShadcnNextApp(tmpDir);
    fs.rmSync(path.join(tmpDir, 'eslint.config.mjs'));
    writePackageJson(tmpDir, {
      name: 'next-app',
      private: true,
      scripts: {
        lint: 'biome check',
      },
    });

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(tmpDir, 'eslint.config.mjs'))).toBe(false);
      expect(
        fs.existsSync(path.join(tmpDir, 'convex', 'functions', 'tsconfig.json'))
      ).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand preserves auth-managed next server helpers during adoption bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-existing-next-auth-')
    );
    writeShadcnNextApp(tmpDir);
    const serverPath = path.join(tmpDir, 'lib', 'convex', 'server.ts');
    const providerPath = path.join(
      tmpDir,
      'lib',
      'convex',
      'convex-provider.tsx'
    );
    fs.mkdirSync(path.dirname(serverPath), { recursive: true });
    fs.writeFileSync(serverPath, AUTH_NEXT_SERVER_TEMPLATE);
    fs.writeFileSync(providerPath, AUTH_CONVEX_PROVIDER_TEMPLATE);

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(fs.readFileSync(serverPath, 'utf8')).toBe(
        AUTH_NEXT_SERVER_TEMPLATE
      );
      expect(fs.readFileSync(providerPath, 'utf8')).toBe(
        AUTH_CONVEX_PROVIDER_TEMPLATE
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand preserves auth-managed crpc helpers during adoption bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-existing-next-crpc-')
    );
    writeShadcnNextApp(tmpDir);
    const crpcPath = path.join(tmpDir, 'convex', 'lib', 'crpc.ts');
    fs.mkdirSync(path.dirname(crpcPath), { recursive: true });
    fs.writeFileSync(crpcPath, renderAuthCrpcTemplate({ withRatelimit: true }));

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(fs.readFileSync(crpcPath, 'utf8')).toBe(
        renderAuthCrpcTemplate({ withRatelimit: true })
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand does not reinstall kitcn during adoption when a local tarball override is already present', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-local-spec-')
    );
    writeShadcnNextApp(tmpDir);
    const packageJsonPath = path.join(tmpDir, 'package.json');
    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    ) as {
      dependencies?: Record<string, string>;
    };
    packageJson.dependencies = {
      ...packageJson.dependencies,
      kitcn: 'file:/tmp/kitcn-existing.tgz',
    };
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`
    );

    const execaCalls: Array<{ cmd: string; args: string[] }> = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      execaCalls.push({ cmd, args });
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    const originalInstallSpec = process.env.KITCN_INSTALL_SPEC;
    process.env.KITCN_INSTALL_SPEC = 'file:/tmp/kitcn-scenario.tgz';
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        execaCalls.some(
          ({ cmd, args }) =>
            cmd === 'bun' &&
            args[0] === 'add' &&
            args.includes('file:/tmp/kitcn-scenario.tgz')
        )
      ).toBe(false);
    } finally {
      if (originalInstallSpec === undefined) {
        process.env.KITCN_INSTALL_SPEC = undefined;
      } else {
        process.env.KITCN_INSTALL_SPEC = originalInstallSpec;
      }
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand auto-detects vite apps and scaffolds react mode', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-detect-vite-')
    );
    writeShadcnViteApp(tmpDir);

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
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
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'components', 'providers.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, 'src', 'lib', 'convex', 'crpc.tsx'))
      ).toBe(true);
      expect(
        execaStub.mock.calls.some((call) =>
          (
            call as unknown as [string, string[], Record<string, unknown>]
          )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
        )
      ).toBe(false);
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand syncs auth env around fallback init bootstrap before skipping duplicate local bootstrap', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-auth-bootstrap-')
    );
    writeShadcnNextApp(tmpDir);
    fs.mkdirSync(path.join(tmpDir, 'convex', 'functions', 'generated'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpDir, 'convex', 'functions', 'auth.ts'),
      'export default "auth";\n'
    );

    const bootstrapEvents: string[] = [];
    const execaStub = mock(async (_cmd: string, args: string[], opts?: any) => {
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        bootstrapEvents.push('codegen');
        expect(opts?.env?.DEPLOY_ENV).toBe('development');
        expect(opts?.env?.SITE_URL).toBe('http://localhost:3000');
        return {
          exitCode: 1,
          stdout: '',
          stderr:
            "✖ Local backend isn't running. (it's not listening at http://127.0.0.1:3210)",
        } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
        bootstrapEvents.push('dev');
        expect(opts?.env?.DEPLOY_ENV).toBe('development');
        expect(opts?.env?.SITE_URL).toBe('http://localhost:3000');
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {
      expect(process.env.DEPLOY_ENV).toBe('development');
      expect(process.env.SITE_URL).toBe('http://localhost:3000');
      fs.writeFileSync(
        path.join(tmpDir, 'convex', 'functions', 'generated', 'auth.ts'),
        'export const defineAuth = () => null;\n'
      );
    });
    const syncEnvCalls: Array<string | undefined> = [];
    const syncEnvStub = mock(async (params: { authSyncMode?: string }) => {
      syncEnvCalls.push(params.authSyncMode);
      bootstrapEvents.push(`sync:${params.authSyncMode ?? 'auto'}`);
    });
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
      });
      expect(exitCode).toBe(0);
      expect(syncEnvCalls).toEqual(['prepare', 'complete']);
      expect(bootstrapEvents).toEqual([
        'codegen',
        'sync:prepare',
        'dev',
        'sync:complete',
      ]);
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails in an empty dir without a template', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-empty-dir-')
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
        handleInitCommand(['init', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Could not detect a supported app scaffold. Use `kitcn init -t <next|start|vite>` for a fresh app.'
      );
      expect(execaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand rejects template mode when the target already has a supported scaffold', async () => {
    const nextDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-existing-next-')
    );
    writeShadcnNextApp(nextDir);

    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    process.chdir(nextDir);
    try {
      await expect(
        handleInitCommand(['init', '-t', 'next', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Existing supported app scaffold detected. Run `kitcn init --yes` in . to adopt the current project.'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails when both root and src app layouts exist', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-ambiguous-roots-')
    );
    writeShadcnNextApp(tmpDir, { usesSrc: true });
    const appDir = path.join(tmpDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'layout.tsx'), 'export default null;\n');

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
        handleInitCommand(['init', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Ambiguous scaffold roots: both app and src/app exist.'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand uses concave for adoption codegen/bootstrap when backend is concave', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-concave-')
    );
    writeShadcnNextApp(tmpDir);
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
          loadCliConfig: loadConfigStub as any,
        }
      );
      expect(exitCode).toBe(0);
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
        JSON.parse(fs.readFileSync(path.join(tmpDir, 'kitcn.json'), 'utf8'))
      ).toMatchObject({
        backend: 'concave',
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand uses concave static codegen for fresh template init', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-concave-template-')
    );
    const fakeConcaveCliPath = path.join(tmpDir, 'concave-cli.mjs');
    fs.writeFileSync(fakeConcaveCliPath, 'export {};\n');
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args.includes(INIT_SHADCN_PACKAGE_SPEC)) {
        writeShadcnNextApp(tmpDir);
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
          loadCliConfig: loadConfigStub as any,
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
      path.join(os.tmpdir(), 'kitcn-init-command-concave-missing-')
    );
    writeShadcnNextApp(tmpDir);
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
          loadCliConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('backend=concave could not find Concave CLI');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails when template codegen cannot be produced', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-create-command-template-fail-')
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
            : path.basename(tmpDir);
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'nope',
        } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'bootstrap nope',
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
      await expect(
        handleInitCommand(['init', '-t', 'next', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('Failed to generate a real kitcn runtime during init.');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand(--json) stubs codegen instead of bootstrapping local Convex', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-json-stub-')
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
            : path.basename(tmpDir);
        writeShadcnNextApp(path.join(baseDir, projectName));
        return { exitCode: 0, stdout: '', stderr: '' } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'codegen') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'nope',
        } as any;
      }
      if (args[0] === '/fake/convex/main.js' && args[1] === 'dev') {
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'bootstrap nope',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const originalCwd = process.cwd();
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(
        ['init', '-t', 'next', '--yes', '--json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadCliConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      expect(
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return args[0] === '/fake/convex/main.js' && args[1] === 'dev';
        })
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(tmpDir, 'convex', 'functions', 'generated', 'server.ts')
        )
      ).toBe(true);
      expect(infoLines.join('\n')).toContain('"codegen":"stubbed"');
    } finally {
      console.info = originalInfo;
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand(--yes --json) skips post-init local bootstrap for existing apps', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-init-command-json-existing-')
    );
    writeShadcnNextApp(tmpDir);
    const execaStub = mock(
      async () => ({ exitCode: 0, stdout: '', stderr: '' }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());
    const runLocalBootstrapStub = mock(async () => 0);
    const originalCwd = process.cwd();
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    process.chdir(tmpDir);
    try {
      const exitCode = await handleInitCommand(['init', '--yes', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
        runLocalBootstrap: runLocalBootstrapStub as any,
      });

      expect(exitCode).toBe(0);
      expect(runLocalBootstrapStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain('"command":"init"');
    } finally {
      console.info = originalInfo;
      process.chdir(originalCwd);
    }
  });
});
