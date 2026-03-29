import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig } from '../test-utils';
import { handleVerifyCommand, VERIFY_HELP_TEXT } from './verify';

function createPendingProcess() {
  const processPromise: any = new Promise<{ exitCode: number }>(() => {});
  processPromise.killed = false;
  processPromise.kill = mock((signal?: string) => {
    processPromise.killed = true;
    processPromise.lastSignal = signal;
  });
  return processPromise;
}

function createResolvedProcess(exitCode = 0) {
  const processPromise: any = Promise.resolve({ exitCode });
  processPromise.killed = false;
  processPromise.kill = mock((signal?: string) => {
    processPromise.killed = true;
    processPromise.lastSignal = signal;
  });
  return processPromise;
}

describe('cli/commands/verify', () => {
  test('handleVerifyCommand(--help) prints verify help', async () => {
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
      const exitCode = await handleVerifyCommand(['verify', '--help'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });
      expect(exitCode).toBe(0);
      expect(infoLines.join('\n')).toContain(VERIFY_HELP_TEXT);
    } finally {
      console.info = originalInfo;
    }
  });

  test('handleVerifyCommand rejects remote deployment targets', async () => {
    await expect(
      handleVerifyCommand(['verify', '--prod'], {
        loadCliConfig: (() => createDefaultConfig()) as any,
      } as any)
    ).rejects.toThrow(
      '`kitcn verify` is local-only. Remove remote deployment flags like `--prod`, `--preview-name`, and `--deployment-name`.'
    );
  });

  test('handleVerifyCommand rejects backend concave', async () => {
    await expect(
      handleVerifyCommand(['verify', '--backend', 'concave'], {
        loadCliConfig: (() => ({
          ...createDefaultConfig(),
          backend: 'concave' as const,
        })) as any,
      } as any)
    ).rejects.toThrow('`kitcn verify` is only supported for backend convex.');
  });

  test('handleVerifyCommand injects anonymous agent mode and restores local state when no configured local deployment exists', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-verify-command-local-')
    );
    const oldCwd = process.cwd();
    const originalAgentMode = process.env.CONVEX_AGENT_MODE;
    fs.mkdirSync(path.join(dir, '.convex'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.convex', 'original.txt'), 'keep-me\n');

    const watcherProcess = createPendingProcess();
    const execaCalls: Array<{
      cmd: string;
      args: string[];
      opts?: Record<string, unknown>;
    }> = [];
    const convexProcess = createResolvedProcess(0);
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      execaCalls.push({ cmd, args, opts });
      if (cmd === 'bun') {
        return watcherProcess;
      }
      if (args[1] === 'init') {
        expect(opts?.env?.CONVEX_AGENT_MODE).toBe('anonymous');
        expect(fs.existsSync(path.join(dir, '.convex', 'original.txt'))).toBe(
          false
        );
        fs.mkdirSync(path.join(dir, '.convex'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.convex', 'verify.txt'), 'temp\n');
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (args[1] === 'dev') {
        expect(args).toContain('--once');
        expect(opts?.env?.CONVEX_AGENT_MODE).toBe('anonymous');
        return convexProcess;
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });
    const generateMetaStub = mock(async () => {});
    const syncEnvStub = mock(async () => {});
    const loadConfigStub = mock(() => createDefaultConfig());

    process.chdir(dir);
    process.env.CONVEX_AGENT_MODE = undefined;

    try {
      const exitCode = await handleVerifyCommand(['verify'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: generateMetaStub as any,
        syncEnv: syncEnvStub as any,
        loadCliConfig: loadConfigStub as any,
      });

      expect(exitCode).toBe(0);
      expect(
        fs.readFileSync(path.join(dir, '.convex', 'original.txt'), 'utf8')
      ).toBe('keep-me\n');
      expect(fs.existsSync(path.join(dir, '.convex', 'verify.txt'))).toBe(
        false
      );
      expect(
        execaCalls.some(
          (call) =>
            call.args[0] === '/fake/convex/main.js' &&
            call.args[1] === 'dev' &&
            call.args.includes('--once')
        )
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
      if (originalAgentMode === undefined) {
        process.env.CONVEX_AGENT_MODE = undefined;
      } else {
        process.env.CONVEX_AGENT_MODE = originalAgentMode;
      }
    }
  });

  test('handleVerifyCommand reuses an existing local deployment without anonymous mode or state isolation', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-verify-command-configured-local-')
    );
    const oldCwd = process.cwd();
    const originalAgentMode = process.env.CONVEX_AGENT_MODE;
    fs.mkdirSync(path.join(dir, '.convex', 'local', 'default'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.convex', 'local', 'default', 'config.json'),
      '{"deploymentName":"existing-local"}\n'
    );
    fs.writeFileSync(path.join(dir, '.convex', 'original.txt'), 'keep-me\n');

    const watcherProcess = createPendingProcess();
    const convexProcess = createResolvedProcess(0);
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      if (cmd === 'bun') {
        return watcherProcess;
      }
      if (args[1] === 'init' || args[1] === 'dev') {
        expect(opts?.env?.CONVEX_AGENT_MODE).toBeUndefined();
        expect(fs.existsSync(path.join(dir, '.convex', 'original.txt'))).toBe(
          true
        );
      }
      if (args[1] === 'dev') {
        return convexProcess;
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    process.chdir(dir);
    process.env.CONVEX_AGENT_MODE = undefined;

    try {
      const exitCode = await handleVerifyCommand(['verify'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: mock(async () => {}) as any,
        syncEnv: mock(async () => {}) as any,
        loadCliConfig: (() => createDefaultConfig()) as any,
      });
      expect(exitCode).toBe(0);
      expect(
        fs.readFileSync(path.join(dir, '.convex', 'original.txt'), 'utf8')
      ).toBe('keep-me\n');
    } finally {
      process.chdir(oldCwd);
      if (originalAgentMode === undefined) {
        process.env.CONVEX_AGENT_MODE = undefined;
      } else {
        process.env.CONVEX_AGENT_MODE = originalAgentMode;
      }
    }
  });

  test('handleVerifyCommand preserves explicit CONVEX_AGENT_MODE', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'kitcn-verify-command-agent-mode-')
    );
    const oldCwd = process.cwd();
    const originalAgentMode = process.env.CONVEX_AGENT_MODE;
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });

    const watcherProcess = createPendingProcess();
    const convexProcess = createResolvedProcess(0);
    const execaStub = mock((cmd: string, args: string[], opts?: any): any => {
      if (cmd === 'bun') {
        return watcherProcess;
      }
      if (args[1] === 'init' || args[1] === 'dev') {
        expect(opts?.env?.CONVEX_AGENT_MODE).toBe('custom-mode');
      }
      if (args[1] === 'dev') {
        return convexProcess;
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    });

    process.chdir(dir);
    process.env.CONVEX_AGENT_MODE = 'custom-mode';

    try {
      const exitCode = await handleVerifyCommand(['verify'], {
        realConvex: '/fake/convex/main.js',
        execa: execaStub as any,
        generateMeta: mock(async () => {}) as any,
        syncEnv: mock(async () => {}) as any,
        loadCliConfig: (() => createDefaultConfig()) as any,
      });
      expect(exitCode).toBe(0);
    } finally {
      process.chdir(oldCwd);
      if (originalAgentMode === undefined) {
        process.env.CONVEX_AGENT_MODE = undefined;
      } else {
        process.env.CONVEX_AGENT_MODE = originalAgentMode;
      }
    }
  });
});
