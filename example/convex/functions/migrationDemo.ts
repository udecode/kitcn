import * as z from 'zod';
import { authMutation, authQuery } from '../lib/crpc';
import { createServerCaller } from './generated/server.runtime';

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
  const server = createServerCaller(ctx);
  // Every subscribed client re-runs this read whenever a chunk patches
  // migration_run, so keep the listing at the default page size.
  const status = await server.migrationStatus({});

  const runs = Array.isArray(status.runs) ? status.runs : [];
  const states = Array.isArray(status.migrations) ? status.migrations : [];
  const activeRun =
    status.activeRun && typeof status.activeRun === 'object'
      ? status.activeRun
      : null;

  const sortedRuns = [...runs].sort((left, right) => {
    const leftStarted = left.startedAt ?? 0;
    const rightStarted = right.startedAt ?? 0;
    return rightStarted - leftStarted;
  });
  const sortedStates = [...states].sort((left, right) =>
    String(left.migrationId).localeCompare(String(right.migrationId))
  );

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
  const server = createServerCaller(ctx);
  log('runUp request');
  const result = await server.migrationRun({
    direction: 'up',
  });
  log('runUp response', result);
  return result;
});

export const runDown = authMutation
  .input(downInputSchema)
  .mutation(async ({ ctx, input }) => {
    const server = createServerCaller(ctx);
    log('runDown request', input);
    const result = await server.migrationRun({
      direction: 'down',
      ...(input.steps !== undefined ? { steps: input.steps } : {}),
      ...(input.to !== undefined ? { to: input.to } : {}),
    });
    log('runDown response', result);
    return result;
  });

export const cancel = authMutation.mutation(async ({ ctx }) => {
  const server = createServerCaller(ctx);
  log('cancel request');
  const result = await server.migrationCancel({});
  log('cancel response', result);
  return result;
});
