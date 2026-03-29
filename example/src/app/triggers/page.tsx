'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'kitcn/react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Gauge,
  Loader2,
  Play,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

const STATUS_ORDER = ['supported', 'partial', 'blocked', 'missing'] as const;
const EMPTY_SNAPSHOT: TriggerSnapshot = {
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
  samples: {
    hookCounts: {},
    runCount: 0,
  },
};

type TriggerStatus = (typeof STATUS_ORDER)[number];

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
  status: TriggerStatus;
  reason: string;
  example: string;
  errorCode?: string;
  probe: ProbeResult;
};

type TriggerSnapshot = {
  generatedAt: string;
  entries: CoverageEntry[];
  summary: Record<TriggerStatus, number>;
  validated: number;
  total: number;
  samples: {
    hookCounts: Record<string, number>;
    runCount: number;
  };
};

function formatMs(value: number): string {
  return `${value}ms`;
}

function statusLabel(status: TriggerStatus): string {
  if (status === 'supported') return 'Supported';
  if (status === 'partial') return 'Partial';
  if (status === 'blocked') return 'Blocked';
  return 'Missing';
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

export default function TriggersPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const canRun = isAuthenticated && !isLoading;
  const crpc = useCRPC();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<TriggerSnapshot | null>(null);

  const snapshotQuery = useQuery(
    crpc.triggerDemo.getSnapshot.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const snapshot = (snapshotQuery.data ?? EMPTY_SNAPSHOT) as TriggerSnapshot;
  const effectiveSnapshot = lastRun ?? snapshot;
  const hasRenderedCoverage = Boolean(lastRun) || effectiveSnapshot.total > 0;
  const generatedAtLabel = hasRenderedCoverage
    ? new Date(effectiveSnapshot.generatedAt).toLocaleTimeString()
    : '—';

  const runCoverage = useMutation(
    crpc.triggerDemo.runCoverage.mutationOptions({
      onSuccess: (data) => {
        setLastRun(data as TriggerSnapshot);
        toast.success('Trigger coverage executed');
        queryClient.invalidateQueries(
          crpc.triggerDemo.getSnapshot.queryFilter()
        );
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to run trigger coverage');
      },
    })
  );

  const validated = effectiveSnapshot.entries.filter(expectedPass).length;
  const total = effectiveSnapshot.entries.length;

  return (
    <div className="mx-auto max-w-7xl snap-y snap-mandatory @3xl:px-8 px-6 @3xl:py-12 py-8">
      <section className="relative mb-8 min-h-[62vh] snap-start overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8 text-zinc-100 shadow-xl">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-emerald-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-sky-400/25 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-xs tracking-wide">
              <Activity className="size-3.5" />
              Trigger Summary Slides
            </div>
            <h1 className="max-w-4xl font-semibold @lg:text-5xl text-4xl tracking-tight">
              Full trigger lifecycle coverage board.
            </h1>
            <p className="max-w-4xl @lg:text-base text-sm text-zinc-300">
              Compact verification of schema triggers: before/after/change
              hooks, cancellation, recursive writes, and app bootstrap hooks.
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
                Runs
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {effectiveSnapshot.samples.runCount ?? 0}
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
                Status
              </p>
              <p className="mt-1 font-semibold text-xl">
                {snapshotQuery.isFetching ? 'Refreshing' : 'Live'}
              </p>
            </div>
          </div>

          <div className="flex min-h-9 flex-wrap items-center gap-3">
            {canRun ? (
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
                Run Trigger Coverage
              </Button>
            ) : isLoading ? (
              <div
                aria-hidden
                className="h-9 w-44 animate-pulse rounded-md bg-white/15"
              />
            ) : (
              <div className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
                <AlertTriangle className="size-4" />
                Sign in to execute trigger probes.
              </div>
            )}
            <Badge className="rounded-full px-3 py-1 font-medium text-xs">
              schema-level hooks only
            </Badge>
          </div>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Database className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Lifecycle Matrix
          </h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Probe</th>
                <th className="px-3 py-2 text-left">Code</th>
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
                          <Badge variant="secondary">
                            {statusLabel(status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={cn(
                                'inline-flex w-fit items-center rounded-full px-2 py-0.5 font-medium text-[11px]',
                                passed
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-rose-100 text-rose-900'
                              )}
                            >
                              {entry.probe.ok ? (
                                <CheckCircle2 className="mr-1 size-3" />
                              ) : (
                                <XCircle className="mr-1 size-3" />
                              )}
                              {entry.probe.ok ? 'ok' : 'error'}
                            </span>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {formatMs(entry.probe.elapsedMs)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs">
                            {entry.probe.errorCode ?? entry.errorCode ?? 'none'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
                          {entry.reason}
                          {entry.probe.error ? (
                            <p className="mt-1 font-mono text-[11px] text-destructive">
                              {entry.probe.error}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Gauge className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">Hook Signals</h2>
        </div>

        <div className="grid @lg:grid-cols-4 gap-3">
          {Object.entries(effectiveSnapshot.samples.hookCounts ?? {}).map(
            ([key, value]) => (
              <div className="rounded-xl bg-secondary/30 p-3" key={key}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {key}
                </p>
                <p className="mt-1 font-semibold text-2xl">{value}</p>
              </div>
            )
          )}
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">Raw Payloads</h2>
        </div>
        <div className="grid @2xl:grid-cols-2 gap-3">
          <JsonBox label="snapshot payload" value={effectiveSnapshot} />
          <JsonBox label="last run response" value={lastRun} />
        </div>
      </section>
    </div>
  );
}
