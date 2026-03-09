import { logger } from './logger.js';

export const handleCliError = (
  error: unknown,
  options: {
    cleanup?: () => void;
  } = {}
): number => {
  options.cleanup?.();

  if (error instanceof Error) {
    logger.error(`Error: ${error.message}`);
    if (process.env.BETTER_CONVEX_DEBUG === '1' && error.stack) {
      logger.log(error.stack);
    }
    return 1;
  }

  logger.error(`Error: ${String(error)}`);
  return 1;
};
