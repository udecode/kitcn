import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'dotenv';
import { pullEnv, pushEnv } from './env';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-cli-env-'));
}

describe('cli/env', () => {
  test('pushEnv throws when convex/.env is missing and auth is disabled', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      await expect(pushEnv()).rejects.toThrow('convex/.env file not found.');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv batches existing env vars via convex env set --from-file', async () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'convex', '.env'),
      `${['FOO=bar', 'EMPTY=', 'BAZ=qux'].join('\n')}\n`,
      'utf8'
    );

    const oldCwd = process.cwd();
    process.chdir(dir);

    const calls: string[][] = [];
    let uploadedEnvFile = '';

    try {
      await pushEnv(
        {
          force: true,
          targetArgs: ['--prod', '--env-file', '.env.agent'],
        },
        {
          runCommand: async (args) => {
            calls.push(args);
            if (args[0] === 'env' && args[1] === 'set') {
              uploadedEnvFile = fs.readFileSync(args[3]!, 'utf8');
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        }
      );

      expect(calls).toEqual([
        [
          'env',
          'set',
          '--from-file',
          expect.any(String),
          '--force',
          '--prod',
          '--env-file',
          '.env.agent',
        ],
      ]);
      expect(uploadedEnvFile).toContain('FOO=bar');
      expect(uploadedEnvFile).toContain('BAZ=qux');
      expect(uploadedEnvFile).not.toContain('EMPTY=');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv --from-file uses the provided file instead of convex/.env', async () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'convex', '.env'), 'SHOULD_NOT_USE=nope\n');
    fs.writeFileSync(
      path.join(dir, '.env.defaults'),
      'FROM_FILE=yes\nCONVEX_DEPLOYMENT=ignored\nNEXT_PUBLIC_CONVEX_URL=ignored\n',
      'utf8'
    );

    const oldCwd = process.cwd();
    process.chdir(dir);

    let uploadedEnvFile = '';

    try {
      await pushEnv(
        {
          fromFilePath: '.env.defaults',
        },
        {
          runCommand: async (args) => {
            if (args[0] === 'env' && args[1] === 'set') {
              uploadedEnvFile = fs.readFileSync(args[3]!, 'utf8');
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        }
      );

      expect(uploadedEnvFile).toContain('FROM_FILE=yes');
      expect(uploadedEnvFile).not.toContain('SHOULD_NOT_USE=nope');
      expect(uploadedEnvFile).not.toContain('CONVEX_DEPLOYMENT=');
      expect(uploadedEnvFile).not.toContain('NEXT_PUBLIC_CONVEX_URL=');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv uses provided source content when stdin is piped', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);

    let uploadedEnvFile = '';

    try {
      await pushEnv(
        {
          sourceContent:
            'PIPED_VALUE=yes\nVITE_CONVEX_URL=ignored\nMULTILINE="hello\\nworld"\n',
        },
        {
          runCommand: async (args) => {
            if (args[0] === 'env' && args[1] === 'set') {
              uploadedEnvFile = fs.readFileSync(args[3]!, 'utf8');
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        }
      );

      expect(uploadedEnvFile).toContain('PIPED_VALUE=yes');
      expect(uploadedEnvFile).toContain('MULTILINE=');
      expect(uploadedEnvFile).not.toContain('VITE_CONVEX_URL=');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv --auth creates convex/.env secret, fetches jwks, and batches both values', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);

    const calls: string[][] = [];
    let uploadedEnvFile = '';

    try {
      await pushEnv(
        { auth: true },
        {
          secretGenerator: () => 'secret-123',
          runCommand: async (args) => {
            calls.push(args);
            if (
              args[0] === 'run' &&
              args[1] === 'generated/auth:getLatestJwks'
            ) {
              return {
                exitCode: 0,
                stdout: JSON.stringify('jwks-json'),
                stderr: '',
              };
            }
            if (args[0] === 'env' && args[1] === 'set') {
              uploadedEnvFile = fs.readFileSync(args[3]!, 'utf8');
              return { exitCode: 0, stdout: '', stderr: '' };
            }
            throw new Error(`Unexpected command: ${args.join(' ')}`);
          },
        }
      );

      expect(calls).toEqual([
        ['run', 'generated/auth:getLatestJwks'],
        ['env', 'set', '--from-file', expect.any(String)],
      ]);
      expect(
        fs.readFileSync(path.join(dir, 'convex', '.env'), 'utf8')
      ).toContain('BETTER_AUTH_SECRET=secret-123');
      expect(uploadedEnvFile).toContain('BETTER_AUTH_SECRET=secret-123');
      expect(uploadedEnvFile).toContain('JWKS=jwks-json');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv --auth --rotate runs rotate first and forwards target args', async () => {
    const dir = mkTempDir();
    fs.mkdirSync(path.join(dir, 'convex'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'convex', '.env'), 'FOO=bar\n', 'utf8');
    const oldCwd = process.cwd();
    process.chdir(dir);

    const calls: string[][] = [];

    try {
      await pushEnv(
        {
          auth: true,
          force: true,
          rotate: true,
          targetArgs: ['--prod', '--env-file', '.env.agent'],
        },
        {
          secretGenerator: () => 'secret-456',
          runCommand: async (args) => {
            calls.push(args);
            if (args[0] === 'run' && args[1] === 'generated/auth:rotateKeys') {
              return { exitCode: 0, stdout: '', stderr: '' };
            }
            if (
              args[0] === 'run' &&
              args[1] === 'generated/auth:getLatestJwks'
            ) {
              return {
                exitCode: 0,
                stdout: JSON.stringify('jwks-rotated'),
                stderr: '',
              };
            }
            if (args[0] === 'env' && args[1] === 'set') {
              return { exitCode: 0, stdout: '', stderr: '' };
            }
            throw new Error(`Unexpected command: ${args.join(' ')}`);
          },
        }
      );

      expect(calls).toEqual([
        [
          'run',
          'generated/auth:rotateKeys',
          '--prod',
          '--env-file',
          '.env.agent',
        ],
        [
          'run',
          'generated/auth:getLatestJwks',
          '--prod',
          '--env-file',
          '.env.agent',
        ],
        [
          'env',
          'set',
          '--from-file',
          expect.any(String),
          '--force',
          '--prod',
          '--env-file',
          '.env.agent',
        ],
      ]);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pullEnv prints convex env list output to stdout by default', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);
    const writes: string[] = [];
    const originalWrite = process.stdout.write;

    try {
      process.stdout.write = ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;

      await pullEnv(
        {},
        {
          runCommand: async (args) => {
            expect(args).toEqual(['env', 'list']);
            return {
              exitCode: 0,
              stdout: 'FOO=bar\nMULTILINE="hello\\nworld"\n',
              stderr: '',
            };
          },
        }
      );

      expect(writes.join('')).toContain('FOO=bar');
      expect(writes.join('')).toContain('MULTILINE=');
    } finally {
      process.stdout.write = originalWrite;
      process.chdir(oldCwd);
    }
  });

  test('pullEnv writes convex env list output to a file when --out is used', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);

    try {
      await pullEnv(
        {
          outFilePath: 'convex/.env.remote',
          targetArgs: ['--prod'],
        },
        {
          runCommand: async (args) => {
            expect(args).toEqual(['env', 'list', '--prod']);
            return {
              exitCode: 0,
              stdout: 'FOO=bar\n',
              stderr: '',
            };
          },
        }
      );

      expect(
        fs.readFileSync(path.join(dir, 'convex', '.env.remote'), 'utf8')
      ).toBe('FOO=bar\n');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('pushEnv preserves multiline and quoted values from pulled env payloads', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    process.chdir(dir);

    let uploadedEnvFile = '';

    try {
      await pushEnv(
        {
          sourceContent: [
            'MULTILINE="hello\\nworld"',
            `JSON='{"a":1}'`,
            "SPACED='hello world'",
            'VITE_CONVEX_URL=ignored',
            '',
          ].join('\n'),
        },
        {
          runCommand: async (args) => {
            if (args[0] === 'env' && args[1] === 'set') {
              uploadedEnvFile = fs.readFileSync(args[3]!, 'utf8');
            }
            return { exitCode: 0, stdout: '', stderr: '' };
          },
        }
      );

      expect(parse(uploadedEnvFile)).toEqual(
        parse(
          [
            'MULTILINE="hello\\nworld"',
            `JSON='{"a":1}'`,
            "SPACED='hello world'",
            '',
          ].join('\n')
        )
      );
      expect(uploadedEnvFile).not.toContain('VITE_CONVEX_URL=');
    } finally {
      process.chdir(oldCwd);
    }
  });
});
