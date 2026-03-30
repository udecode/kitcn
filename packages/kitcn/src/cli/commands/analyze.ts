import { parseArgs, type RunDeps, resolveRunDeps } from '../backend-core.js';

export const handleAnalyzeCommand = async (
  argv: string[],
  deps: Partial<RunDeps> = {}
) => {
  const parsed = parseArgs(argv);
  const { runAnalyze } = resolveRunDeps(deps);
  return runAnalyze(parsed.restArgs);
};
