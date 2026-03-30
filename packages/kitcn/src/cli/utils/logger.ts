import { highlighter } from './highlighter.js';

const joinArgs = (args: unknown[]): string => args.map(String).join(' ');

export const logger = {
  error(...args: unknown[]) {
    console.error(highlighter.error(joinArgs(args)));
  },
  warn(...args: unknown[]) {
    console.warn(highlighter.warn(joinArgs(args)));
  },
  info(...args: unknown[]) {
    console.info(highlighter.info(joinArgs(args)));
  },
  success(...args: unknown[]) {
    console.info(highlighter.success(joinArgs(args)));
  },
  log(...args: unknown[]) {
    console.info(joinArgs(args));
  },
  write(value: string) {
    console.info(value);
  },
  break() {
    console.info('');
  },
};
