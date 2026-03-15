import { execa } from 'execa';

export type ConvexCommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

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
  stderr: typeof result.stderr === 'string' ? result.stderr : '',
  stdout: typeof result.stdout === 'string' ? result.stdout : '',
});

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
  const result = await execa('convex', args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...CLEARED_CONVEX_ENV,
      ...options.env,
    },
    localDir: options.cwd,
    preferLocal: true,
    reject: false,
  });

  return normalizeConvexCommandResult(result);
};
