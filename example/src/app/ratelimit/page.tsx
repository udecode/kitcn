'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRateLimit } from 'better-convex/plugins/ratelimit/react';
import { useMaybeAuth } from 'better-convex/react';
import {
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

const STATUS_ORDER = ['supported', 'partial', 'blocked', 'missing'] as const;

type CoverageStatus = (typeof STATUS_ORDER)[number];

type ProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

type CoverageEntry = {
  id: string;
  feature: string;
  status: CoverageStatus;
  reason: string;
  example: string;
  errorCode?: string;
  probe: ProbeResult;
};

type CoverageSnapshot = {
  generatedAt: string;
  entries: CoverageEntry[];
  summary: Record<CoverageStatus, number>;
  validated: number;
  total: number;
};

const EMPTY_SNAPSHOT: CoverageSnapshot = {
  generatedAt: '1970-01-01T00:00:00.000Z',
  entries: [],
  summary: {
    supported: 0,
    partial: 0,
    blocked: 0,
    missing: 0,
  },
  validated: 0,
  total: 0,
};

type InteractiveStatus = {
  ok: boolean;
  remaining: number;
  limit: number;
  reset: number;
  now: number;
  reason: string | null;
};

const interactiveRateLimitRef =
  'ratelimitDemo:getInteractiveRateLimit' as const;

const interactiveServerTimeRef =
  'ratelimitDemo:getInteractiveServerTime' as const;

function getOrCreateSessionId() {
  if (typeof window === 'undefined') {
    return 'ratelimit-demo-ssr';
  }
  const existing = window.localStorage.getItem('ratelimit-demo-session');
  if (existing) {
    return existing;
  }
  const generated = `rl-${window.crypto.randomUUID()}`;
  window.localStorage.setItem('ratelimit-demo-session', generated);
  return generated;
}

function expectedPass(entry: CoverageEntry): boolean {
  if (entry.status === 'blocked') {
    return !entry.probe.ok;
  }
  return entry.probe.ok;
}

function JsonBox({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 shadow-inner">
      <p className="mb-2 font-medium text-[11px] text-zinc-400 uppercase tracking-[0.16em]">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function RatelimitPage() {
  const isAuth = useMaybeAuth();
  const crpc = useCRPC();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<CoverageSnapshot | null>(null);
  const [sessionId] = useState(getOrCreateSessionId);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [interactiveStatus, setInteractiveStatus] =
    useState<InteractiveStatus | null>(null);

  const { status: interactiveRateStatus, check: checkInteractiveRate } =
    useRateLimit(interactiveRateLimitRef, {
      identifier: sessionId,
      count: 1,
      getServerTimeMutation: interactiveServerTimeRef,
    });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  const snapshotQuery = useQuery(
    crpc.ratelimitDemo.getSnapshot.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const snapshot = (snapshotQuery.data ?? EMPTY_SNAPSHOT) as CoverageSnapshot;
  const effectiveSnapshot = lastRun ?? snapshot;
  const hasRenderedCoverage = Boolean(lastRun) || effectiveSnapshot.total > 0;
  const generatedAtLabel = hasRenderedCoverage
    ? new Date(effectiveSnapshot.generatedAt).toLocaleTimeString()
    : '—';

  const runCoverage = useMutation(
    crpc.ratelimitDemo.runCoverage.mutationOptions({
      onSuccess: (data) => {
        setLastRun(data as CoverageSnapshot);
        toast.success('Ratelimit coverage executed');
        queryClient.invalidateQueries(
          crpc.ratelimitDemo.getSnapshot.queryFilter()
        );
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to run ratelimit coverage');
      },
    })
  );

  const consumeInteractive = useMutation(
    crpc.ratelimitDemo.consumeInteractive.mutationOptions({
      onSuccess: (data) => {
        const status = data as InteractiveStatus;
        setInteractiveStatus(status);
        if (status.ok) {
          toast.success('Interactive limiter consumed one token');
        } else {
          toast.error('Interactive limiter blocked this request');
        }
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to consume interactive limiter');
      },
    })
  );

  const resetInteractive = useMutation(
    crpc.ratelimitDemo.resetInteractive.mutationOptions({
      onSuccess: (data) => {
        setInteractiveStatus(data as InteractiveStatus);
        toast.success('Interactive limiter reset');
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to reset interactive limiter');
      },
    })
  );

  const validated = effectiveSnapshot.entries.filter(expectedPass).length;
  const total = effectiveSnapshot.entries.length;
  const effectiveInteractiveStatus =
    interactiveStatus ??
    ({
      ok: true,
      remaining: 3,
      limit: 3,
      reset: nowMs,
      now: nowMs,
      reason: null,
    } satisfies InteractiveStatus);
  const interactiveProjection = checkInteractiveRate(nowMs, 1);
  const statusRetryMs =
    interactiveRateStatus?.ok === false && interactiveRateStatus.retryAt
      ? Math.max(0, interactiveRateStatus.retryAt - nowMs)
      : 0;
  const fallbackRetryMs = effectiveInteractiveStatus.ok
    ? 0
    : Math.max(0, effectiveInteractiveStatus.reset - nowMs);
  const retryMs = Math.max(statusRetryMs, fallbackRetryMs);
  const retrySeconds = Math.ceil(retryMs / 1000);
  const isInteractiveBlocked = retryMs > 0;

  return (
    <div className="mx-auto max-w-7xl snap-y snap-mandatory @3xl:px-8 px-6 @3xl:py-12 py-8">
      <section className="relative mb-8 min-h-[62vh] snap-start overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8 text-zinc-100 shadow-xl">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-orange-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-sky-400/25 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-xs tracking-wide">
              <Gauge className="size-3.5" />
              Ratelimit Summary Slides
            </div>
            <h1 className="max-w-4xl font-semibold @lg:text-5xl text-4xl tracking-tight">
              Full ratelimit parity coverage board.
            </h1>
            <p className="max-w-4xl @lg:text-base text-sm text-zinc-300">
              Upstash-style API parity checks, Convex protections, timeout
              modes, dynamic overrides, and deterministic coverage probes.
            </p>
          </div>

          <div className="grid @lg:grid-cols-5 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Coverage
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {validated}/{total}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Supported
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {effectiveSnapshot.summary.supported ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Generated
              </p>
              <p className="mt-1 font-semibold text-sm">{generatedAtLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Live
              </p>
              <p className="mt-1 font-semibold text-xl">
                {isInteractiveBlocked ? 'Cooldown' : 'Ready'}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Last run
              </p>
              <p className="mt-1 font-semibold text-sm">
                {lastRun ? 'Available' : 'None'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAuth ? (
              <Button
                className="gap-2"
                disabled={runCoverage.isPending}
                onClick={() => runCoverage.mutate(undefined)}
                variant="secondary"
              >
                {runCoverage.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run Ratelimit Coverage
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
                <AlertTriangle className="size-4" />
                Sign in to execute ratelimit probes.
              </div>
            )}
            <Badge className="rounded-full px-3 py-1 font-medium text-xs">
              hard-cutover parity mode
            </Badge>
          </div>

          <div className="max-w-2xl rounded-2xl border border-white/15 bg-black/25 p-4">
            <p className="font-medium text-sm">Live limiter sandbox</p>
            <p className="mt-1 text-xs text-zinc-300">
              Polling every second. Button disables while rate-limited and
              auto-recovers with countdown.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge className="rounded-full bg-white/20 px-2 py-1 text-white hover:bg-white/20">
                {`${effectiveInteractiveStatus.remaining}/${effectiveInteractiveStatus.limit} remaining`}
              </Badge>
              <Badge className="rounded-full bg-white/20 px-2 py-1 text-white hover:bg-white/20">
                {`hook value ${
                  interactiveProjection
                    ? Math.max(0, Math.floor(interactiveProjection.value))
                    : '—'
                }`}
              </Badge>
              <Badge className="rounded-full bg-white/20 px-2 py-1 text-white hover:bg-white/20">
                {isInteractiveBlocked
                  ? `recovery ${retrySeconds}s`
                  : 'accepting requests'}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                className="gap-2"
                disabled={consumeInteractive.isPending || isInteractiveBlocked}
                onClick={() => consumeInteractive.mutate({ sessionId })}
                size="sm"
                variant="secondary"
              >
                {consumeInteractive.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {isInteractiveBlocked
                  ? `Rate limited (${retrySeconds}s)`
                  : 'Consume token'}
              </Button>
              <Button
                className="gap-2"
                disabled={resetInteractive.isPending}
                onClick={() => resetInteractive.mutate({ sessionId })}
                size="sm"
                variant="ghost"
              >
                {resetInteractive.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Reset
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-lg tracking-tight">
          Ratelimit Matrix
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Probe</th>
                <th className="px-3 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.flatMap((status) =>
                effectiveSnapshot.entries
                  .filter((entry) => entry.status === status)
                  .map((entry) => {
                    const passed = expectedPass(entry);
                    return (
                      <tr
                        className="border-border/50 border-t align-top"
                        key={entry.id}
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium">{entry.feature}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {entry.example}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <Badge className="rounded-full" variant="secondary">
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(
                                'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs',
                                passed
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-rose-100 text-rose-900'
                              )}
                            >
                              {passed ? (
                                <CheckCircle2 className="size-3" />
                              ) : (
                                <XCircle className="size-3" />
                              )}
                              {passed ? 'pass' : 'fail'}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {entry.probe.elapsedMs}ms
                            </span>
                            {entry.probe.error ? (
                              <span className="text-rose-600 text-xs">
                                {entry.probe.error}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs leading-relaxed">
                          {entry.reason}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid @xl:grid-cols-2 gap-4">
        <JsonBox label="Current Snapshot" value={snapshot} />
        <JsonBox
          label="Interactive Status"
          value={{
            sessionId,
            status: effectiveInteractiveStatus,
            retryMs,
          }}
        />
        <JsonBox label="Last Run Payload" value={lastRun} />
      </section>
    </div>
  );
}
