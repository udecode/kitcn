import { expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleAuthCommand } from './auth';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-cli-auth-'));
}

test('handleAuthCommand(--help) prints auth help', async () => {
  const infoLines: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    infoLines.push(args.map(String).join(' '));
  };

  try {
    const exitCode = await handleAuthCommand(['auth', '--help'], {});

    expect(exitCode).toBe(0);
    expect(infoLines.join('\n')).toContain('Usage: kitcn auth jwks');
  } finally {
    console.info = originalInfo;
  }
});

test('handleAuthCommand(jwks) prints env-ready JWKS line', async () => {
  const dir = mkTempDir();
  fs.mkdirSync(path.join(dir, 'convex', 'functions', 'generated'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, 'convex.json'),
    `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'convex', 'functions', 'auth.ts'),
    'export default {};\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'convex', 'functions', 'generated', 'auth.ts'),
    'export {};\n',
    'utf8'
  );

  const infoLines: string[] = [];
  const originalInfo = console.info;
  const oldCwd = process.cwd();
  console.info = (...args: unknown[]) => {
    infoLines.push(args.map(String).join(' '));
  };
  process.chdir(dir);

  try {
    const execaStub = mock(async () => ({
      exitCode: 0,
      stdout: JSON.stringify('jwks-json'),
      stderr: '',
    }));
    const exitCode = await handleAuthCommand(['auth', 'jwks'], {
      execa: execaStub as any,
      realConvex: '/fake/convex/main.js',
      loadCliConfig: mock(() => ({
        backend: 'convex',
        paths: { shared: 'convex/shared' },
      })) as any,
    });

    expect(exitCode).toBe(0);
    expect(infoLines).toEqual(['JWKS=jwks-json']);
    expect(execaStub).toHaveBeenCalledTimes(1);
  } finally {
    process.chdir(oldCwd);
    console.info = originalInfo;
  }
});

test('handleAuthCommand(jwks --rotate --json) rotates first and emits machine output', async () => {
  const dir = mkTempDir();
  fs.mkdirSync(path.join(dir, 'convex', 'functions', 'generated'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, 'convex.json'),
    `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'convex', 'functions', 'auth.ts'),
    'export default {};\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'convex', 'functions', 'generated', 'auth.ts'),
    'export {};\n',
    'utf8'
  );

  const infoLines: string[] = [];
  const originalInfo = console.info;
  const oldCwd = process.cwd();
  console.info = (...args: unknown[]) => {
    infoLines.push(args.map(String).join(' '));
  };
  process.chdir(dir);

  try {
    const concaveCliPath = path.join(dir, 'concave.mjs');
    fs.writeFileSync(concaveCliPath, 'export {};\n');
    const execaCalls: string[][] = [];
    const execaStub = mock(async (_cmd: string, args: string[]) => {
      execaCalls.push(args);
      if (args.includes('generated/auth:rotateKeys')) {
        return { exitCode: 0, stdout: JSON.stringify('rotated'), stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'Running...\nSuccess\n"jwks-json"\n',
        stderr: '',
      };
    });

    const exitCode = await handleAuthCommand(
      [
        '--backend',
        'concave',
        'auth',
        'jwks',
        '--rotate',
        '--json',
        '--url',
        'http://localhost:3210',
      ],
      {
        execa: execaStub as any,
        realConvex: '/fake/convex/main.js',
        realConcave: concaveCliPath,
        loadCliConfig: mock(() => ({
          backend: 'concave',
          paths: { shared: 'convex/shared' },
        })) as any,
      }
    );

    expect(exitCode).toBe(0);
    expect(execaCalls).toHaveLength(2);
    expect(execaCalls[0]).toEqual([
      concaveCliPath,
      'run',
      '--url',
      'http://localhost:3210',
      'generated/auth:rotateKeys',
      '{}',
    ]);
    expect(execaCalls[1]).toEqual([
      concaveCliPath,
      'run',
      '--url',
      'http://localhost:3210',
      'generated/auth:getLatestJwks',
      '{}',
    ]);
    expect(JSON.parse(infoLines.at(-1) ?? '{}')).toEqual({
      backend: 'concave',
      command: 'auth',
      envLine: 'JWKS=jwks-json',
      jwks: 'jwks-json',
      rotated: true,
      subcommand: 'jwks',
    });
  } finally {
    process.chdir(oldCwd);
    console.info = originalInfo;
  }
});
