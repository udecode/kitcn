import { type FunctionReference, makeFunctionReference } from 'convex/server';
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';
import { useConvex } from '../../../solid/convex-solid';
import { calculateRateLimit } from '../core/calculate-rate-limit';
import type {
  HookCheckValue,
  RateLimitSnapshot,
  ResolvedAlgorithm,
} from '../types';

export type GetRateLimitValueQueryRef = FunctionReference<
  'query',
  'public',
  {
    identifier?: string;
    sampleShards?: number;
  },
  RateLimitSnapshot
>;

export type GetServerTimeMutationRef = FunctionReference<
  'mutation',
  'public',
  Record<string, never>,
  number
>;

export type GetRateLimitValueQuery = GetRateLimitValueQueryRef | string;
export type GetServerTimeMutation = GetServerTimeMutationRef | string;

export type UseRateLimitOptions = {
  identifier?: string;
  count?: number;
  sampleShards?: number;
  getServerTimeMutation?: GetServerTimeMutation;
};

export function useRateLimit(
  getRateLimitValueQuery: GetRateLimitValueQuery,
  options?: UseRateLimitOptions
) {
  const [timeOffset, setTimeOffset] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const [snapshot, setSnapshot] = createSignal<RateLimitSnapshot | undefined>();
  const convex = useConvex();

  const getRateLimitValueQueryRef = createMemo(() =>
    resolveGetRateLimitValueQuery(getRateLimitValueQuery)
  );

  const { getServerTimeMutation, count, identifier, sampleShards } =
    options ?? {};

  const getServerTimeMutationRef = createMemo(() =>
    getServerTimeMutation
      ? resolveGetServerTimeMutation(getServerTimeMutation)
      : undefined
  );

  // Sync server time offset
  createEffect(
    on(getServerTimeMutationRef, (ref) => {
      if (!ref) return;

      const clientTime = Date.now();
      void convex.mutation(ref, {}).then((serverTime: number) => {
        const latency = Date.now() - clientTime;
        setTimeOffset(serverTime - clientTime - latency / 2);
      });
    })
  );

  // Subscribe to rate limit data
  createEffect(
    on(
      () => ({ ref: getRateLimitValueQueryRef(), identifier, sampleShards }),
      ({ ref }) => {
        const unsub = convex.onUpdate(
          ref,
          { identifier, sampleShards },
          (data: RateLimitSnapshot) => {
            setSnapshot(data);
          }
        );

        onCleanup(() => {
          unsub();
        });
      }
    )
  );

  function check(
    ts?: number,
    requestedCount?: number
  ): HookCheckValue | undefined {
    const rateLimitData = snapshot();
    if (!rateLimitData) return undefined;

    const clientTs = ts ?? Date.now();
    const serverTs = clientTs + timeOffset();
    const needed = requestedCount ?? count ?? 1;

    const evaluation = evaluateSnapshot(rateLimitData, serverTs, needed);
    return {
      value: evaluation.value,
      ts: evaluation.ts - timeOffset(),
      config: rateLimitData.config,
      shard: rateLimitData.shard,
      ok: evaluation.value >= 0,
      retryAt: evaluation.retryAfter
        ? serverTs + evaluation.retryAfter - timeOffset()
        : undefined,
    };
  }

  const current = createMemo(() => check(now(), count ?? 1));

  const statusMemo = createMemo(() => {
    const c = current();
    if (!c) return undefined;
    if (c.value < 0) return { ok: false as const, retryAt: c.retryAt! };
    return { ok: true as const, retryAt: undefined };
  });

  // Auto-retry timer
  createEffect(() => {
    const status = statusMemo();
    if (status?.ok !== false || !status.retryAt) return;

    const timeout = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, status.retryAt - now())
    );
    onCleanup(() => clearTimeout(timeout));
  });

  return {
    get status() {
      return statusMemo();
    },
    check,
  };
}

function resolveGetRateLimitValueQuery(
  ref: GetRateLimitValueQuery
): GetRateLimitValueQueryRef {
  if (typeof ref === 'string') {
    return makeFunctionReference<'query'>(ref) as GetRateLimitValueQueryRef;
  }
  return ref;
}

function resolveGetServerTimeMutation(
  ref: GetServerTimeMutation
): GetServerTimeMutationRef {
  if (typeof ref === 'string') {
    return makeFunctionReference<'mutation'>(ref) as GetServerTimeMutationRef;
  }
  return ref;
}

function evaluateSnapshot(
  snapshot: RateLimitSnapshot,
  now: number,
  count: number
): { value: number; ts: number; retryAfter?: number } {
  const baseState =
    snapshot.config.kind === 'slidingWindow'
      ? {
          value: Math.max(0, snapshot.config.limit - snapshot.value),
          ts: snapshot.ts,
        }
      : {
          value: snapshot.value,
          ts: snapshot.ts,
        };
  const evaluated = calculateRateLimit(
    baseState,
    snapshot.config as ResolvedAlgorithm,
    now,
    count
  );

  return {
    value:
      snapshot.config.kind === 'slidingWindow'
        ? evaluated.retryAfter !== undefined
          ? -1
          : evaluated.remaining
        : evaluated.state.value,
    ts: evaluated.state.ts,
    retryAfter: evaluated.retryAfter,
  };
}
