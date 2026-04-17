import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execa } from 'execa';

export type ConvexCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

const CONVEX_OUTPUT_NOISE_LINES = [
  /^Run `npx convex login` at any time to create an account and link this deployment\.$/,
  /^A minor update is available for Convex /,
  /^Changelog: https:\/\/github\.com\/get-convex\/convex-js\/blob\/main\/CHANGELOG\.md#changelog$/,
] as const;
const CONVEX_OUTPUT_LINE_SPLIT_RE = /\r?\n/;
const require = createRequire(import.meta.url);
const convexPkg = require.resolve('convex/package.json');
const REAL_CONVEX_CLI_PATH = join(dirname(convexPkg), 'bin/main.js');

export const CLEARED_CONVEX_ENV = {
  CONVEX_DEPLOYMENT: undefined,
  CONVEX_DEPLOY_KEY: undefined,
  CONVEX_SELF_HOSTED_URL: undefined,
  CONVEX_SELF_HOSTED_ADMIN_KEY: undefined,
} as const;

export const normalizeConvexCommandResult = (
  result: Partial<{
    exitCode: number | null;
    stderr: string;
    stdout: string;
  }>
): ConvexCommandResult => ({
  exitCode: result.exitCode ?? 0,
  stderr:
    typeof result.stderr === 'string'
      ? stripConvexCommandNoise(result.stderr)
      : '',
  stdout:
    typeof result.stdout === 'string'
      ? stripConvexCommandNoise(result.stdout)
      : '',
});

export const stripConvexCommandNoise = (value: string): string =>
  value
    .split(CONVEX_OUTPUT_LINE_SPLIT_RE)
    .filter(
      (line) =>
        line.trim().length > 0 &&
        !CONVEX_OUTPUT_NOISE_LINES.some((pattern) => pattern.test(line.trim()))
    )
    .join('\n');

export const writeConvexCommandOutput = (result: ConvexCommandResult) => {
  if (result.stdout) {
    process.stdout.write(
      result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`
    );
  }
  if (result.stderr) {
    process.stderr.write(
      result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`
    );
  }
};

export const formatConvexCommandFailure = (
  args: string[],
  result: ConvexCommandResult
) => {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  return output.length > 0
    ? `convex ${args.join(' ')} failed.\n${output}`
    : `convex ${args.join(' ')} failed.`;
};

export const runLocalConvexCommand = async (
  args: string[],
  options: {
    cwd: string;
    env?: Record<string, string | undefined>;
  }
): Promise<ConvexCommandResult> => {
  const result = await execa('node', [REAL_CONVEX_CLI_PATH, ...args], {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...CLEARED_CONVEX_ENV,
      ...options.env,
    },
    reject: false,
    stdio: 'pipe',
  });

  return normalizeConvexCommandResult(result);
};
