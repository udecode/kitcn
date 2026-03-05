import { useConvex, useQuery } from 'convex/react';
import { type FunctionReference, makeFunctionReference } from 'convex/server';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  const [timeOffset, setTimeOffset] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());
  const convex = useConvex();

  const getRateLimitValueQueryRef = useMemo(
    () => resolveGetRateLimitValueQuery(getRateLimitValueQuery),
    [getRateLimitValueQuery]
  );

  const { getServerTimeMutation, count, identifier, sampleShards } =
    options ?? {};

  const getServerTimeMutationRef = useMemo(
    () =>
      getServerTimeMutation
        ? resolveGetServerTimeMutation(getServerTimeMutation)
        : undefined,
    [getServerTimeMutation]
  );

  useEffect(() => {
    if (!getServerTimeMutationRef) {
      return;
    }

    const clientTime = Date.now();
    void convex
      .mutation(getServerTimeMutationRef, {})
      .then((serverTime: number) => {
        const latency = Date.now() - clientTime;
        setTimeOffset(serverTime - clientTime - latency / 2);
      });
  }, [convex, getServerTimeMutationRef]);

  const rateLimitData = useQuery(getRateLimitValueQueryRef, {
    identifier,
    sampleShards,
  });

  const check = useCallback(
    (ts?: number, requestedCount?: number): HookCheckValue | undefined => {
      if (!rateLimitData) {
        return undefined;
      }

      const clientTs = ts ?? Date.now();
      const serverTs = clientTs + timeOffset;
      const needed = requestedCount ?? count ?? 1;

      const evaluation = evaluateSnapshot(rateLimitData, serverTs, needed);
      return {
        value: evaluation.value,
        ts: evaluation.ts - timeOffset,
        config: rateLimitData.config,
        shard: rateLimitData.shard,
        ok: evaluation.value >= 0,
        retryAt: evaluation.retryAfter
          ? serverTs + evaluation.retryAfter - timeOffset
          : undefined,
      };
    },
    [count, rateLimitData, timeOffset]
  );

  const current = check(now, count ?? 1);
  const response = useMemo(() => {
    if (!current) {
      return { status: undefined, check };
    }

    if (current.value < 0) {
      return {
        status: { ok: false as const, retryAt: current.retryAt! },
        check,
      };
    }

    return {
      status: { ok: true as const, retryAt: undefined },
      check,
    };
  }, [check, current]);

  useEffect(() => {
    if (response.status?.ok !== false || !response.status.retryAt) {
      return;
    }

    const timeout = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, response.status.retryAt - now)
    );
    return () => clearTimeout(timeout);
  }, [now, response.status?.ok, response.status?.retryAt]);

  return response;
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
          // hookAPI snapshots for sliding windows expose "remaining" at read time.
          // Rebuild a conservative state so checks can recover as time advances.
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
