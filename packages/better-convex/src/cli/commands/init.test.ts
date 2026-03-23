import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createDefaultConfig,
  writePackageJson,
  writeShadcnNextApp,
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

describe('cli/commands/init', () => {
  test('parseInitCommandArgs supports template, cwd, name, defaults, yes, json, and Convex target args', () => {
    expect(
      parseInitCommandArgs([
        '--template',
        'next',
        '--cwd',
        'apps',
        '--name',
        'web',
        '--defaults',
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
      template: 'next',
      cwd: 'apps',
      name: 'web',
      targetArgs: ['--env-file', '.env.agent', '--prod'],
    });
  });

  test('parseInitCommandArgs rejects removed bootstrap flags', () => {
    expect(() => parseInitCommandArgs(['--team', 'acme'])).toThrow(
      'Removed `better-convex init` bootstrap flags. Use `convex init` for deployment setup.'
    );
  });

  test('resolveSupportedInitTemplate allows next and vite', () => {
    expect(resolveSupportedInitTemplate('next')).toBe('next');
    expect(resolveSupportedInitTemplate('vite')).toBe('vite');
    expect(resolveSupportedInitTemplate(undefined)).toBeUndefined();
    expect(() => resolveSupportedInitTemplate('nope')).toThrow(
      'Unsupported init template "nope". Expected one of: next, vite.'
    );
  });

  test('detectProjectFramework maps concrete frameworks to scaffold modes', () => {
    const nextDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-detect-next-')
    );
    writeShadcnNextApp(nextDir);

    const viteDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-detect-vite-')
    );
    writeShadcnViteApp(viteDir);

    const reactRouterDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-detect-react-router-')
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
      path.join(os.tmpdir(), 'better-convex-init-detect-tanstack-')
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
        loadBetterConvexConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(INIT_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleInitCommand scaffolds the next baseline with -t next', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-create-command-next-')
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
      expect(
        execaStub.mock.calls.some((call) => {
          const [, args] = call as unknown as [string, string[]];
          return args[0] === '/fake/convex/main.js' && args[1] === 'init';
        })
      ).toBe(true);
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

  test('handleInitCommand scaffolds the vite baseline with -t vite', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-create-command-vite-')
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
        writeShadcnViteApp(path.join(baseDir, projectName));
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
          loadBetterConvexConfig: loadConfigStub as any,
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
      path.join(os.tmpdir(), 'better-convex-init-command-existing-next-')
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
      '{ "compilerOptions": { "strict": true } }\n'
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
        loadBetterConvexConfig: loadConfigStub as any,
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
      ).toBe('{ "compilerOptions": { "strict": true } }\n');
      expect(fs.existsSync(path.join(tmpDir, 'convex.json'))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, 'convex', 'lib', 'crpc.ts'))).toBe(
        true
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand auto-detects vite apps and scaffolds react mode', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-detect-vite-')
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
        loadBetterConvexConfig: loadConfigStub as any,
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

  test('handleInitCommand fails in an empty dir without a template', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-empty-dir-')
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
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Could not detect a supported app scaffold. Use `better-convex init -t <next|vite>` for a fresh app.'
      );
      expect(execaStub).not.toHaveBeenCalled();
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand rejects template mode when the target already has a supported scaffold', async () => {
    const nextDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-create-command-existing-next-')
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
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow(
        'Existing supported app scaffold detected. Run `better-convex init --yes` in . to adopt the current project.'
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails when both root and src app layouts exist', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-init-command-ambiguous-roots-')
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
          loadBetterConvexConfig: loadConfigStub as any,
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
      path.join(os.tmpdir(), 'better-convex-init-command-concave-')
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
          loadBetterConvexConfig: loadConfigStub as any,
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
        JSON.parse(fs.readFileSync(path.join(tmpDir, 'concave.json'), 'utf8'))
      ).toMatchObject({
        meta: {
          'better-convex': {
            backend: 'concave',
          },
        },
      });
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand uses concave static codegen for fresh template init', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-create-command-concave-template-')
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
          loadBetterConvexConfig: loadConfigStub as any,
        })
      ).rejects.toThrow('backend=concave could not find Concave CLI');
    } finally {
      process.chdir(originalCwd);
    }
  });

  test('handleInitCommand fails when template codegen cannot be produced', async () => {
    const tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-create-command-template-fail-')
    );
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      if (args.includes(INIT_SHADCN_PACKAGE_SPEC)) {
        writeShadcnNextApp(tmpDir);
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
