import { createColors } from 'picocolors';

const isTruthyEnvFlag = (value: string | undefined): boolean =>
  value !== undefined && value !== '' && value !== '0';

export const isColorEnabled = (): boolean => {
  if (process.env.FORCE_COLOR === '0') {
    return false;
  }
  if (isTruthyEnvFlag(process.env.FORCE_COLOR)) {
    return true;
  }
  if (isTruthyEnvFlag(process.env.NO_COLOR)) {
    return false;
  }
  return Boolean(process.stdout.isTTY && process.env.TERM !== 'dumb');
};

const withColors = <T>(
  callback: (colors: ReturnType<typeof createColors>) => T
): T => callback(createColors(isColorEnabled()));

export const highlighter = {
  bold(value: string): string {
    return withColors((colors) => colors.bold(value));
  },
  dim(value: string): string {
    return withColors((colors) => colors.dim(value));
  },
  info(value: string): string {
    return withColors((colors) => colors.cyan(value));
  },
  success(value: string): string {
    return withColors((colors) => colors.green(value));
  },
  warn(value: string): string {
    return withColors((colors) => colors.yellow(value));
  },
  error(value: string): string {
    return withColors((colors) => colors.red(value));
  },
  path(value: string): string {
    return withColors((colors) => colors.bold(value));
  },
};
