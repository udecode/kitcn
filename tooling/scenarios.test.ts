import { describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  BETTER_CONVEX_INSTALL_SPEC_ENV,
  BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV,
} from '../packages/better-convex/src/cli/supported-dependencies';
import {
  buildLocalCliCommand,
  patchPreparedLocalDevPort,
} from './scaffold-utils';
import {
  DEFAULT_CHECK_SCENARIO_KEYS,
  FULL_CONVEX_SCENARIO_KEYS,
  SCENARIO_DEFINITIONS,
} from './scenario.config';
import {
  checkScenarios,
  parseScenarioArgs,
  resolvePrepareBootstrapSteps,
  resolveScenarioKeysForCheck,
  resolveScenarioProofPath,
  resolveScenarioStepEnv,
  runScenarioDev,
  runScenarioTest,
} from './scenarios';

describe('tooling/scenarios', () => {
  test('parseScenarioArgs supports the scenario command surface', () => {
    expect(parseScenarioArgs(['prepare', 'all'])).toEqual({
      mode: 'prepare',
      target: 'all',
    });

    expect(parseScenarioArgs(['test', 'next-auth'])).toEqual({
      mode: 'test',
      target: 'next-auth',
    });

    expect(parseScenarioArgs(['dev', 'next-auth'])).toEqual({
      mode: 'dev',
      target: 'next-auth',
    });

    expect(() => parseScenarioArgs(['check', 'nope'])).toThrow(
      'Unknown scenario target "nope".'
    );
  });

  test('resolveScenarioProofPath matches the scenarios skill matrix', () => {
    expect(resolveScenarioProofPath('next')).toBe('runtime');
    expect(resolveScenarioProofPath('create-convex-bare')).toBe('runtime');
    expect(resolveScenarioProofPath('next-auth')).toBe('auth-demo');
    expect(resolveScenarioProofPath('vite-auth')).toBe('auth-runtime');
    expect(resolveScenarioProofPath('convex-next-all')).toBe('check');
    expect(resolveScenarioProofPath('create-convex-nextjs-shadcn-auth')).toBe(
      'check'
    );
  });

  test('runScenarioTest uses check for bootstrap-heavy convex scenarios', async () => {
    const calls: string[] = [];

    await runScenarioTest('convex-next-all', {
      checkScenarioFn: mock(async () => {
        calls.push('check');
      }) as never,
      prepareScenarioFn: mock(async () => {
        calls.push('prepare');
      }) as never,
      runScenarioRuntimeProofFn: mock(async () => {
        calls.push('runtime');
      }) as never,
      runAuthSmokeFn: mock(async () => {
        calls.push('auth');
      }) as never,
      runAuthE2EFn: mock(async () => {
        calls.push('e2e');
      }) as never,
    });

    expect(calls).toEqual(['check']);
  });

  test('runScenarioTest runs auth smoke and e2e for next-auth', async () => {
    const calls: string[] = [];

    await runScenarioTest('next-auth', {
      checkScenarioFn: mock(async () => {
        calls.push('check');
      }) as never,
      prepareScenarioFn: mock(async () => {
        calls.push('prepare');
      }) as never,
      runScenarioRuntimeProofFn: mock(async (_scenarioKey, params) => {
        calls.push('runtime');
        await params.afterReadyFn?.('next-auth');
      }) as never,
      runAuthSmokeFn: mock(async () => {
        calls.push('auth');
      }) as never,
      runAuthE2EFn: mock(async () => {
        calls.push('e2e');
      }) as never,
    });

    expect(calls).toEqual(['prepare', 'runtime', 'auth', 'e2e']);
  });

  test('runScenarioTest skips browser auth for vite-auth', async () => {
    const calls: string[] = [];

    await runScenarioTest('vite-auth', {
      checkScenarioFn: mock(async () => {
        calls.push('check');
      }) as never,
      prepareScenarioFn: mock(async () => {
        calls.push('prepare');
      }) as never,
      runScenarioRuntimeProofFn: mock(async () => {
        calls.push('runtime');
      }) as never,
      runAuthSmokeFn: mock(async () => {
        calls.push('auth');
      }) as never,
      runAuthE2EFn: mock(async () => {
        calls.push('e2e');
      }) as never,
    });

    expect(calls).toEqual(['prepare', 'runtime']);
  });

  test('resolveScenarioKeysForCheck keeps CI checks scoped to non-committed scenarios', () => {
    expect(DEFAULT_CHECK_SCENARIO_KEYS).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'create-convex-bare',
      'create-convex-nextjs-shadcn',
      'create-convex-react-vite-shadcn',
    ]);
    expect(resolveScenarioKeysForCheck()).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'create-convex-bare',
      'create-convex-nextjs-shadcn',
      'create-convex-react-vite-shadcn',
    ]);
  });

  test('checkScenarios validates the CI scenario subset by default', async () => {
    const callOrder: string[] = [];

    await checkScenarios({
      checkScenarioFn: mock(async (scenarioKey) => {
        callOrder.push(scenarioKey);
      }) as typeof checkScenarios extends (params?: infer T) => Promise<unknown>
        ? NonNullable<T extends { checkScenarioFn?: infer U } ? U : never>
        : never,
    });

    expect(callOrder).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'create-convex-bare',
      'create-convex-nextjs-shadcn',
      'create-convex-react-vite-shadcn',
    ]);
  });

  test('resolveScenarioStepEnv keeps local package overrides on better-convex steps only', () => {
    expect(
      resolveScenarioStepEnv(['add', 'resend', '--yes'], {
        betterConvexInstallSpec: 'file:/tmp/better-convex.tgz',
        resendInstallSpec: 'file:/tmp/better-convex-resend.tgz',
      })
    ).toEqual({
      [BETTER_CONVEX_INSTALL_SPEC_ENV]: 'file:/tmp/better-convex.tgz',
      [BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV]:
        'file:/tmp/better-convex-resend.tgz',
    });

    expect(
      resolveScenarioStepEnv(['better-convex', 'dev', '--once'], {
        betterConvexInstallSpec: 'file:/tmp/better-convex.tgz',
        resendInstallSpec: 'file:/tmp/better-convex-resend.tgz',
      })
    ).toEqual({
      [BETTER_CONVEX_INSTALL_SPEC_ENV]: 'file:/tmp/better-convex.tgz',
      [BETTER_CONVEX_RESEND_INSTALL_SPEC_ENV]:
        'file:/tmp/better-convex-resend.tgz',
    });

    expect(
      resolveScenarioStepEnv(['convex', 'init'], {
        betterConvexInstallSpec: 'file:/tmp/better-convex.tgz',
        resendInstallSpec: 'file:/tmp/better-convex-resend.tgz',
      })
    ).toBeUndefined();
  });

  test('resolvePrepareBootstrapSteps backfills auth env for auth template scenarios', async () => {
    const rootDir = `/tmp/better-convex-scenario-prepare-auth-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const authProjectDir = `${rootDir}/auth-project`;
    const plainProjectDir = `${rootDir}/plain-project`;

    await Bun.write(
      `${authProjectDir}/convex/functions/plugins.lock.json`,
      JSON.stringify({
        plugins: {
          auth: {
            package: 'better-auth',
            files: {
              'auth-runtime': 'convex/functions/auth.ts',
            },
          },
        },
      })
    );
    await Bun.write(
      `${plainProjectDir}/convex/functions/plugins.lock.json`,
      JSON.stringify({
        plugins: {},
      })
    );
    await Bun.write(
      `${plainProjectDir}/convex/.env`,
      'SITE_URL=http://localhost:3005\n'
    );

    try {
      expect(resolvePrepareBootstrapSteps('next-auth', authProjectDir)).toEqual(
        [['add', 'auth', '--overwrite', '--yes', '--no-codegen']]
      );
      expect(resolvePrepareBootstrapSteps('next', plainProjectDir)).toEqual([]);
      expect(
        resolvePrepareBootstrapSteps('vite-auth', plainProjectDir)
      ).toEqual([]);
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }
  });

  test('scenario registry skips lint for slow adoption checks', () => {
    expect(SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].backend).toBe(
      'convex'
    );
    expect(
      SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].env?.CONVEX_AGENT_MODE
    ).toBe('anonymous');
    expect(
      SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].validation.beforeCheck
    ).toEqual([
      ['convex', 'init'],
      ['better-convex', 'dev', '--once', '--typecheck', 'disable'],
      ['better-convex', 'env', 'push', '--auth'],
    ]);
    expect(SCENARIO_DEFINITIONS['convex-vite-auth-bootstrap']).toMatchObject({
      backend: 'convex',
      check: true,
    });
    expect(FULL_CONVEX_SCENARIO_KEYS).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'convex-next-all',
      'create-convex-nextjs-shadcn-auth',
    ]);
    expect(SCENARIO_DEFINITIONS['convex-next-all']).toMatchObject({
      backend: 'convex',
      check: true,
      env: {
        CONVEX_AGENT_MODE: 'anonymous',
      },
      label: 'convex next all',
      setup: [
        ['add', 'ratelimit', '--yes', '--no-codegen'],
        ['add', 'auth', '--yes', '--no-codegen'],
        ['add', 'resend', '--yes', '--no-codegen'],
      ],
      validation: {
        beforeCheck: [
          ['convex', 'init'],
          ['better-convex', 'dev', '--once', '--typecheck', 'disable'],
          ['better-convex', 'env', 'push', '--auth'],
        ],
        lint: true,
      },
    });
    expect(SCENARIO_DEFINITIONS['create-convex-nextjs-shadcn-auth']).toEqual({
      backend: 'convex',
      check: false,
      env: {
        CONVEX_AGENT_MODE: 'anonymous',
      },
      label: 'create-convex nextjs-shadcn auth adoption',
      setup: [],
      source: {
        kind: 'fixture',
        fixture: 'create-convex-nextjs-shadcn',
      },
      validation: {
        beforeCheck: [
          ['convex', 'init'],
          ['better-convex', 'add', 'auth', '--preset', 'convex', '--yes'],
        ],
        lint: false,
      },
    });
    expect(SCENARIO_DEFINITIONS['create-convex-bare'].validation.lint).toBe(
      false
    );
    expect(SCENARIO_DEFINITIONS['create-convex-bare'].setup).toEqual([]);
    expect(
      SCENARIO_DEFINITIONS['create-convex-nextjs-shadcn'].validation.lint
    ).toBe(false);
    expect(SCENARIO_DEFINITIONS['create-convex-nextjs-shadcn'].setup).toEqual([
      ['init', '--yes'],
    ]);
    expect(
      SCENARIO_DEFINITIONS['create-convex-react-vite-shadcn'].validation.lint
    ).toBe(false);
    expect(
      SCENARIO_DEFINITIONS['create-convex-react-vite-shadcn'].setup
    ).toEqual([['init', '--yes']]);
  });

  test('patchPreparedLocalDevPort rewrites local temp apps to port 3005', async () => {
    const rootDir = `/tmp/better-convex-scenario-port-patch-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const nextDir = `${rootDir}/next`;
    const viteDir = `${rootDir}/vite`;

    await Bun.write(
      `${nextDir}/package.json`,
      JSON.stringify({
        name: 'next-app',
        private: true,
        scripts: {
          dev: 'next dev --turbopack',
          'dev:frontend': 'next dev --turbopack',
        },
      })
    );
    await Bun.write(
      `${nextDir}/.env.local`,
      'NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210\nNEXT_PUBLIC_SITE_URL=http://localhost:3000\n'
    );
    await Bun.write(
      `${nextDir}/convex/.env`,
      'SITE_URL=http://localhost:3000\n'
    );

    await Bun.write(
      `${viteDir}/package.json`,
      JSON.stringify({
        name: 'vite-app',
        private: true,
        scripts: {
          dev: 'vite',
          'dev:frontend': 'vite --open',
        },
      })
    );
    await Bun.write(
      `${viteDir}/.env.local`,
      'VITE_CONVEX_URL=http://127.0.0.1:3210\nVITE_SITE_URL=http://localhost:3000\n'
    );

    try {
      patchPreparedLocalDevPort(nextDir);
      patchPreparedLocalDevPort(viteDir);

      const nextPackageJson = JSON.parse(
        fs.readFileSync(`${nextDir}/package.json`, 'utf8')
      ) as { scripts?: Record<string, string> };
      const vitePackageJson = JSON.parse(
        fs.readFileSync(`${viteDir}/package.json`, 'utf8')
      ) as { scripts?: Record<string, string> };

      expect(nextPackageJson.scripts?.dev).toBe(
        'next dev --turbopack --port 3005'
      );
      expect(nextPackageJson.scripts?.['dev:frontend']).toBe(
        'next dev --turbopack --port 3005'
      );
      expect(vitePackageJson.scripts?.dev).toBe('vite --port 3005');
      expect(vitePackageJson.scripts?.['dev:frontend']).toBe(
        'vite --open --port 3005'
      );
      expect(fs.readFileSync(`${nextDir}/.env.local`, 'utf8')).toContain(
        'NEXT_PUBLIC_SITE_URL=http://localhost:3005'
      );
      expect(fs.readFileSync(`${viteDir}/.env.local`, 'utf8')).toContain(
        'VITE_SITE_URL=http://localhost:3005'
      );
      expect(fs.readFileSync(`${nextDir}/convex/.env`, 'utf8')).toContain(
        'SITE_URL=http://localhost:3005'
      );
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }
  });

  test('runScenarioDev reuses an existing prepared project and runs its dev script', async () => {
    const outputRoot = Bun.file(
      `/tmp/better-convex-scenario-dev-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const rootDir = outputRoot.name;
    const projectDir = `${rootDir}/next-auth/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'next-auth-dev',
        private: true,
        scripts: {
          dev: 'next dev',
        },
      })
    );

    const calls: Array<{
      cmd: string[];
      cwd: string;
      options?: Parameters<typeof runScenarioDev>[1];
    }> = [];
    const runCommand = mock(
      async (cmd: string[], cwd: string, options?: Record<string, unknown>) => {
        calls.push({ cmd, cwd, options: options as never });
        return 0;
      }
    );

    try {
      await runScenarioDev('next-auth', {
        outputRoot: rootDir,
        runCommand: runCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      cmd: ['bun', 'run', 'dev'],
      cwd: projectDir,
    });
  });

  test('runScenarioDev starts convex and frontend together when dev is frontend-only', async () => {
    const outputRoot = Bun.file(
      `/tmp/better-convex-scenario-dual-dev-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`
    );
    const rootDir = outputRoot.name;
    const projectDir = `${rootDir}/next-auth/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'next-auth-dev',
        private: true,
        scripts: {
          dev: 'next dev --turbopack --port 3005',
          'convex:dev': 'better-convex dev',
        },
      })
    );

    const commands: Array<{ cmd: string[]; cwd: string }> = [];
    const kills: Array<{ signal?: string }> = [];
    let resolveConvexExit: ((code: number) => void) | undefined;
    const spawnCommand = mock(
      (_scenarioKey: string, cmd: string[], cwd: string) => {
        commands.push({ cmd, cwd });
        if (cmd[2] === 'convex:dev') {
          return {
            exited: new Promise<number>((resolve) => {
              resolveConvexExit = resolve;
            }),
            kill: (signal?: string) => {
              kills.push({ signal });
              resolveConvexExit?.(0);
            },
            killed: false,
          };
        }

        return {
          exited: Promise.resolve(0),
          kill: (signal?: string) => {
            kills.push({ signal });
          },
          killed: false,
        };
      }
    );

    try {
      await runScenarioDev('next-auth', {
        outputRoot: rootDir,
        spawnCommand: spawnCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(commands).toEqual([
      {
        cmd: ['bun', 'run', 'convex:dev'],
        cwd: projectDir,
      },
      {
        cmd: ['bun', 'run', 'dev'],
        cwd: projectDir,
      },
    ]);
    expect(kills).toEqual([{ signal: 'SIGTERM' }]);
  });

  test('runScenarioDev fails clearly when the scenario has not been prepared yet', async () => {
    const rootDir = `/tmp/better-convex-scenario-missing-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    try {
      await expect(
        runScenarioDev('next-auth', {
          outputRoot: rootDir,
        })
      ).rejects.toThrow(
        'Scenario "next-auth" is not prepared. Run `bun run scenario:prepare -- next-auth` or `bun run scenario:check -- next-auth` first.'
      );
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }
  });

  test('runScenarioDev injects anonymous agent mode for raw create-convex fixtures and bypasses upstream raw dev for bare apps', async () => {
    const rootDir = `/tmp/better-convex-scenario-create-convex-dev-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const projectDir = `${rootDir}/create-convex-bare/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'create-convex-bare-dev',
        private: true,
        scripts: {
          dev: 'convex dev',
        },
      })
    );

    const calls: Array<{
      cmd: string[];
      cwd: string;
      options?: Record<string, unknown>;
    }> = [];
    const runCommand = mock(
      async (cmd: string[], cwd: string, options?: Record<string, unknown>) => {
        calls.push({ cmd, cwd, options });
        return 0;
      }
    );

    try {
      await runScenarioDev('create-convex-bare', {
        outputRoot: rootDir,
        runCommand: runCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      cmd: buildLocalCliCommand(['dev'], { backend: 'concave' }),
      cwd: projectDir,
      options: {
        env: expect.objectContaining({
          CONVEX_AGENT_MODE: 'anonymous',
        }),
      },
    });
  });

  test('runScenarioDev bypasses raw create-convex predev and uses dev:frontend plus convex:dev when available', async () => {
    const rootDir = `/tmp/better-convex-scenario-create-convex-next-dev-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const projectDir = `${rootDir}/create-convex-nextjs-shadcn/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'create-convex-nextjs-shadcn-dev',
        private: true,
        scripts: {
          dev: 'next dev --turbopack --port 3005',
          'dev:frontend': 'next dev --turbopack --port 3005',
          'dev:backend': 'convex dev',
          predev: 'convex dev --until-success && convex dashboard',
          'convex:dev': 'better-convex dev',
        },
      })
    );

    const commands: Array<{ cmd: string[]; cwd: string }> = [];
    const kills: Array<{ signal?: string }> = [];
    let resolveConvexExit: ((code: number) => void) | undefined;
    const spawnCommand = mock(
      (_scenarioKey: string, cmd: string[], cwd: string) => {
        commands.push({ cmd, cwd });
        if (cmd[2] === 'convex:dev') {
          return {
            exited: new Promise<number>((resolve) => {
              resolveConvexExit = resolve;
            }),
            kill: (signal?: string) => {
              kills.push({ signal });
              resolveConvexExit?.(0);
            },
            killed: false,
          };
        }

        return {
          exited: Promise.resolve(0),
          kill: (signal?: string) => {
            kills.push({ signal });
          },
          killed: false,
        };
      }
    );

    try {
      await runScenarioDev('create-convex-nextjs-shadcn', {
        outputRoot: rootDir,
        spawnCommand: spawnCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(commands).toEqual([
      {
        cmd: ['bun', 'run', 'convex:dev'],
        cwd: projectDir,
      },
      {
        cmd: ['bun', 'run', 'dev:frontend'],
        cwd: projectDir,
      },
    ]);
    expect(kills).toEqual([{ signal: 'SIGTERM' }]);
  });

  test('runScenarioDev runs Vite scenarios on the prepared frontend port by splitting backend and frontend ownership', async () => {
    const rootDir = `/tmp/better-convex-scenario-vite-single-dev-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const projectDir = `${rootDir}/vite-auth/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'vite-auth-dev',
        private: true,
        scripts: {
          dev: 'vite --port 3005',
          'convex:dev': 'better-convex dev',
        },
      })
    );
    await Bun.write(`${projectDir}/vite.config.ts`, 'export default {};\n');

    const commands: Array<{ cmd: string[]; cwd: string }> = [];
    const kills: Array<{ signal?: string }> = [];
    let resolveBackendExit: ((code: number) => void) | undefined;
    const spawnCommand = mock(
      (_scenarioKey: string, cmd: string[], cwd: string) => {
        commands.push({ cmd, cwd });
        if (cmd[2] === 'convex:dev') {
          return {
            exited: new Promise<number>((resolve) => {
              resolveBackendExit = resolve;
            }),
            kill: (signal?: string) => {
              kills.push({ signal });
              resolveBackendExit?.(0);
            },
            killed: false,
          };
        }

        return {
          exited: Promise.resolve(0),
          kill: (signal?: string) => {
            kills.push({ signal });
          },
          killed: false,
        };
      }
    );

    try {
      await runScenarioDev('vite-auth', {
        outputRoot: rootDir,
        spawnCommand: spawnCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(commands).toEqual([
      {
        cmd: ['bun', 'run', 'convex:dev', '--', '--frontend', 'no'],
        cwd: projectDir,
      },
      {
        cmd: ['bun', 'run', 'dev'],
        cwd: projectDir,
      },
    ]);
    expect(kills).toEqual([{ signal: 'SIGTERM' }]);
  });

  test('runScenarioDev splits raw create-convex Vite fixtures so better-convex owns only the backend', async () => {
    const rootDir = `/tmp/better-convex-scenario-create-convex-vite-dev-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const projectDir = `${rootDir}/create-convex-react-vite-shadcn/project`;
    await Bun.write(
      `${projectDir}/package.json`,
      JSON.stringify({
        name: 'create-convex-react-vite-shadcn-dev',
        private: true,
        scripts: {
          dev: 'npm-run-all --parallel dev:frontend dev:backend',
          'dev:frontend': 'vite --open --port 3005',
          'dev:backend': 'convex dev',
          'convex:dev': 'better-convex dev',
        },
      })
    );
    await Bun.write(`${projectDir}/vite.config.ts`, 'export default {};\n');

    const commands: Array<{ cmd: string[]; cwd: string }> = [];
    const kills: Array<{ signal?: string }> = [];
    let resolveBackendExit: ((code: number) => void) | undefined;
    const spawnCommand = mock(
      (_scenarioKey: string, cmd: string[], cwd: string) => {
        commands.push({ cmd, cwd });
        if (cmd[2] === 'convex:dev') {
          return {
            exited: new Promise<number>((resolve) => {
              resolveBackendExit = resolve;
            }),
            kill: (signal?: string) => {
              kills.push({ signal });
              resolveBackendExit?.(0);
            },
            killed: false,
          };
        }

        return {
          exited: Promise.resolve(0),
          kill: (signal?: string) => {
            kills.push({ signal });
          },
          killed: false,
        };
      }
    );

    try {
      await runScenarioDev('create-convex-react-vite-shadcn', {
        outputRoot: rootDir,
        spawnCommand: spawnCommand as never,
      });
    } finally {
      await Bun.$`rm -rf ${rootDir}`.quiet();
    }

    expect(commands).toEqual([
      {
        cmd: ['bun', 'run', 'convex:dev', '--', '--frontend', 'no'],
        cwd: projectDir,
      },
      {
        cmd: ['bun', 'run', 'dev:frontend'],
        cwd: projectDir,
      },
    ]);
    expect(kills).toEqual([{ signal: 'SIGTERM' }]);
  });
});
