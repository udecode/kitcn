import { describe, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkTemplate,
  generateTemplate,
  parseTemplateNextArgs,
  validateGeneratedTemplateApp,
} from './template-next';

describe('tooling/template-next', () => {
  test('parseTemplateNextArgs defaults to concave and accepts convex override', () => {
    expect(parseTemplateNextArgs(['sync'])).toEqual({
      mode: 'sync',
      backend: 'concave',
    });

    expect(parseTemplateNextArgs(['check', '--backend', 'convex'])).toEqual({
      mode: 'check',
      backend: 'convex',
    });

    expect(() => parseTemplateNextArgs(['check', '--backend', 'nope'])).toThrow(
      'Invalid --backend value "nope". Expected one of: convex, concave.'
    );
  });
  test('generateTemplate runs init -t next through the selected public backend flag', async () => {
    const calls: Array<{
      cmd: string[];
      cwd: string;
      allowNonZeroExit: boolean;
      env?: Record<string, string | undefined>;
    }> = [];
    const runCommand = mock(
      async (
        cmd: string[],
        cwd: string,
        options?: {
          allowNonZeroExit?: boolean;
          env?: Record<string, string | undefined>;
        }
      ) => {
        calls.push({
          cmd,
          cwd,
          allowNonZeroExit: options?.allowNonZeroExit ?? false,
          env: options?.env,
        });
        return 0;
      }
    );

    const { tempRoot, generatedAppDir } = await generateTemplate({
      projectRoot: '/repo',
      localCliPath: '/repo/packages/better-convex/src/cli/cli.ts',
      generatedAppName: 'next',
      runCommand: runCommand as any,
      backend: 'convex',
    });

    const bunBinary = Bun.which('bun') ?? process.execPath;

    expect(calls).toHaveLength(1);
    expect(calls[0]?.cmd).toEqual([
      bunBinary,
      '/repo/packages/better-convex/src/cli/cli.ts',
      '--backend',
      'convex',
      'init',
      '-t',
      'next',
      '--yes',
      '--cwd',
      tempRoot,
      '--name',
      'next',
    ]);
    expect(calls[0]?.env).toBeUndefined();
    expect(generatedAppDir).toBe(path.join(tempRoot, 'next'));
  });

  test('validateGeneratedTemplateApp runs install, lint, and typecheck in order', async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'template-next-validate-')
    );
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      `${JSON.stringify(
        {
          name: 'generated-app',
          dependencies: {
            'better-convex': '0.10.3',
          },
        },
        null,
        2
      )}\n`
    );
    const calls: Array<{
      cmd: string[];
      cwd: string;
      allowNonZeroExit: boolean;
    }> = [];
    const runCommand = mock(
      async (
        cmd: string[],
        cwd: string,
        options?: { allowNonZeroExit?: boolean }
      ) => {
        calls.push({
          cmd,
          cwd,
          allowNonZeroExit: options?.allowNonZeroExit ?? false,
        });
        return 0;
      }
    );

    try {
      await validateGeneratedTemplateApp(tempDir, runCommand, {
        betterConvexPackageSpec: 'file:/repo/better-convex.tgz',
      });

      expect(calls).toEqual([
        {
          cmd: ['bun', 'install'],
          cwd: tempDir,
          allowNonZeroExit: false,
        },
        {
          cmd: ['bun', 'run', 'lint'],
          cwd: tempDir,
          allowNonZeroExit: false,
        },
        {
          cmd: ['bun', 'run', 'typecheck'],
          cwd: tempDir,
          allowNonZeroExit: false,
        },
      ]);

      const packageJson = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'package.json'), 'utf8')
      ) as { name: string; dependencies: Record<string, string> };
      expect(packageJson.name).toBe('better-convex-template-next-check');
      expect(packageJson.dependencies['better-convex']).toBe(
        'file:/repo/better-convex.tgz'
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('checkTemplate validates the fresh generated app before diffing the fixture', async () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'template-next-check-order-')
    );
    const fixtureDir = path.join(tempRoot, 'fixture');
    const generatedAppDir = path.join(tempRoot, 'generated');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.mkdirSync(generatedAppDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixtureDir, 'package.json'),
      '{"name":"fixture"}\n'
    );
    fs.writeFileSync(
      path.join(generatedAppDir, 'package.json'),
      '{"name":"generated"}\n'
    );

    const callOrder: string[] = [];
    const validateGeneratedTemplateAppFn = mock(async () => {
      callOrder.push('validate');
    });
    const normalizeTemplateFn = mock(() => {
      callOrder.push('normalize');
    });
    const runCommand = mock(
      async (
        cmd: string[],
        _cwd: string,
        options?: { allowNonZeroExit?: boolean }
      ) => {
        if (options?.allowNonZeroExit) {
          expect(cmd).toEqual([
            'git',
            '--no-pager',
            'diff',
            '--no-index',
            '--no-ext-diff',
            '--',
            path.join(tempRoot, '__fixture__'),
            generatedAppDir,
          ]);
          callOrder.push('diff');
        }
        return 0;
      }
    );

    try {
      await checkTemplate({
        fixtureDir,
        projectRoot: tempRoot,
        generateTemplateFn: async () => ({ tempRoot, generatedAppDir }),
        normalizeTemplateFn,
        validateGeneratedTemplateAppFn,
        runCommand,
        logFn: () => {},
      });
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }

    expect(callOrder).toEqual(['validate', 'normalize', 'diff']);
  });
});
