import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { generateFreshApp, log, PROJECT_ROOT, run } from './scaffold-utils';

const DIST_CLI_PATH = path.join(
  PROJECT_ROOT,
  'packages',
  'kitcn',
  'dist',
  'cli.mjs'
);

const createAnonymousRunCommand = (
  cmd: string[],
  cwd: string,
  options: Parameters<typeof run>[2] = {}
) =>
  run(cmd, cwd, {
    ...options,
    env: {
      CONVEX_AGENT_MODE: 'anonymous',
      ...options.env,
    },
  });

export const runNodeEnvSmoke = async () => {
  const { generatedAppDir, tempRoot } = await generateFreshApp({
    backend: 'convex',
    generatedAppName: 'node-env-smoke',
    initTemplate: 'vite',
    runCommand: createAnonymousRunCommand,
  });

  try {
    fs.mkdirSync(path.join(generatedAppDir, 'convex'), { recursive: true });
    fs.writeFileSync(
      path.join(generatedAppDir, 'convex', '.env'),
      [
        'NODE_ENV_SMOKE=1',
        'MULTILINE="hello\\nworld"',
        `JSON='{"a":1}'`,
        "SPACED='hello world'",
        'CONVEX_DEPLOYMENT=ignored',
        'VITE_CONVEX_URL=ignored',
        '',
      ].join('\n')
    );

    await createAnonymousRunCommand(
      ['node', DIST_CLI_PATH, '--backend', 'convex', 'env', 'push'],
      generatedAppDir
    );
    await createAnonymousRunCommand(
      [
        'node',
        DIST_CLI_PATH,
        '--backend',
        'convex',
        'env',
        'pull',
        '--out',
        'convex/.env.remote',
      ],
      generatedAppDir
    );

    const pulledEnv = fs.readFileSync(
      path.join(generatedAppDir, 'convex', '.env.remote'),
      'utf8'
    );
    const parsed = parseEnv(pulledEnv);
    if (
      parsed.NODE_ENV_SMOKE !== '1' ||
      parsed.MULTILINE !== 'hello\nworld' ||
      parsed.JSON !== '{"a":1}' ||
      parsed.SPACED !== 'hello world'
    ) {
      throw new Error('Node env smoke did not preserve pulled env values.');
    }
    if (
      pulledEnv.includes('CONVEX_DEPLOYMENT=') ||
      pulledEnv.includes('VITE_CONVEX_URL=')
    ) {
      throw new Error('Node env smoke pushed managed Convex env keys.');
    }

    log('Node CLI env smoke passed.');
  } finally {
    fs.rmSync(tempRoot, { force: true, recursive: true });
  }
};

if (import.meta.main) {
  try {
    await runNodeEnvSmoke();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
