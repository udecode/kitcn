import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  collectPluginScaffoldTemplates,
  ensureConvexGitignoreEntry,
  getAggregateBackfillDeploymentKey,
  getDevAggregateBackfillStatePath,
  isEntryPoint,
  parseArgs,
  run,
} from './cli';
import { INIT_SHADCN_PACKAGE_SPEC } from './commands/init';
import { getPluginCatalogEntry } from './plugin-catalog';
import { RESEND_SCHEMA_TEMPLATE } from './plugins/resend/resend-schema.template';
import { writeShadcnNextApp } from './test-utils';

const TS_EXTENSION_RE = /\.ts$/;
const INLINE_BATCH_EMAIL_SCHEMA_OUTPUT_RE =
  /\.output\(\s*z\.array\(\s*z\.object\(\{/m;
const LEGACY_TRAILING_COMMA_RE = /,\n(\s*[)\]}])/g;
const LEGACY_RELATIONS_INDENT_RE = /\.relations\(\(r\) => \(\{\n\s{6}/;
const LEGACY_RELATIONS_CLOSE_RE = /\n\s{6}\}\)\);\n\}/;
const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`);
const SHADCN_LAYOUT_PROVIDERS_RE =
  /ThemeProvider>\s*<Providers>\{children\}<\/Providers>\s*<\/ThemeProvider>/s;

function createDefaultConfig() {
  return {
    paths: {
      lib: 'convex/lib',
      shared: 'convex/shared',
    },
    hooks: {
      postAdd: [],
    },
    dev: {
      debug: false,
      args: [],
      aggregateBackfill: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
      },
      migrations: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 256,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: false,
        allowDrift: true,
      },
    },
    codegen: {
      debug: false,
      args: [],
      trimSegments: ['plugins'],
    },
    deploy: {
      args: [],
      aggregateBackfill: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 1000,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
      },
      migrations: {
        enabled: 'auto' as const,
        wait: true,
        batchSize: 256,
        pollIntervalMs: 1000,
        timeoutMs: 900_000,
        strict: true,
        allowDrift: false,
      },
    },
  };
}

function writePackageJson(
  dir: string,
  pkg: Record<string, unknown> = { name: 'test-app', private: true }
) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`
  );
}

function writeMinimalSchema(dir: string, source?: string) {
  const schemaSource =
    source ??
    `
    import { defineSchema } from "better-convex/orm";

    export default defineSchema({});
    `.trim();
  fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'convex', 'schema.ts'), `${schemaSource}\n`);
}

function formatAsLegacySingleQuoteTs(source: string) {
  return source
    .replaceAll('"', "'")
    .replace(LEGACY_TRAILING_COMMA_RE, '\n$1')
    .replace(LEGACY_RELATIONS_INDENT_RE, '.relations((r) => ({\n    ')
    .replace(LEGACY_RELATIONS_CLOSE_RE, '\n  }));\n}');
}

function expectDependencyInstallCall(calls: unknown[], packageName: string) {
  const normalized = calls as [string, string[], Record<string, unknown>][];
  if (normalized.length !== 1) {
    throw new Error(
      `Expected 1 dependency install call, received ${normalized.length}.`
    );
  }
  if (normalized[0]?.[0] !== 'bun') {
    throw new Error(
      `Expected dependency install command "bun", received "${normalized[0]?.[0] ?? 'undefined'}".`
    );
  }
  if (
    JSON.stringify(normalized[0]?.[1]) !== JSON.stringify(['add', packageName])
  ) {
    throw new Error(
      `Expected dependency install args ${JSON.stringify(['add', packageName])}, received ${JSON.stringify(normalized[0]?.[1] ?? [])}.`
    );
  }
}

describe('cli/cli', () => {
  test('isEntryPoint treats symlinked bin shims as the entrypoint', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-entrypoint-')
    );
    const target = path.join(tmpDir, 'target.mjs');
    const link = path.join(tmpDir, 'link');

    fs.writeFileSync(target, 'export {};');
    fs.symlinkSync(target, link);

    expect(isEntryPoint(link, target)).toBe(true);
    expect(isEntryPoint(target, target)).toBe(true);

    const other = path.join(tmpDir, 'other.mjs');
    fs.writeFileSync(other, 'export {};');
    expect(isEntryPoint(link, other)).toBe(false);
  });

  test('parseArgs defaults to dev and strips better-convex flags anywhere', () => {
    expect(parseArgs([])).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: false,
      sharedDir: undefined,
      scope: undefined,
      configPath: undefined,
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out/dir',
        '--scope',
        'auth',
        '--config',
        './better-convex.config.json',
      ])
    ).toEqual({
      command: 'dev',
      restArgs: [],
      convexArgs: [],
      debug: true,
      sharedDir: 'out/dir',
      scope: 'auth',
      configPath: './better-convex.config.json',
    });

    expect(
      parseArgs([
        '--debug',
        '--api',
        'out',
        'codegen',
        '--scope',
        'orm',
        '--foo',
        'bar',
      ])
    ).toEqual({
      command: 'codegen',
      restArgs: ['--foo', 'bar'],
      convexArgs: ['--foo', 'bar'],
      debug: true,
      sharedDir: 'out',
      scope: 'orm',
      configPath: undefined,
    });
  });

  test('parseArgs throws for invalid --scope value', () => {
    expect(() => parseArgs(['--scope', 'bad'])).toThrow(
      'Invalid --scope value "bad". Expected one of: all, auth, orm.'
    );
  });

  test('parseArgs throws for missing --config value', () => {
    expect(() => parseArgs(['--config'])).toThrow(
      'Missing value for --config.'
    );
  });

  test('run(--help) prints better-convex help instead of passing through to convex', async () => {
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
      const exitCode = await run(['--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain('Usage: better-convex');
      expect(infoLines.join('\n')).toContain('add [plugin]');
      expect(infoLines.join('\n')).toContain('view [plugin]');
      expect(infoLines.join('\n')).toContain('info');
      expect(infoLines.join('\n')).toContain('docs <topic...>');
      expect(infoLines.join('\n')).not.toContain('diff [plugin]');
      expect(infoLines.join('\n')).not.toContain('list');
      expect(infoLines.join('\n')).not.toContain('update [plugin]');
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(add --help) prints add help and exits without writes', async () => {
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
      const exitCode = await run(['add', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain(
        'Usage: better-convex add [plugin]'
      );
      expect(infoLines.join('\n')).toContain('--diff [path]');
      expect(infoLines.join('\n')).toContain('--view [path]');
      expect(infoLines.join('\n')).toContain('--preset');
      expect(infoLines.join('\n')).toContain('--overwrite');
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(init --help) prints init help and exits without writes', async () => {
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
      const exitCode = await run(['init', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain('Usage: better-convex init');
      expect(infoLines.join('\n')).toContain('--template');
      expect(infoLines.join('\n')).toContain('--cwd');
      expect(infoLines.join('\n')).toContain('--name');
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(create --help) prints init help', async () => {
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
      const exitCode = await run(['create', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
      expect(infoLines.join('\n')).toContain('Usage: better-convex init');
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(init -t next --yes) shells out to shadcn for fresh dirs, then applies better-convex overlay', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-init-')
    );
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      const execaStub = mock(async (_cmd: string, args: string[]) => {
        if (
          args.includes('init') &&
          args.includes('--template') &&
          args.includes('next')
        ) {
          const cwdFlagIndex = args.indexOf('--cwd');
          const nameFlagIndex = args.indexOf('--name');
          const baseDir = cwdFlagIndex >= 0 ? args[cwdFlagIndex + 1]! : dir;
          const projectName =
            nameFlagIndex >= 0 ? args[nameFlagIndex + 1]! : path.basename(dir);
          const projectDir = path.join(baseDir, projectName);
          writeShadcnNextApp(projectDir);
        }
        return { exitCode: 0 } as any;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['init', '-t', 'next', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const firstCall = execaStub.mock.calls.find((call) =>
        call[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
      ) as unknown as [string, string[], Record<string, unknown>] | undefined;
      expect(firstCall?.[0]).toBe('bunx');
      expect(firstCall?.[1].slice(0, 8)).toEqual([
        INIT_SHADCN_PACKAGE_SPEC,
        'init',
        '--template',
        'next',
        '--cwd',
        path.dirname(fs.realpathSync(dir)),
        '--name',
        path.basename(dir),
      ]);
      expect(firstCall?.[1][7]).toContain('better-convex-cli-init-');
      expect(firstCall?.[1]).toContain('--defaults');
      expect(firstCall?.[1]).toContain('--yes');
      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'convex.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'tsconfig.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'eslint.config.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'next.config.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'postcss.config.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'components.json'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'app', 'layout.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'app', 'page.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'app', 'globals.css'))).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'components', 'theme-provider.tsx'))
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, 'lib', 'utils.ts'))).toBe(true);
      const tsconfig = JSON.parse(
        fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8')
      );
      expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./*']);
      expect(tsconfig.compilerOptions.paths['@convex/*']).toEqual([
        './convex/shared/*',
      ]);
      expect(
        fs
          .readFileSync(path.join(dir, 'eslint.config.mjs'), 'utf8')
          .includes('eslint-config-next/core-web-vitals')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(dir, 'next.config.mjs'), 'utf8')
          .includes('const nextConfig = {}')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(dir, 'postcss.config.mjs'), 'utf8')
          .includes('"@tailwindcss/postcss"')
      ).toBe(true);
      expect(
        SHADCN_LAYOUT_PROVIDERS_RE.test(
          fs.readFileSync(path.join(dir, 'app', 'layout.tsx'), 'utf8')
        )
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(dir, 'app', 'page.tsx'), 'utf8')
          .includes('shadcn page')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(dir, 'app', 'globals.css'), 'utf8')
          .includes('--shadcn-shell')
      ).toBe(true);
      expect(
        fs
          .readFileSync(
            path.join(dir, 'components', 'theme-provider.tsx'),
            'utf8'
          )
          .includes('NextThemesProvider')
      ).toBe(true);
      expect(
        fs
          .readFileSync(path.join(dir, 'lib', 'utils.ts'), 'utf8')
          .includes('filter(Boolean)')
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'schema.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'http.ts'))
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, 'convex', 'lib', 'crpc.ts'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(dir, 'convex', 'lib', 'get-env.ts'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(dir, 'concave.json'))).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(init --yes) skips shadcn in fresh dirs and applies better-convex overlay only', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-init-overlay-only-')
    );
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['init', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        (
          execaStub.mock.calls as unknown as [string, string[], ...unknown[]][]
        ).some(([, args]) => args.includes(INIT_SHADCN_PACKAGE_SPEC))
      ).toBe(false);
      expect(fs.existsSync(path.join(dir, 'package.json'))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'convex.json'))).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'schema.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'http.ts'))
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, 'convex', 'lib', 'crpc.ts'))).toBe(
        true
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(init -t next --yes --cwd apps --name web) overlays the generated app dir', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-init-named-')
    );
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      const execaStub = mock(async (_cmd: string, args: string[]) => {
        if (
          args.includes('init') &&
          args.includes('--template') &&
          args.includes('next')
        ) {
          const cwdFlagIndex = args.indexOf('--cwd');
          const nameFlagIndex = args.indexOf('--name');
          const baseDir = cwdFlagIndex >= 0 ? args[cwdFlagIndex + 1]! : dir;
          const projectName =
            nameFlagIndex >= 0 ? args[nameFlagIndex + 1]! : 'web';
          const projectDir = path.join(baseDir, projectName);
          writeShadcnNextApp(projectDir);
        }
        return { exitCode: 0 } as any;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
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
      expect(fs.existsSync(path.join(dir, 'apps', 'web', 'package.json'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(dir, 'apps', 'web', 'convex.json'))).toBe(
        true
      );
      expect(
        fs.existsSync(
          path.join(dir, 'apps', 'web', 'convex', 'functions', 'schema.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'apps', 'web', 'convex', 'lib', 'crpc.ts'))
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, 'convex.json'))).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(create -t next --yes) behaves like init and shells out to shadcn for fresh dirs', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-create-')
    );
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      const execaStub = mock(async (_cmd: string, args: string[]) => {
        if (
          args.includes('init') &&
          args.includes('--template') &&
          args.includes('next')
        ) {
          const cwdFlagIndex = args.indexOf('--cwd');
          const nameFlagIndex = args.indexOf('--name');
          const baseDir = cwdFlagIndex >= 0 ? args[cwdFlagIndex + 1]! : dir;
          const projectName =
            nameFlagIndex >= 0 ? args[nameFlagIndex + 1]! : path.basename(dir);
          const projectDir = path.join(baseDir, projectName);
          writeShadcnNextApp(projectDir);
        }
        return { exitCode: 0 } as any;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['create', '-t', 'next', '--yes'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const firstCall = execaStub.mock.calls.find((call) =>
        call[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
      ) as unknown as [string, string[], Record<string, unknown>] | undefined;
      expect(firstCall?.[0]).toBe('bunx');
      expect(firstCall?.[1].slice(0, 4)).toEqual([
        INIT_SHADCN_PACKAGE_SPEC,
        'init',
        '--template',
        'next',
      ]);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'schema.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(init -t vite --yes) fails fast for unsupported templates', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-init-unsupported-')
    );
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      await expect(
        run(['init', '-t', 'vite', '--yes'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Unsupported init template "vite". Only "next" is currently supported.'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes --dry-run --json) emits shared install plan with files and operations', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-plan-json-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--yes', '--dry-run', '--json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as {
        plugin?: string;
        preset?: string;
        selectionSource?: string;
        files?: Array<{ path: string; kind: string; action: string }>;
        operations?: Array<{ kind: string; status: string; path?: string }>;
      };
      expect(payload.plugin).toBe('resend');
      expect(payload.selectionSource).toBe('preset');
      expect(payload.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'convex/schema.ts',
            kind: 'schema',
          }),
          expect.objectContaining({
            path: 'convex/plugins.lock.json',
            kind: 'lockfile',
          }),
          expect.objectContaining({
            path: 'concave.json',
            kind: 'config',
          }),
          expect.objectContaining({
            path: 'convex/lib/get-env.ts',
            kind: 'env',
          }),
          expect.objectContaining({
            path: 'convex/plugins/resend.ts',
            kind: 'scaffold',
          }),
        ])
      );
      expect(payload.operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'dependency_install',
          }),
          expect.objectContaining({
            kind: 'codegen',
          }),
        ])
      );
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes --dry-run) uses ANSI colors when FORCE_COLOR=1', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-dry-run-color-')
    );
    const oldCwd = process.cwd();
    const originalForceColor = process.env.FORCE_COLOR;
    const originalNoColor = process.env.NO_COLOR;
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    process.env.FORCE_COLOR = '1';
    process.env.NO_COLOR = undefined;

    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['add', 'resend', '--yes', '--dry-run'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toMatch(ANSI_ESCAPE_RE);
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
      if (originalForceColor === undefined) {
        process.env.FORCE_COLOR = undefined;
      } else {
        process.env.FORCE_COLOR = originalForceColor;
      }
      if (originalNoColor === undefined) {
        process.env.NO_COLOR = undefined;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    }
  });

  test('run(add resend --yes --dry-run --json) treats formatting-only resend schema drift as skip', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-formatting-only-drift-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex', 'lib', 'plugins', 'resend'), {
      recursive: true,
    });
    writeMinimalSchema(dir);
    fs.writeFileSync(
      path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'schema.ts'),
      `${formatAsLegacySingleQuoteTs(RESEND_SCHEMA_TEMPLATE)}\n`
    );

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--yes', '--dry-run', '--json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as {
        files?: Array<{ path: string; action: string }>;
      };
      expect(payload.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'convex/lib/plugins/resend/schema.ts',
            action: 'skip',
          }),
        ])
      );
      expect(
        execaStub.mock.calls.some((call) =>
          (
            call as unknown as [string, string[], Record<string, unknown>]
          )[1]?.includes(INIT_SHADCN_PACKAGE_SPEC)
        )
      ).toBe(false);
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --diff convex/plugins/resend.ts) prints focused preview diff', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-diff-preview-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--yes', '--diff', 'convex/plugins/resend.ts'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const output = infoLines.join('\n');
      expect(output).toContain('convex/plugins/resend.ts');
      expect(output).toContain('convex/plugins/resend.ts (create)');
      expect(output).toContain('createResendHandler');
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes --dry-run --json) auto-initializes baseline files when missing, then plans resend install', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-auto-init-resend-')
    );
    const oldCwd = process.cwd();
    writePackageJson(dir);
    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--yes', '--dry-run', '--json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as {
        files?: Array<{ path: string; kind: string; action: string }>;
      };
      expect(payload.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'convex.json',
            action: 'create',
          }),
          expect.objectContaining({
            path: 'convex/functions/schema.ts',
            kind: 'schema',
            action: 'create',
          }),
          expect.objectContaining({
            path: 'convex/functions/http.ts',
            kind: 'scaffold',
            action: 'create',
          }),
          expect.objectContaining({
            path: 'convex/lib/crpc.ts',
            kind: 'scaffold',
            action: 'create',
          }),
          expect.objectContaining({
            path: 'convex/functions/plugins/resend.ts',
            kind: 'scaffold',
          }),
        ])
      );
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add ratelimit --yes --no-codegen) auto-initializes baseline and wires ratelimit into crpc.ts', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-auto-init-ratelimit-')
    );
    const oldCwd = process.cwd();
    writePackageJson(dir);
    process.chdir(dir);

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'ratelimit', '--yes', '--no-codegen'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const crpcSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        'utf8'
      );
      expect(crpcSource).toContain(
        "import { type RatelimitBucket, ratelimit } from './plugins/ratelimit/plugin';"
      );
      expect(crpcSource).toContain('ratelimit?: RatelimitBucket;');
      expect(crpcSource).toContain(
        'export const publicMutation = c.mutation.use(ratelimit.middleware());'
      );
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'functions', 'schema.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('ensureConvexGitignoreEntry adds .convex/ once', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-gitignore-')
    );
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const gitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules\n');

    ensureConvexGitignoreEntry(tmpDir);
    ensureConvexGitignoreEntry(tmpDir);

    const updated = fs.readFileSync(gitignorePath, 'utf8');
    expect(updated).toContain('.convex/\n');
    expect((updated.match(/\.convex\/\n/g) ?? []).length).toBe(1);
  });

  test('ensureConvexGitignoreEntry updates repo root .gitignore when run from nested cwd', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-gitignore-nested-')
    );
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const nestedDir = path.join(tmpDir, 'example', 'convex', 'functions');
    fs.mkdirSync(nestedDir, { recursive: true });

    const rootGitignorePath = path.join(tmpDir, '.gitignore');
    fs.writeFileSync(rootGitignorePath, 'node_modules\n');

    ensureConvexGitignoreEntry(nestedDir);

    const updated = fs.readFileSync(rootGitignorePath, 'utf8');
    expect(updated).toContain('.convex/\n');
  });

  test('getAggregateBackfillDeploymentKey resolves prod/deployment/preview/local', () => {
    expect(getAggregateBackfillDeploymentKey(['--prod'])).toBe('prod');
    expect(
      getAggregateBackfillDeploymentKey(['--deployment-name', 'staging-one'])
    ).toBe('deployment:staging-one');
    expect(
      getAggregateBackfillDeploymentKey(['--preview-name=feature-123'])
    ).toBe('preview:feature-123');
    expect(getAggregateBackfillDeploymentKey([])).toBe('local');
  });

  test('getDevAggregateBackfillStatePath lives under .convex', () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-state-')
    );
    expect(getDevAggregateBackfillStatePath(tmpDir)).toBe(
      path.join(
        tmpDir,
        '.convex',
        'better-convex',
        'aggregate-backfill-state.json'
      )
    );
  });

  test('run(codegen) calls generateMeta first and then invokes convex codegen with merged args', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      paths: {
        ...createDefaultConfig().paths,
        shared: 'config/out',
      },
      codegen: {
        debug: false,
        args: ['--team', 'acme'],
        scope: 'orm' as const,
      },
    }));

    const exitCode = await run(
      [
        '--debug',
        '--api',
        'custom/out',
        '--scope',
        'auth',
        '--config',
        './custom-config.json',
        'codegen',
        '--prod',
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
    expect(loadConfigStub).toHaveBeenCalledWith('./custom-config.json');
    expect(generateMetaStub).toHaveBeenCalledWith('custom/out', {
      debug: true,
      scope: 'auth',
      trimSegments: ['plugins'],
    });
    expect(calls).toEqual([
      {
        cmd: 'node',
        args: ['/fake/convex/main.js', 'codegen', '--team', 'acme', '--prod'],
      },
    ]);
  });

  test('run(codegen) defaults to scope=all when scope is missing', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      scope: 'all',
      trimSegments: ['plugins'],
    });
  });

  test('run(codegen) uses configured scope when cli scope is missing', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => ({
      ...createDefaultConfig(),
      codegen: {
        ...createDefaultConfig().codegen,
        scope: 'orm' as const,
      },
    }));

    const exitCode = await run(['codegen'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(generateMetaStub).toHaveBeenCalledWith('convex/shared', {
      debug: false,
      scope: 'orm',
      trimSegments: ['plugins'],
    });
  });

  test('run(add resend) scaffolds resend integration files without invoking convex CLI', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', 'schema.ts'),
      `
      import { defineSchema } from "better-convex/orm";

      export default defineSchema({});
      `.trim()
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expectDependencyInstallCall(
        execaStub.mock.calls as unknown as unknown[],
        '@better-convex/resend'
      );
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'schema.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'resend.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'email.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'email.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'template.tsx')
        )
      ).toBe(false);
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).toContain('export const resend = ResendPlugin.configure');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).toContain('ResendPlugin.configure({');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).not.toContain('configure(({ ctx }) =>');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).not.toContain('defaultResendOptions');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).toContain('apiKey: getEnv().RESEND_API_KEY');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).toContain('webhookSecret: getEnv().RESEND_WEBHOOK_SECRET');
      expect(fs.existsSync(path.join(dir, 'convex', 'lib', 'get-env.ts'))).toBe(
        true
      );
      const envSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'get-env.ts'),
        'utf8'
      );
      expect(envSource).toContain(
        "DEPLOY_ENV: z.string().default('production')"
      );
      expect(envSource).toContain(
        "SITE_URL: z.string().default('http://localhost:3000')"
      );
      expect(envSource).toContain('RESEND_API_KEY: z.string().optional()');
      expect(envSource).toContain(
        'RESEND_WEBHOOK_SECRET: z.string().optional()'
      );
      expect(envSource).toContain('RESEND_FROM_EMAIL: z.string().optional()');
      const createdConfig = JSON.parse(
        fs.readFileSync(path.join(dir, 'concave.json'), 'utf8')
      ) as {
        meta?: {
          'better-convex'?: {
            paths?: {
              env?: string;
            };
          };
        };
      };
      expect(createdConfig.meta?.['better-convex']?.paths?.env).toBe(
        'convex/lib/get-env.ts'
      );
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).not.toContain('getResend(');
      expect(
        fs.readFileSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).not.toContain('generated/server');
      const resendFunctionsSource = fs.readFileSync(
        path.join(dir, 'convex', 'plugins', 'resend.ts'),
        'utf8'
      );
      const resendSchemaSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'schema.ts'),
        'utf8'
      );
      const appSchemaSource = fs.readFileSync(
        path.join(dir, 'convex', 'schema.ts'),
        'utf8'
      );
      const resendEmailSource = fs.readFileSync(
        path.join(dir, 'convex', 'plugins', 'email.tsx'),
        'utf8'
      );
      const resendWebhookSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'webhook.ts'),
        'utf8'
      );
      expect(resendFunctionsSource).toContain('createResendHandler');
      expect(resendFunctionsSource).toContain('createResendCaller');
      expect(resendFunctionsSource).not.toContain(
        'function getMutationCaller('
      );
      expect(resendFunctionsSource).not.toContain('function getActionCaller(');
      expect(resendFunctionsSource).not.toContain('createResendRuntime');
      expect(resendFunctionsSource).not.toContain('buildResendHandlers');
      expect(resendFunctionsSource).toContain(
        "import { privateAction, privateMutation, privateQuery } from '../lib/crpc';"
      );
      expect(resendFunctionsSource).toContain(
        "import { eq, inArray } from 'better-convex/orm';"
      );
      expect(resendFunctionsSource).not.toContain('initCRPC');
      expect(resendFunctionsSource).not.toContain('initCRPC.create(');
      expect(resendFunctionsSource).not.toContain('const c =');
      expect(resendFunctionsSource).not.toContain('const internalMutation =');
      expect(resendFunctionsSource).not.toContain('const internalQuery =');
      expect(resendFunctionsSource).not.toContain('const internalAction =');
      expect(resendFunctionsSource).toContain(
        'export const cleanupOldEmails = privateMutation'
      );
      expect(resendFunctionsSource).toContain('.use(resend.middleware())');
      expect(resendFunctionsSource).toContain(
        'async function cleanupEmailBatch('
      );
      expect(resendFunctionsSource).not.toContain(
        'for (const email of batch ?? [])'
      );
      expect(resendFunctionsSource).toContain(
        'where(inArray(resendDeliveryEventsTable.emailId, emailIds))'
      );
      expect(resendFunctionsSource).toContain(
        'where: { id: { in: input.contentIds } }'
      );
      expect(resendFunctionsSource).toContain(
        'where: { id: { in: input.emailIds } }'
      );
      expect(resendFunctionsSource).toContain(
        'export const getStatus = privateQuery'
      );
      expect(resendFunctionsSource).toContain(
        'export const callResendAPIWithBatch = privateAction'
      );
      expect(resendFunctionsSource).not.toContain('RESEND_API_KEY is missing.');
      expect(resendFunctionsSource).not.toContain('ctx.runQuery(');
      expect(resendFunctionsSource).not.toContain('ctx.runMutation(');
      expect(resendFunctionsSource).not.toContain('ctx.runAction(');
      expect(resendFunctionsSource).not.toContain('deleteById(');
      expect(resendFunctionsSource).not.toContain('insertAndGetId(');
      expect(resendFunctionsSource).not.toContain('as any');
      expect(resendFunctionsSource).not.toContain('ctx: any');
      expect(resendFunctionsSource).toContain("from '@better-convex/resend';");
      expect(resendFunctionsSource).toContain(
        "from '../lib/plugins/resend/schema';"
      );
      expect(resendFunctionsSource).toContain('resendContentTable');
      expect(resendFunctionsSource).toContain('resendDeliveryEventsTable');
      expect(resendFunctionsSource).toContain('resendEmailsTable');
      expect(resendFunctionsSource).toContain('resendNextBatchRunTable');
      expect(resendFunctionsSource).not.toContain(
        "from '@better-convex/resend/schema';"
      );
      expect(resendFunctionsSource).not.toContain('resendStorageTables');
      expect(resendFunctionsSource).not.toContain('type OrmCtx =');
      expect(resendFunctionsSource).not.toContain('type OrmWriter');
      expect(resendFunctionsSource).not.toContain('as unknown as OrmCtx');
      expect(resendFunctionsSource).not.toContain(
        'type ResendEmailRow = NonNullable<'
      );
      expect(resendFunctionsSource).not.toContain(
        "type ResendEmailRow = Select<'resendEmails'>;"
      );
      expect(resendFunctionsSource).not.toContain('InferSelectModel');
      expect(resendFunctionsSource).not.toContain('const batchEmailSchema =');
      expect(resendFunctionsSource).toMatch(
        INLINE_BATCH_EMAIL_SCHEMA_OUTPUT_RE
      );
      expect(resendFunctionsSource).not.toContain(
        'const BASE_BATCH_DELAY_MS ='
      );
      expect(resendFunctionsSource).toContain(
        'await caller.schedule.after(1000).callResendAPIWithBatch({'
      );
      expect(resendEmailSource).toContain('import { privateAction } from');
      expect(resendEmailSource).toContain('../lib/crpc');
      expect(resendEmailSource).toContain('import { getEnv } from');
      expect(resendEmailSource).toContain('getEnv().RESEND_FROM_EMAIL');
      expect(resendEmailSource).not.toContain('process.env.RESEND_FROM_EMAIL');
      expect(resendEmailSource).not.toContain('initCRPC.create(');
      expect(resendEmailSource).not.toContain('const c =');
      expect(resendWebhookSource).toContain('import { publicRoute } from');
      expect(resendWebhookSource).toContain('../../crpc');
      expect(resendWebhookSource).toContain(
        'const event = await ctx.api.resend.verifyWebhookEvent(c.req.raw)'
      );
      expect(resendWebhookSource).toContain('export const resendWebhook =');
      expect(resendWebhookSource).not.toContain('registerResendWebhook');
      expect(resendWebhookSource).not.toContain('verifyResendWebhookEvent');
      expect(resendWebhookSource).not.toContain('initCRPC.create(');
      expect(resendWebhookSource).not.toContain('const c =');
      expect(resendSchemaSource).toContain('export function resendExtension()');
      expect(resendSchemaSource).toContain('defineSchemaExtension("resend", {');
      expect(resendSchemaSource).toContain('}).relations((r) => ({');
      expect(resendSchemaSource).toContain('deliveryEvents: r.many');
      expect(resendSchemaSource).not.toContain('tables: {');
      expect(resendSchemaSource).toContain('resendContent: resendContentTable');
      expect(resendSchemaSource).toContain(
        'unionOf(text().notNull(), integer().notNull()).notNull()'
      );
      expect(resendSchemaSource).not.toContain(
        'export const resendStorageTables'
      );
      expect(resendSchemaSource).not.toContain('const RESEND_CONTENT_TABLE =');
      expect(resendSchemaSource).not.toContain('type SchemaRelationsMap');
      expect(resendSchemaSource).not.toContain('defineSchemaRelations');
      expect(resendSchemaSource).not.toContain("from 'convex/values'");
      expect(resendSchemaSource).not.toContain('v.record(');
      expect(appSchemaSource).toContain(
        "import { resendExtension } from './lib/plugins/resend/schema';"
      );
      expect(appSchemaSource).toContain('.extend(resendExtension())');
      const lockfile = JSON.parse(
        fs.readFileSync(path.join(dir, 'convex', 'plugins.lock.json'), 'utf8')
      ) as {
        plugins: Record<
          string,
          { package: string; files?: Record<string, string> }
        >;
      };
      expect(lockfile.plugins.resend.package).toBe('@better-convex/resend');
      expect(lockfile.plugins.resend.files?.['resend-schema']).toBe(
        'convex/lib/plugins/resend/schema.ts'
      );
      expect(lockfile.plugins.resend.files?.['resend-plugin']).toBe(
        'convex/lib/plugins/resend/plugin.ts'
      );
      expect(lockfile.plugins.resend.files?.['resend-functions']).toBe(
        'convex/plugins/resend.ts'
      );
      expect(lockfile.plugins.resend.files?.['resend-email']).toBe(
        'convex/plugins/email.tsx'
      );
      expect('version' in lockfile).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) runs configured hooks.postAdd scripts', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-after-scaffold-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaCalls: Array<{
        cmd: string;
        args: string[];
        options: Record<string, unknown> | undefined;
      }> = [];
      const execaStub = mock(
        async (
          cmd: string,
          args: string[] = [],
          options?: Record<string, unknown>
        ) => {
          execaCalls.push({ cmd, args, options });
          return { exitCode: 0 } as any;
        }
      );
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        hooks: {
          postAdd: ['bun lint:fix'],
        },
      }));

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(execaCalls).toHaveLength(2);
      expect(execaCalls[0]?.cmd).toBe('bun');
      expect(execaCalls[0]?.args).toEqual(['add', '@better-convex/resend']);
      expect(execaCalls[1]?.cmd).toBe('bun lint:fix');
      expect(execaCalls[1]?.args).toEqual([]);
      expect(execaCalls[1]?.options).toMatchObject({
        shell: true,
        stdio: 'inherit',
        reject: false,
      });
      expect(execaCalls[1]?.options?.cwd).toContain(path.basename(dir));
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --dry-run) skips configured hooks.postAdd scripts', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-after-scaffold-dry-run-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        hooks: {
          postAdd: ['bun lint:fix'],
        },
      }));

      const exitCode = await run(
        ['add', 'resend', '--no-codegen', '--dry-run'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      expect(execaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add) prompts for plugin in interactive TTY mode when plugin arg is omitted', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-interactive-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const selectPromptStub = mock(async () => 'ratelimit');
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const exitCode = await run(['add', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: selectPromptStub as any,
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      expect(selectPromptStub).toHaveBeenCalled();
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'plugin.ts')
        )
      ).toBe(true);
      const ratelimitPluginSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'plugin.ts'),
        'utf8'
      );
      expect(ratelimitPluginSource).toContain(
        'import { MINUTE, Ratelimit, RatelimitPlugin } from "better-convex/ratelimit";'
      );
      expect(ratelimitPluginSource).toContain(
        'export const ratelimitBuckets = {'
      );
      expect(ratelimitPluginSource).toContain(
        'export const ratelimit = RatelimitPlugin.configure({'
      );
      expect(ratelimitPluginSource).toContain('default: {');
      expect(ratelimitPluginSource).not.toContain('project/create:free');
      expect(ratelimitPluginSource).not.toContain('tag/create:free');
      expectDependencyInstallCall(
        execaStub.mock.calls as unknown as unknown[],
        'better-convex'
      );
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) prompts for scaffold files and supports selecting templates outside preset defaults', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-file-select-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(async () => [
        'resend-plugin',
        'resend-functions',
      ]);

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      expect(multiselectPromptStub).toHaveBeenCalledTimes(1);
      const calls = multiselectPromptStub.mock.calls as unknown[];
      const firstCall = calls[0] as unknown[] | undefined;
      expect(firstCall).toBeDefined();
      const callArgs = firstCall![0] as {
        message: string;
        initialValues: string[];
        options: Array<{ label: string; value: string; hint?: string }>;
      };
      expect(callArgs.message).toContain('Enter to submit');
      expect(callArgs.initialValues).toEqual([
        'resend-email',
        'resend-functions',
        'resend-crons',
        'resend-plugin',
        'resend-schema',
        'resend-webhook',
      ]);
      expect(callArgs.options.map((option) => option.label)).toEqual([
        'convex/plugins/email.tsx',
        'convex/plugins/resend.ts',
        'convex/lib/plugins/resend/crons.ts',
        'convex/lib/plugins/resend/plugin.ts',
        'convex/lib/plugins/resend/schema.ts',
        'convex/lib/plugins/resend/webhook.ts',
      ]);
      expect(
        callArgs.options.every((option) => option.hint === undefined)
      ).toBe(true);

      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'resend.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(false);

      const lockfile = JSON.parse(
        fs.readFileSync(path.join(dir, 'convex', 'plugins.lock.json'), 'utf8')
      ) as {
        plugins: Record<
          string,
          { package: string; files?: Record<string, string> }
        >;
      };
      expect(lockfile.plugins.resend.package).toBe('@better-convex/resend');
      expect(lockfile.plugins.resend.files).toEqual({
        'resend-plugin': 'convex/lib/plugins/resend/plugin.ts',
        'resend-schema': 'convex/lib/plugins/resend/schema.ts',
        'resend-functions': 'convex/plugins/resend.ts',
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) throws when interactive scaffold file selection is empty', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-empty-select-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      await expect(
        run(['add', 'resend', '--no-codegen'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
          promptAdapter: {
            isInteractive: () => true,
            confirm: async () => true,
            select: async () => 'ignored',
            multiselect: async () => [],
          } as any,
        })
      ).rejects.toThrow(
        'No scaffold files selected for plugin "resend". Select at least one scaffold file.'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes) bypasses scaffold multiselect and uses preset templates', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-yes-bypass-select-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(async () => ['resend-plugin']);

      const exitCode = await run(['add', 'resend', '--yes', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      expect(multiselectPromptStub).not.toHaveBeenCalled();
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'resend.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) defaults first interactive selection to all resend scaffold files', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-default-all-first-run-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      const callArgs = (multiselectPromptStub.mock.calls[0] as unknown[])[0] as
        | {
            initialValues: string[];
          }
        | undefined;
      expect(callArgs?.initialValues).toEqual([
        'resend-email',
        'resend-functions',
        'resend-crons',
        'resend-plugin',
        'resend-schema',
        'resend-webhook',
      ]);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(true);
      expect(fs.existsSync(path.join(convexDir, 'plugins', 'resend.ts'))).toBe(
        true
      );
      expect(fs.existsSync(path.join(convexDir, 'plugins', 'email.tsx'))).toBe(
        true
      );
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) defaults scaffold selection from lockfile template IDs when present', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-lockfile-default-select-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
              files: {
                'resend-plugin': 'convex/lib/plugins/resend/plugin.ts',
              },
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      const callArgs = (multiselectPromptStub.mock.calls[0] as unknown[])[0] as
        | {
            initialValues: string[];
          }
        | undefined;
      expect(callArgs?.initialValues).toEqual(['resend-plugin']);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(false);
      expect(fs.existsSync(path.join(convexDir, 'plugins', 'resend.ts'))).toBe(
        true
      );
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes) uses lockfile template IDs when present', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-lockfile-default-yes-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
              files: {
                'resend-plugin': 'convex/lib/plugins/resend/plugin.ts',
              },
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['add', 'resend', '--yes', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(false);
      expect(fs.existsSync(path.join(convexDir, 'plugins', 'resend.ts'))).toBe(
        true
      );
      expect(
        fs.existsSync(
          path.join(convexDir, 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) falls back to preset defaults when lockfile has no scaffold mapping', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-lockfile-empty-fallback-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
              files: {},
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      const callArgs = (multiselectPromptStub.mock.calls[0] as unknown[])[0] as
        | {
            initialValues: string[];
          }
        | undefined;
      expect(callArgs?.initialValues).toEqual([
        'resend-email',
        'resend-functions',
        'resend-crons',
        'resend-plugin',
        'resend-schema',
        'resend-webhook',
      ]);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) ignores stale lockfile template ids and rewrites to known ids', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-lockfile-stale-templates-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
              files: {
                'resend-api': 'convex/lib/plugins/resend/api.ts',
              },
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const multiselectPromptStub = mock(
        async <TValue extends string>(params: {
          initialValues?: readonly TValue[];
        }) => params.initialValues ?? []
      );

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: async () => 'ignored',
          multiselect: multiselectPromptStub as any,
        } as any,
      });

      expect(exitCode).toBe(0);
      const callArgs = (multiselectPromptStub.mock.calls[0] as unknown[])[0] as
        | {
            initialValues: string[];
          }
        | undefined;
      expect(callArgs?.initialValues).toEqual([
        'resend-email',
        'resend-functions',
        'resend-crons',
        'resend-plugin',
        'resend-schema',
        'resend-webhook',
      ]);
      const lockfile = JSON.parse(
        fs.readFileSync(path.join(convexDir, 'plugins.lock.json'), 'utf8')
      ) as {
        plugins: {
          resend: {
            files?: Record<string, string>;
          };
        };
      };
      expect(lockfile.plugins.resend.files?.['resend-api']).toBeUndefined();
      expect(lockfile.plugins.resend.files?.['resend-plugin']).toBe(
        'convex/lib/plugins/resend/plugin.ts'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add) fails with usage in non-interactive mode when plugin arg is omitted', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['add', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => false,
          confirm: async () => true,
          select: async () => 'resend',
        } as any,
      })
    ).rejects.toThrow(
      'Missing plugin name. Usage: better-convex add [plugin].'
    );
  });

  test('run(add resend) does not overwrite existing user-owned scaffold files', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-idempotent-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const firstRunExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(firstRunExitCode).toBe(0);

      const resendFile = path.join(
        dir,
        'convex',
        'lib',
        'plugins',
        'resend',
        'plugin.ts'
      );
      expect(fs.existsSync(resendFile)).toBe(true);
      fs.writeFileSync(resendFile, '// user-customized resend integration\n');

      const secondRunExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(secondRunExitCode).toBe(0);
      expect(fs.readFileSync(resendFile, 'utf8')).toBe(
        '// user-customized resend integration\n'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --preset default) uses selected preset for scaffold files', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-preset-default-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--preset', 'default', '--no-codegen'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      expectDependencyInstallCall(
        execaStub.mock.calls as unknown as unknown[],
        '@better-convex/resend'
      );
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'resend.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'email.tsx'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'crons.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'webhook.ts')
        )
      ).toBe(true);
      expect(fs.existsSync(path.join(dir, 'convex', 'http.ts'))).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --preset minimal) throws invalid preset error', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['add', 'resend', '--preset=minimal', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      'Invalid preset "minimal" for plugin "resend". Expected one of: default.'
    );
  });

  test('run(add resend) supports paths.lib override for plugin helper output', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-flat-override-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        paths: {
          ...createDefaultConfig().paths,
          shared: 'convex/custom-shared',
          lib: 'custom-lib',
        },
      }));

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        fs.existsSync(
          path.join(dir, 'custom-lib', 'plugins', 'resend', 'plugin.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'resend.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'plugins', 'email.tsx'))
      ).toBe(true);
      expect(
        fs.readFileSync(
          path.join(dir, 'custom-lib', 'plugins', 'resend', 'plugin.ts'),
          'utf8'
        )
      ).toContain('export const resend = ResendPlugin.configure');
      expect(fs.existsSync(path.join(dir, 'custom-lib', 'get-env.ts'))).toBe(
        true
      );
      const resendFunctionsSource = fs.readFileSync(
        path.join(dir, 'convex', 'plugins', 'resend.ts'),
        'utf8'
      );
      const resendWebhookSource = fs.readFileSync(
        path.join(dir, 'custom-lib', 'plugins', 'resend', 'webhook.ts'),
        'utf8'
      );
      const resendEmailSource = fs.readFileSync(
        path.join(dir, 'convex', 'plugins', 'email.tsx'),
        'utf8'
      );
      expect(resendFunctionsSource).toContain(
        "import { privateAction, privateMutation, privateQuery } from '../../custom-lib/crpc';"
      );
      expect(resendFunctionsSource).toContain(
        "import { eq, inArray } from 'better-convex/orm';"
      );
      expect(resendFunctionsSource).not.toContain('initCRPC.create(');
      expect(resendEmailSource).toContain('import { privateAction } from');
      expect(resendEmailSource).toContain('../../custom-lib/crpc');
      expect(resendEmailSource).toContain('import { getEnv } from');
      expect(resendEmailSource).toContain('../../custom-lib/get-env');
      expect(resendEmailSource).toContain('getEnv().RESEND_FROM_EMAIL');
      expect(resendWebhookSource).toContain('import { publicRoute } from');
      expect(resendWebhookSource).toContain('../../crpc');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) injects getEnv usage in email scaffold when paths.env is configured', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-resend-env-path-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        paths: {
          ...createDefaultConfig().paths,
          env: 'convex/lib/get-env.ts',
        },
      }));

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const resendEmailSource = fs.readFileSync(
        path.join(dir, 'convex', 'plugins', 'email.tsx'),
        'utf8'
      );
      const resendExtensionSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'plugins', 'resend', 'plugin.ts'),
        'utf8'
      );
      expect(resendEmailSource).toContain(
        "import { getEnv } from '../lib/get-env';"
      );
      expect(resendEmailSource).toContain('getEnv().RESEND_FROM_EMAIL');
      expect(resendEmailSource).not.toContain('process.env.RESEND_FROM_EMAIL');
      expect(resendExtensionSource).toContain(
        "import { getEnv } from '../../get-env';"
      );
      expect(resendExtensionSource).toContain(
        'apiKey: getEnv().RESEND_API_KEY'
      );
      expect(resendExtensionSource).toContain(
        'webhookSecret: getEnv().RESEND_WEBHOOK_SECRET'
      );
      expect(resendExtensionSource).not.toContain('process.env');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) throws when scaffold content contains process.env', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-env-guard-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    const descriptor = getPluginCatalogEntry('resend');
    const templates = descriptor.templates as unknown as Array<{
      id: string;
      content: string;
    }>;
    const pluginTemplate = templates.find(
      (template) => template.id === 'resend-plugin'
    );
    if (!pluginTemplate) {
      throw new Error('Expected resend-plugin scaffold template.');
    }
    const originalContent = pluginTemplate.content;
    pluginTemplate.content = `${originalContent}\nconst guard = process.env.SHOULD_FAIL;\n`;

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      await expect(
        run(['add', 'resend', '--no-codegen'], {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('contains process.env. Use getEnv() instead.');
    } finally {
      pluginTemplate.content = originalContent;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --events) throws because resend-specific global flags were removed', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['add', 'resend', '--events'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow('Unknown add flag "--events".');
  });

  test('run(add resend --preset nope) throws invalid preset error', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['add', 'resend', '--preset', 'nope'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      'Invalid preset "nope" for plugin "resend". Expected one of: default.'
    );
  });

  test('run(add ratelimit --preset schema-only) skips ratelimit scaffold writes', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-ratelimit-schema-only-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', 'schema.ts'),
      `
      import { defineSchema } from "better-convex/orm";

      export default defineSchema({});
      `.trim()
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'ratelimit', '--preset', 'schema-only', '--no-codegen'],
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
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'schema.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'plugin.ts')
        )
      ).toBe(false);
      expect(
        fs.readFileSync(path.join(dir, 'convex', 'schema.ts'), 'utf8')
      ).toContain(
        "import { ratelimitExtension } from './lib/plugins/ratelimit/schema';"
      );
      expect(
        fs.readFileSync(path.join(dir, 'convex', 'schema.ts'), 'utf8')
      ).toContain('.extend(ratelimitExtension())');
      const ratelimitSchemaSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'schema.ts'),
        'utf8'
      );
      expect(ratelimitSchemaSource).not.toContain('tables: {');
      expect(ratelimitSchemaSource).toContain(
        'ratelimitState: ratelimitStateTable'
      );
      expect(ratelimitSchemaSource).toContain('"ratelimit_state"');
      expect(ratelimitSchemaSource).not.toContain(
        'export const ratelimitStorageTables'
      );
      expect(ratelimitSchemaSource).not.toContain(
        'export const RATELIMIT_STATE_TABLE'
      );
      expect(ratelimitSchemaSource).not.toContain(
        'export const RATELIMIT_DYNAMIC_TABLE'
      );
      expect(ratelimitSchemaSource).not.toContain(
        'export const RATELIMIT_PROTECTION_TABLE'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add ratelimit --preset schema-only) bootstraps getEnv when paths.env is missing', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-ratelimit-env-bootstrap-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', 'schema.ts'),
      `
      import { defineSchema } from "better-convex/orm";

      export default defineSchema({});
      `.trim()
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'ratelimit', '--preset', 'schema-only', '--no-codegen'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      expect(fs.existsSync(path.join(dir, 'convex', 'lib', 'get-env.ts'))).toBe(
        true
      );
      const envSource = fs.readFileSync(
        path.join(dir, 'convex', 'lib', 'get-env.ts'),
        'utf8'
      );
      expect(envSource).toContain(
        "DEPLOY_ENV: z.string().default('production')"
      );
      expect(envSource).toContain(
        "SITE_URL: z.string().default('http://localhost:3000')"
      );
      const createdConfig = JSON.parse(
        fs.readFileSync(path.join(dir, 'concave.json'), 'utf8')
      ) as {
        meta?: {
          'better-convex'?: {
            paths?: {
              env?: string;
            };
          };
        };
      };
      expect(createdConfig.meta?.['better-convex']?.paths?.env).toBe(
        'convex/lib/get-env.ts'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add ratelimit --yes --dry-run --json) emits machine-readable plan without writes', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-ratelimit-dryrun-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'ratelimit', '--yes', '--dry-run', '--json'],
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
        fs.existsSync(
          path.join(dir, 'convex', 'lib', 'plugins', 'ratelimit', 'plugin.ts')
        )
      ).toBe(false);
      expect(
        infoLines.some((line) => line.includes('"plugin":"ratelimit"'))
      ).toBe(true);
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes --dry-run --json) includes dependency hints for react email scaffold', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-resend-dryrun-json-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(
        ['add', 'resend', '--yes', '--dry-run', '--json'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
        }
      );

      expect(exitCode).toBe(0);
      const payloadLine = infoLines.find((line) =>
        line.includes('"command":"add"')
      );
      const payload = JSON.parse(payloadLine ?? '{}') as {
        selectedTemplateIds: string[];
        dependencyHints?: string[];
        envReminders?: Array<{
          key: string;
          path: string;
          message?: string;
        }>;
      };
      expect(payload.selectedTemplateIds).toContain('resend-email');
      expect(payload.dependencyHints?.join('\n')).toContain(
        '@react-email/components'
      );
      expect(payload.dependencyHints?.join('\n')).toContain(
        '@react-email/render'
      );
      expect(payload.dependencyHints?.join('\n')).toContain('react-email');
      expect(payload.dependencyHints?.join('\n')).toContain('react');
      expect(payload.dependencyHints?.join('\n')).toContain('react-dom');
      expect(payload.envReminders).toEqual([
        {
          key: 'RESEND_API_KEY',
          path: 'convex/.env',
          message: 'Set before sending email through Resend.',
        },
      ]);
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes --no-codegen) prints react email dependency hint', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-resend-human-hint-')
    );
    const oldCwd = process.cwd();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['add', 'resend', '--yes', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const output = infoLines.join('\n');
      expect(output).toContain('@react-email/components');
      expect(output).toContain('@react-email/render');
      expect(output).toContain('react-email');
      expect(output).toContain('react');
      expect(output).toContain('react-dom');
      expect(output).toContain('Set plugin env values in convex/.env');
      expect(output).toContain(
        'RESEND_API_KEY: Set before sending email through Resend.'
      );
      expectDependencyInstallCall(
        execaStub.mock.calls as unknown as unknown[],
        '@better-convex/resend'
      );
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(add resend) prompts before overwriting changed scaffold files in interactive mode', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-overwrite-prompt-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const confirmPromptStub = mock(async () => true);

      const firstExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(firstExitCode).toBe(0);

      const apiPath = path.join(
        convexDir,
        'lib',
        'plugins',
        'resend',
        'plugin.ts'
      );
      fs.writeFileSync(apiPath, '// stale\n');

      const exitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: confirmPromptStub as any,
          select: async () => 'resend',
          multiselect: async () => ['resend-plugin'],
        } as any,
      });

      expect(exitCode).toBe(0);
      expect(confirmPromptStub).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync(apiPath, 'utf8')).toContain(
        'export const resend = ResendPlugin.configure'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --overwrite) overwrites changed scaffold files without prompt', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-overwrite-flag-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const confirmPromptStub = mock(async () => true);

      const firstExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(firstExitCode).toBe(0);

      const apiPath = path.join(
        convexDir,
        'lib',
        'plugins',
        'resend',
        'plugin.ts'
      );
      fs.writeFileSync(apiPath, '// stale\n');

      const exitCode = await run(
        ['add', 'resend', '--overwrite', '--no-codegen'],
        {
          realConvex: '/fake/convex/main.js',
          execa: execaStub as any,
          generateMeta: generateMetaStub as any,
          syncEnv: syncEnvStub as any,
          loadBetterConvexConfig: loadConfigStub as any,
          promptAdapter: {
            isInteractive: () => true,
            confirm: confirmPromptStub as any,
            select: async () => 'resend',
            multiselect: async () => ['resend-plugin'],
          } as any,
        }
      );

      expect(exitCode).toBe(0);
      expect(confirmPromptStub).not.toHaveBeenCalled();
      expect(fs.readFileSync(apiPath, 'utf8')).toContain(
        'export const resend = ResendPlugin.configure'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(add resend --yes) skips changed scaffold files without --overwrite', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-add-skip-on-conflict-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const firstExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(firstExitCode).toBe(0);

      const apiPath = path.join(
        convexDir,
        'lib',
        'plugins',
        'resend',
        'plugin.ts'
      );
      fs.writeFileSync(apiPath, '// stale\n');

      const exitCode = await run(['add', 'resend', '--yes', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(fs.readFileSync(apiPath, 'utf8')).toBe('// stale\n');
      expect(infoLines.join('\n')).toContain('--overwrite');
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(view resend --json) reports planned updates from current files', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-view-json-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    writeMinimalSchema(dir);

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const addExitCode = await run(['add', 'resend', '--no-codegen'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(addExitCode).toBe(0);

      fs.writeFileSync(
        path.join(convexDir, 'lib', 'plugins', 'resend', 'plugin.ts'),
        '// stale\n'
      );
      fs.rmSync(path.join(convexDir, 'lib', 'plugins', 'resend', 'webhook.ts'));

      const exitCode = await run(['view', 'resend', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const viewJson = infoLines.find((line) =>
        line.includes('"command":"view"')
      );
      const payload = JSON.parse(viewJson ?? '{}') as {
        selectionSource?: string;
        files: Array<{ path: string; action: string }>;
      };
      expect(payload.selectionSource).toBe('lockfile');
      expect(payload.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'convex/lib/plugins/resend/plugin.ts',
            action: 'update',
          }),
          expect.objectContaining({
            path: 'convex/lib/plugins/resend/webhook.ts',
            action: 'create',
          }),
        ])
      );
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(view resend --json) uses lockfile template path mapping', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-view-lockfile-path-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });

    fs.writeFileSync(
      path.join(convexDir, 'schema.ts'),
      `
      import { defineSchema } from "better-convex/orm";
      import { resendExtension } from "./lib/plugins/resend/schema";

      export default defineSchema({}).extend(resendExtension());
      `.trim()
    );
    fs.mkdirSync(path.join(convexDir, 'lib', 'plugins', 'resend'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(convexDir, 'lib', 'plugins', 'resend', 'schema.ts'),
      `
      import { defineSchemaExtension } from "better-convex/orm";

      export const resendExtension = defineSchemaExtension("resend", {});
      `.trim()
    );
    fs.writeFileSync(path.join(convexDir, 'api.ts'), '// stale\n');
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
              files: {
                'resend-plugin': 'convex/api.ts',
              },
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['view', 'resend', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines[0] ?? '{}') as {
        files: Array<{ path: string; action: string }>;
        selectedTemplateIds: string[];
      };
      expect(payload.selectedTemplateIds).toEqual(['resend-plugin']);
      expect(payload.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'convex/api.ts',
            action: 'update',
          }),
        ])
      );
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('collectPluginScaffoldTemplates throws on duplicate template ids', () => {
    const descriptor = {
      key: 'test',
      packageName: '@better-convex/test',
      schemaRegistration: {
        importName: 'testExtension',
        path: 'schema.ts',
        target: 'lib',
      },
      defaultPreset: 'default',
      presets: [
        { key: 'default', description: 'default', templateIds: ['shared'] },
      ],
      templates: [
        {
          id: 'shared',
          path: 'a.ts',
          target: 'functions',
          content: 'one',
        },
        {
          id: 'shared',
          path: 'b.ts',
          target: 'functions',
          content: 'two',
        },
      ],
    } as any;

    expect(() => collectPluginScaffoldTemplates(descriptor)).toThrow(
      'Duplicate scaffold template id "shared" in plugin "test".'
    );
  });

  test('run(view) prompts for plugin in interactive TTY mode when plugin arg is omitted', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-view-interactive-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });

    fs.writeFileSync(
      path.join(convexDir, 'schema.ts'),
      `
      import { defineSchema } from "better-convex/orm";
      import { resendExtension } from "./lib/plugins/resend/schema";

      export default defineSchema({}).extend(resendExtension());
      `.trim()
    );
    fs.mkdirSync(path.join(convexDir, 'lib', 'plugins', 'resend'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(convexDir, 'lib', 'plugins', 'resend', 'schema.ts'),
      `
      import { defineSchemaExtension } from "better-convex/orm";

      export const resendExtension = defineSchemaExtension("resend", {});
      `.trim()
    );
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            resend: {
              package: '@better-convex/resend',
            },
          },
        },
        null,
        2
      )
    );
    fs.mkdirSync(path.join(convexDir, 'lib', 'plugins', 'resend'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(convexDir, 'lib', 'plugins', 'resend', 'plugin.ts'),
      '// stale\n'
    );

    process.chdir(dir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const selectPromptStub = mock(async () => 'resend');

      const exitCode = await run(['view'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
        promptAdapter: {
          isInteractive: () => true,
          confirm: async () => true,
          select: selectPromptStub as any,
          multiselect: async () => [],
        } as any,
      });

      expect(exitCode).toBe(0);
      expect(selectPromptStub).toHaveBeenCalled();
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('cli lockfile implementation no longer keeps legacy lockfile branches', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/better-convex/src/cli/cli.ts'),
      'utf8'
    );
    expect(source).not.toContain('_legacyUpdatedAt');
    expect(source).not.toContain('parsed as { installedPlugins');
    expect(source).not.toContain('const scaffoldsValue');
    expect(source).not.toContain('PLUGIN_LOCKFILE_VERSION');
  });

  test('run(info --json) reads schema extensions and lockfile without invoking convex cli', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-info-plugins-')
    );
    const oldCwd = process.cwd();
    const convexDir = path.join(dir, 'convex');
    fs.mkdirSync(convexDir, { recursive: true });
    fs.writeFileSync(
      path.join(convexDir, 'schema.ts'),
      `
      const OrmSchemaExtensions = Symbol.for("better-convex:OrmSchemaExtensions");
      const schema = {};
      Object.defineProperty(schema, OrmSchemaExtensions, {
        value: [
          { key: "ratelimit", schema: { tableNames: [], inject: (value) => value } },
          { key: "resend", schema: { tableNames: [], inject: (value) => value } },
        ],
        enumerable: false,
      });
      export default schema;
      `.trim()
    );
    fs.writeFileSync(
      path.join(convexDir, 'plugins.lock.json'),
      JSON.stringify(
        {
          plugins: {
            ratelimit: {
              package: 'better-convex',
            },
            resend: {
              package: '@better-convex/resend',
            },
          },
        },
        null,
        2
      )
    );

    process.chdir(dir);
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['info', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as {
        installedPlugins?: Array<{ plugin: string }>;
        schemaPlugins?: string[];
      };
      expect(payload.installedPlugins?.map((plugin) => plugin.plugin)).toEqual([
        'ratelimit',
        'resend',
      ]);
      expect(payload.schemaPlugins).toEqual(['ratelimit', 'resend']);
      expect(execaStub).not.toHaveBeenCalled();
      expect(generateMetaStub).not.toHaveBeenCalled();
    } finally {
      console.info = originalInfo;
      process.chdir(oldCwd);
    }
  });

  test('run(docs resend cli --json) returns local and public docs links', async () => {
    const infoLines: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoLines.push(args.map(String).join(' '));
    };

    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['docs', 'resend', 'cli', '--json'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const payload = JSON.parse(infoLines.at(-1) ?? '{}') as {
        topics?: Array<{
          topic: string;
          localPath: string;
          publicUrl?: string;
        }>;
      };
      expect(payload.topics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            topic: 'resend',
            localPath: 'www/content/docs/plugins/resend.mdx',
          }),
          expect.objectContaining({
            topic: 'cli',
            localPath: 'www/content/docs/cli.mdx',
          }),
        ])
      );
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(env sync) delegates to syncEnv and does not call convex', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['env', 'sync', '--auth', '--force', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(syncEnvStub).toHaveBeenCalledWith({
      auth: true,
      force: true,
      prod: true,
    });
    expect(execaStub).not.toHaveBeenCalled();
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(env get) passes through to convex env with filtered args and preserves exitCode', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 7 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['--debug', 'env', 'get', 'FOO', '--api', 'ignored'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(7);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'env', 'get', 'FOO'] },
    ]);
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(analyze) delegates to internal analyzer and does not invoke convex CLI', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const runAnalyzeStub = mock(async () => 5);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['analyze', '--details'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      runAnalyze: runAnalyzeStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(5);
    expect(runAnalyzeStub).toHaveBeenCalledWith(['--details']);
    expect(execaStub).not.toHaveBeenCalled();
    expect(loadConfigStub).not.toHaveBeenCalled();
  });

  test('run(deploy) executes post-deploy aggregate backfill with wait', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args[1] === 'run' && args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"running","runId":"mr_1"}\n',
          stderr: '',
        } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:migrationStatus')
      ) {
        return {
          exitCode: 0,
          stdout:
            '{"status":"idle","runs":[{"status":"completed","currentIndex":1,"migrationIds":["m1"]}]}\n',
          stderr: '',
        } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['deploy', '--debug', '--api', 'out', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(loadConfigStub).toHaveBeenCalledWith(undefined);
    expect(calls[0]).toEqual({
      cmd: 'node',
      args: ['/fake/convex/main.js', 'deploy', '--prod'],
    });
    expect(calls[1]?.args).toContain('generated/server:migrationRun');
    expect(calls[2]?.args).toContain('generated/server:migrationStatus');
    expect(calls[3]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[4]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(deploy) skips backfill commands when --backfill=off is passed', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      ['deploy', '--backfill=off', '--migrations=off', '--prod'],
      {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { cmd: 'node', args: ['/fake/convex/main.js', 'deploy', '--prod'] },
    ]);
  });

  test('run(migrate up) executes migration runtime with polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"running","runId":"mr_2"}\n',
          stderr: '',
        } as any;
      }
      if (args.includes('generated/server:migrationStatus')) {
        return {
          exitCode: 0,
          stdout:
            '{"status":"idle","runs":[{"status":"completed","currentIndex":1,"migrationIds":["m1"]}]}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['migrate', 'up', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:migrationRun');
    expect(calls[1]?.args).toContain('generated/server:migrationStatus');
  });

  test('run(migrate up) prints explicit noop message when nothing is pending', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args.includes('generated/server:migrationRun')) {
        return {
          exitCode: 0,
          stdout: '{"status":"noop"}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const infoMessages: string[] = [];
    const originalInfo = console.info;
    console.info = (...args: unknown[]) => {
      infoMessages.push(args.join(' '));
    };

    try {
      const exitCode = await run(['migrate', 'up', '--prod'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(calls.length).toBe(1);
      expect(calls[0]?.args).toContain('generated/server:migrationRun');
      expect(
        infoMessages.some((line) => line.includes('No pending migrations'))
      ).toBe(true);
    } finally {
      console.info = originalInfo;
    }
  });

  test('run(migrate create) scaffolds a migration file and manifest', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-cli-migration-create-')
    );
    const functionsDir = path.join(tmpDir, 'convex');
    fs.mkdirSync(functionsDir, { recursive: true });

    const oldCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const execaStub = mock(async () => ({ exitCode: 0 }) as any);
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());
      const getConvexConfigStub = mock(() => ({
        functionsDir,
        outputFile: path.join(functionsDir, 'shared', 'api.ts'),
      }));

      const exitCode = await run(['migrate', 'create', 'Add user field'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        getConvexConfig: getConvexConfigStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      const migrationsDir = path.join(functionsDir, 'migrations');
      const migrationFiles = fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith('.ts') && file !== 'manifest.ts');
      expect(migrationFiles.length).toBe(1);
      const migrationSource = fs.readFileSync(
        path.join(migrationsDir, migrationFiles[0]!),
        'utf8'
      );
      const manifestSource = fs.readFileSync(
        path.join(migrationsDir, 'manifest.ts'),
        'utf8'
      );
      expect(migrationSource).toContain('defineMigration');
      expect(migrationSource).toContain(
        "import { defineMigration } from '../generated/migrations.gen';"
      );
      expect(manifestSource).toContain('defineMigrationSet');
      expect(manifestSource).toContain(
        "import { defineMigrationSet } from 'better-convex/orm';"
      );
      expect(manifestSource).toContain(
        migrationFiles[0]!.replace(TS_EXTENSION_RE, '')
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('run(deploy) rejects removed --backfill-mode flag', async () => {
    const execaStub = mock(
      async (_cmd: string, _args: string[]) => ({ exitCode: 0 }) as any
    );
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['deploy', '--backfill-mode=rebuild'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
    );
  });

  test('run(deploy) fails in strict resume mode when kickoff reports needsRebuild', async () => {
    const calls: { cmd: string; args: string[] }[] = [];
    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return {
          exitCode: 0,
          stdout: '{"status":"ok","needsRebuild":1}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0, stdout: '', stderr: '' } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['deploy'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(1);
    expect(calls.length).toBe(3);
    expect(calls[0]?.args[1]).toBe('deploy');
    expect(calls[1]?.args).toContain('generated/server:migrationRun');
    expect(calls[2]?.args).toContain('generated/server:aggregateBackfill');
  });

  test('run(dev) rejects --scope and instructs using codegen --scope', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['--scope', 'orm'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--scope` is not supported for `better-convex dev`. Use `better-convex codegen --scope <all|auth|orm>` for scoped generation.'
    );

    expect(generateMetaStub).not.toHaveBeenCalled();
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(dev) rejects removed --backfill-mode flag', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['dev', '--backfill-mode=rebuild'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`--backfill-mode` was removed. Use `better-convex aggregate rebuild`.'
    );

    expect(generateMetaStub).not.toHaveBeenCalled();
    expect(execaStub).not.toHaveBeenCalled();
  });

  test('run(aggregate rebuild) executes rebuild backfill and status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'rebuild', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"rebuild"'
    );
    expect(calls[1]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(aggregate backfill) executes resume backfill and status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'backfill', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"resume"'
    );
    expect(calls[1]?.args).toContain(
      'generated/server:aggregateBackfillStatus'
    );
  });

  test('run(aggregate prune) executes prune without status polling', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return {
          exitCode: 0,
          stdout: '{"status":"ok","pruned":2}\n',
          stderr: '',
        } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(['aggregate', 'prune', '--prod'], {
      realConvex: '/fake/convex/main.js',
      execa: execaStub as any,
      generateMeta: generateMetaStub as any,
      syncEnv: syncEnvStub as any,
      loadBetterConvexConfig: loadConfigStub as any,
    });

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toContain('generated/server:aggregateBackfill');
    expect(calls[0]?.args[calls[0].args.length - 1]).toContain(
      '"mode":"prune"'
    );
  });

  test('run(reset) requires --yes confirmation', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['reset'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`better-convex reset` is destructive. Re-run with `--yes`.'
    );
  });

  test('run(reset) rejects backfill flags', async () => {
    const execaStub = mock(async () => ({ exitCode: 0 }) as any);
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    await expect(
      run(['reset', '--yes', '--backfill=off'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      })
    ).rejects.toThrow(
      '`better-convex reset` does not accept backfill flags. It always runs aggregateBackfill in resume mode.'
    );
  });

  test('run(reset) executes before hook, reset, resume backfill, status, then after hook', async () => {
    const calls: { cmd: string; args: string[] }[] = [];

    const execaStub = mock(async (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfillStatus')
      ) {
        return { exitCode: 0, stdout: '[]\n', stderr: '' } as any;
      }
      if (
        args[1] === 'run' &&
        args.includes('generated/server:aggregateBackfill')
      ) {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      if (args[1] === 'run') {
        return { exitCode: 0, stdout: '{"status":"ok"}\n', stderr: '' } as any;
      }
      return { exitCode: 0 } as any;
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    const exitCode = await run(
      [
        'reset',
        '--yes',
        '--before',
        'internal.app.resetHooks:before',
        '--after=internal.app.resetHooks:after',
        '--prod',
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
    const runCalls = calls.filter((entry) => entry.args[1] === 'run');
    const runFunctions = runCalls.map((entry) => entry.args.at(-2));
    expect(runFunctions).toEqual([
      'internal.app.resetHooks:before',
      'generated/server:reset',
      'generated/server:aggregateBackfill',
      'generated/server:aggregateBackfillStatus',
      'internal.app.resetHooks:after',
    ]);
    expect(runCalls[1]?.args[runCalls[1].args.length - 1]).toBe('{}');
    expect(runCalls[2]?.args[runCalls[2].args.length - 1]).toContain(
      '"mode":"resume"'
    );
  });

  test('run(dev) runs aggregateBackfill and waits via status polling by default', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];
    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);

    try {
      const watcherProcess: any = new Promise(() => {});
      watcherProcess.killed = false;
      watcherProcess.kill = mock((signal?: string) => {
        watcherProcess.killed = true;
        watcherProcess.lastSignal = signal;
      });

      const convexProcess: any = Promise.resolve({ exitCode: 0 });
      convexProcess.killed = false;
      convexProcess.kill = mock((signal?: string) => {
        convexProcess.killed = true;
        convexProcess.lastSignal = signal;
      });

      const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
        calls.push({ cmd, args, opts });
        if (cmd === 'bun') return watcherProcess;
        if (
          args[1] === 'run' &&
          args.includes('generated/server:aggregateBackfillStatus')
        ) {
          return Promise.resolve({ exitCode: 0, stdout: '[]\n', stderr: '' });
        }
        if (
          args[1] === 'run' &&
          args.includes('generated/server:aggregateBackfill')
        ) {
          return Promise.resolve({
            exitCode: 0,
            stdout: '{"status":"ok"}\n',
            stderr: '',
          });
        }
        return convexProcess;
      });

      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => createDefaultConfig());

      const exitCode = await run(['dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        calls.some(
          ({ args }) =>
            args[1] === 'run' &&
            args.includes('generated/server:aggregateBackfill')
        )
      ).toBe(true);
      expect(
        calls.some(
          ({ args }) =>
            args[1] === 'run' &&
            args.includes('generated/server:aggregateBackfillStatus')
        )
      ).toBe(true);
    } finally {
      onSpy.mockRestore();
    }
  });

  test('run(dev) uses scope-only codegen and merged convex args', async () => {
    const calls: { cmd: string; args: string[]; opts?: any }[] = [];

    const onSpy = spyOn(process, 'on').mockImplementation(() => process as any);
    try {
      const watcherProcess: any = new Promise(() => {});
      watcherProcess.killed = false;
      watcherProcess.kill = mock((signal?: string) => {
        watcherProcess.killed = true;
        watcherProcess.lastSignal = signal;
      });

      const convexProcess: any = Promise.resolve({ exitCode: 9 });
      convexProcess.killed = false;
      convexProcess.kill = mock((signal?: string) => {
        convexProcess.killed = true;
        convexProcess.lastSignal = signal;
      });

      const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
        calls.push({ cmd, args, opts });
        if (cmd === 'bun') return watcherProcess;
        return convexProcess;
      });
      const generateMetaStub = mock(async () => {});
      const syncEnvStub = mock(async () => {});
      const loadConfigStub = mock(() => ({
        ...createDefaultConfig(),
        dev: {
          debug: false,
          args: ['--team', 'cfg-team'],
          aggregateBackfill: {
            ...createDefaultConfig().dev.aggregateBackfill,
            enabled: 'off' as const,
          },
          migrations: {
            ...createDefaultConfig().dev.migrations,
            enabled: 'off' as const,
          },
        },
      }));

      const exitCode = await run(['--debug', '--api', 'out', 'dev', '--once'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadBetterConvexConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(9);
      expect(generateMetaStub).toHaveBeenCalledWith('out', {
        debug: true,
        scope: 'all',
        trimSegments: ['plugins'],
      });

      expect(calls.length).toBe(2);
      expect(calls[0].cmd).toBe('bun');
      expect(Array.isArray(calls[0].args)).toBe(true);
      expect((calls[0].args[0] as string).endsWith('/watcher.ts')).toBe(true);
      expect(calls[0].opts?.env?.BETTER_CONVEX_API_OUTPUT_DIR).toBe('out');
      expect(calls[0].opts?.env?.BETTER_CONVEX_DEBUG).toBe('1');
      expect(calls[0].opts?.env?.BETTER_CONVEX_CODEGEN_SCOPE).toBe('all');
      expect(calls[0].opts?.env?.BETTER_CONVEX_CODEGEN_TRIM_SEGMENTS).toBe(
        '["plugins"]'
      );

      expect(calls[1]).toEqual({
        cmd: 'node',
        args: ['/fake/convex/main.js', 'dev', '--team', 'cfg-team', '--once'],
        opts: {
          stdio: 'inherit',
          cwd: process.cwd(),
          reject: false,
        },
      });

      expect(watcherProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(convexProcess.kill).toHaveBeenCalledWith('SIGTERM');
    } finally {
      onSpy.mockRestore();
    }
  });
});
