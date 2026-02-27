import { z } from 'zod';
import { authMutation, authQuery } from '../lib/crpc';
import { internal } from './_generated/api';

const generatedServerInternal = internal.generated.server;
const LOG_PREFIX = '[migration-demo]';

function log(action: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info(`${LOG_PREFIX} ${action}`);
    return;
  }
  console.info(`${LOG_PREFIX} ${action}`, payload);
}

const downInputSchema = z
  .object({
    steps: z.number().int().positive().optional(),
    to: z.string().min(1).optional(),
  })
  .refine((value) => !(value.steps && value.to), {
    message: 'Use either steps or to, not both.',
  });

export const getStatus = authQuery.query(async ({ ctx }) => {
  const [runs, states] = await Promise.all([
    ctx.db.query('migration_run').collect(),
    ctx.db.query('migration_state').collect(),
  ]);
  const sortedRuns = [...runs].sort((left, right) => {
    const leftStarted = left.startedAt ?? 0;
    const rightStarted = right.startedAt ?? 0;
    return rightStarted - leftStarted;
  });
  const sortedStates = [...states].sort((left, right) =>
    String(left.migrationId).localeCompare(String(right.migrationId))
  );

  const activeRun = sortedRuns.find((run) => run.status === 'running') ?? null;
  const latestRun = sortedRuns[0] ?? null;

  log('status', {
    runCount: sortedRuns.length,
    stateCount: sortedStates.length,
    latestRunStatus: latestRun?.status ?? null,
    latestRunId: latestRun?.runId ?? null,
    activeRunId: activeRun?.runId ?? null,
  });

  return {
    runs: sortedRuns,
    states: sortedStates,
    activeRun,
  };
});

export const runUp = authMutation.mutation(async ({ ctx }) => {
  log('runUp request');
  const result = await ctx.runMutation(generatedServerInternal.migrationRun, {
    direction: 'up',
  });
  log('runUp response', result);
  return result;
});

export const runDown = authMutation
  .input(downInputSchema)
  .mutation(async ({ ctx, input }) => {
    log('runDown request', input);
    const result = await ctx.runMutation(generatedServerInternal.migrationRun, {
      direction: 'down',
      ...(input.steps !== undefined ? { steps: input.steps } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
    });
    log('runDown response', result);
    return result;
  });

export const cancel = authMutation.mutation(async ({ ctx }) => {
  log('cancel request');
  const result = await ctx.runMutation(
    generatedServerInternal.migrationCancel,
    {}
  );
  log('cancel response', result);
  return result;
});
