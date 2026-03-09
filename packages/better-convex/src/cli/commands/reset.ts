import type { RunDeps } from '../core.js';
import { run as runCore } from '../core.js';

export const handleResetCommand = (argv: string[], deps?: Partial<RunDeps>) =>
  runCore(argv, deps);
