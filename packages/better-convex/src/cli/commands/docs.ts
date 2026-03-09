import {
  formatDocsOutput as formatDocsOutputFn,
  parseArgs,
  type RunDeps,
  resolveDocTopic,
  resolveRunDeps,
} from '../core.js';
import { logger } from '../utils/logger.js';
import { createSpinner } from '../utils/spinner.js';

const HELP_FLAGS = new Set(['--help', '-h']);

export { formatDocsOutput } from '../core.js';

export const DOCS_HELP_TEXT = `Usage: better-convex docs <topic...> [options]

Options:
  --json            Machine-readable docs link output`;

export const parseDocsCommandArgs = (args: string[]) => {
  let json = false;
  const topics: string[] = [];
  for (const arg of args) {
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown docs flag "${arg}".`);
    }
    topics.push(arg);
  }
  if (topics.length === 0) {
    throw new Error(
      'Missing docs topic. Usage: better-convex docs <topic...>.'
    );
  }
  return { json, topics };
};

export const handleDocsCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  if (
    HELP_FLAGS.has(argv[0] ?? '') ||
    HELP_FLAGS.has(parsed.restArgs[0] ?? '')
  ) {
    logger.write(DOCS_HELP_TEXT);
    return 0;
  }

  const docsArgs = parseDocsCommandArgs(parsed.restArgs);
  resolveRunDeps(deps);
  const docsSpinner = createSpinner('Resolving docs links...', {
    silent: docsArgs.json,
  });
  docsSpinner.start();
  const results = docsArgs.topics.map((topic) => {
    const doc = resolveDocTopic(topic);
    if (!doc) {
      throw new Error(`Unknown docs topic "${topic}".`);
    }
    return {
      topic,
      ...doc,
    };
  });
  docsSpinner.stop();

  if (docsArgs.json) {
    console.info(JSON.stringify({ command: 'docs', topics: results }));
  } else {
    logger.write(formatDocsOutputFn(results));
  }

  return 0;
};
