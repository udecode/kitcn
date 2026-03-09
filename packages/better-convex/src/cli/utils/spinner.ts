import { spinner as createClackSpinner } from '@clack/prompts';

export const createSpinner = (
  text?: string,
  options: {
    silent?: boolean;
  } = {}
) => {
  const spinner = createClackSpinner();
  const silent =
    (options.silent ?? false) || !(process.stdin.isTTY && process.stdout.isTTY);

  return {
    start(nextText = text) {
      if (silent) {
        return;
      }
      spinner.start(nextText);
    },
    stop(nextText?: string) {
      if (silent) {
        return;
      }
      spinner.stop(nextText);
    },
    message(nextText: string) {
      if (silent) {
        return;
      }
      spinner.message(nextText);
    },
  };
};
