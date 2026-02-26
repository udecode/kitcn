'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMaybeAuth } from 'better-convex/react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Database,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

const WRITE_OPS = [
  { op: 'insertTodo', label: 'insertTodo', destructive: false },
  { op: 'toggleRandomTodo', label: 'toggleRandomTodo', destructive: false },
  { op: 'softDeleteTodo', label: 'softDeleteTodo', destructive: true },
  { op: 'restoreTodo', label: 'restoreTodo', destructive: false },
] as const;

const STATUS_ORDER = ['supported', 'partial', 'blocked', 'missing'] as const;
const AREA_ORDER = ['count', 'aggregate', 'relationCount'] as const;

type ParityStatus = (typeof STATUS_ORDER)[number];
type RuntimeArea = (typeof AREA_ORDER)[number];

type ProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

type ParityEntry = {
  id: string;
  prismaFeature: string;
  status: ParityStatus;
  reason: string;
  errorCode?: string;
  example: string;
  noScanBlocked?: boolean;
  probe?: ProbeResult;
};

type RuntimeCoverageEntry = {
  id: string;
  area: RuntimeArea;
  label: string;
  expected: 'supported' | 'blocked';
  reason: string;
  errorCode: string | null;
  probe: ProbeResult;
};

type EngineProbe = {
  id: string;
  label: string;
  serialMs: number | null;
  parallelMs: number | null;
  parallelized: boolean | null;
  note: string | null;
  error: string | null;
  errorCode: string | null;
};

function JsonBox({
  label,
  value,
  className,
}: {
  label: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 shadow-inner',
        className
      )}
    >
      <p className="mb-2 font-medium text-[11px] text-zinc-400 uppercase tracking-[0.16em]">
        {label}
      </p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function statusLabel(status: ParityStatus): string {
  if (status === 'supported') return 'Supported';
  if (status === 'partial') return 'Partial';
  if (status === 'blocked') return 'Blocked';
  return 'Missing';
}

function areaLabel(area: RuntimeArea): string {
  if (area === 'count') return 'Count';
  if (area === 'aggregate') return 'Aggregate';
  return 'Relation _count';
}

function formatMetricValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'pending';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function formatMs(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'n/a';
  return `${value.toFixed(2)}ms`;
}

function matchesExpectedProbe(options: {
  expected: 'supported' | 'blocked';
  probe?: ProbeResult;
  expectedErrorCode?: string | null;
}): boolean {
  const { expected, probe, expectedErrorCode } = options;
  if (!probe) {
    return false;
  }
  if (expected === 'supported') {
    return probe.ok;
  }
  if (probe.ok) {
    return false;
  }
  if (!expectedErrorCode) {
    return true;
  }
  return probe.errorCode === expectedErrorCode;
}

function parityExpected(entry: ParityEntry): 'supported' | 'blocked' {
  return entry.status === 'blocked' ? 'blocked' : 'supported';
}

function ProbePill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 font-medium text-[11px]',
        ok ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'
      )}
    >
      {label}
    </span>
  );
}

export default function AggregatePage() {
  const isAuth = useMaybeAuth();
  const crpc = useCRPC();
  const queryClient = useQueryClient();

  const [lastWriteResult, setLastWriteResult] = useState<unknown>(null);
  const [lastToggleResult, setLastToggleResult] = useState<unknown>(null);
  const [proofResult, setProofResult] = useState<unknown>(null);

  const snapshotQuery = useQuery(
    crpc.aggregateDemo.getSnapshot.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const invalidateSnapshot = () => {
    queryClient.invalidateQueries(crpc.aggregateDemo.getSnapshot.queryFilter());
  };

  const toggleFillReset = useMutation(
    crpc.aggregateDemo.toggleRandomFillReset.mutationOptions({
      onSuccess: (data) => {
        setLastToggleResult(data);
        toast.success(
          data.action === 'seed'
            ? `Seeded random demo data (seed ${data.seed})`
            : 'Reset demo data'
        );
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to toggle seed/reset');
      },
    })
  );

  const runDirectOp = useMutation(
    crpc.aggregateDemo.runDirectOp.mutationOptions({
      onSuccess: (data) => {
        setLastWriteResult(data);
        toast.success(`${data.op}: ${data.message}`);
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Write op failed');
      },
    })
  );

  const runProof = useMutation(
    crpc.aggregateDemo.exerciseIdempotentTrigger.mutationOptions({
      onSuccess: (data) => {
        setProofResult(data);
        toast.success('Count parity proof executed');
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Count proof failed');
      },
    })
  );

  const snapshot = snapshotQuery.data;
  const loading = snapshotQuery.isLoading || snapshotQuery.isFetching;
  const parityEntries = (snapshot?.parity?.entries ?? []) as ParityEntry[];
  const paritySummary = (snapshot?.parity?.summary as
    | Record<ParityStatus, number>
    | undefined) ?? {
    supported: 0,
    partial: 0,
    blocked: 0,
    missing: 0,
  };
  const engineProbes = Object.values(
    (snapshot?.engineBehavior as
      | Record<'aggregate' | 'countSelect' | 'relationCount', EngineProbe>
      | undefined) ?? {}
  );
  const runtimeCoverage = (snapshot?.runtimeCoverage ??
    []) as RuntimeCoverageEntry[];

  const parityValidated = parityEntries.filter((entry) =>
    matchesExpectedProbe({
      expected: parityExpected(entry),
      probe: entry.probe,
      expectedErrorCode: entry.status === 'blocked' ? entry.errorCode : null,
    })
  ).length;

  const runtimeValidated = runtimeCoverage.filter((entry) =>
    matchesExpectedProbe({
      expected: entry.expected,
      probe: entry.probe,
      expectedErrorCode: entry.expected === 'blocked' ? entry.errorCode : null,
    })
  ).length;

  const totalCoverage = parityEntries.length + runtimeCoverage.length;
  const totalValidated = parityValidated + runtimeValidated;

  return (
    <div className="mx-auto max-w-7xl snap-y snap-mandatory @3xl:px-8 px-6 @3xl:py-12 py-8">
      <section className="relative mb-8 min-h-[70vh] snap-start overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8 text-zinc-100 shadow-xl">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-orange-400/35 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-sky-400/25 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-xs tracking-wide">
              <Sparkles className="size-3.5" />
              Aggregate Summary Slides
            </div>
            <h1 className="max-w-4xl font-semibold @lg:text-5xl text-4xl tracking-tight">
              Full aggregate coverage board.
            </h1>
            <p className="max-w-4xl @lg:text-base text-sm text-zinc-300">
              Compact, exhaustive demo for no-scan aggregate/count runtime:
              Prisma parity matrix, runtime capability probes, and live engine
              behavior.
            </p>
          </div>

          <div className="grid @lg:grid-cols-6 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Projects
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {snapshot?.summary.projects ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Todos
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {snapshot?.summary.todos ?? 0}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Parity
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {parityValidated}/{parityEntries.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Runtime
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {runtimeValidated}/{runtimeCoverage.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Coverage
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {totalValidated}/{totalCoverage}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Status
              </p>
              <p className="mt-1 font-semibold text-xl">
                {loading ? 'Refreshing' : 'Live'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAuth ? (
              <Button
                className="gap-2"
                disabled={toggleFillReset.isPending}
                onClick={() => {
                  if (
                    snapshot?.seeded &&
                    // biome-ignore lint/suspicious/noAlert: demo confirmation
                    !confirm('Reset removes seeded demo rows. Continue?')
                  ) {
                    return;
                  }
                  toggleFillReset.mutate(undefined);
                }}
                variant="secondary"
              >
                {toggleFillReset.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {snapshot?.seeded ? 'Reset Random Fill' : 'Random Fill'}
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
                <AlertTriangle className="size-4" />
                Sign in to run demo mutations.
              </div>
            )}
            <Badge className="rounded-full px-3 py-1 font-medium text-xs">
              strict no-scan aggregateIndex runtime
            </Badge>
          </div>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Database className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Prisma Aggregate Parity Matrix
          </h2>
        </div>

        <div className="mb-4 grid @lg:grid-cols-4 gap-3">
          {STATUS_ORDER.map((status) => (
            <div className="rounded-xl bg-secondary/30 p-3" key={status}>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                {statusLabel(status)}
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {paritySummary[status] ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[940px] border-collapse text-sm">
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
                parityEntries
                  .filter((entry) => entry.status === status)
                  .map((entry) => {
                    const validated = matchesExpectedProbe({
                      expected: parityExpected(entry),
                      probe: entry.probe,
                      expectedErrorCode:
                        entry.status === 'blocked' ? entry.errorCode : null,
                    });
                    return (
                      <tr
                        className="border-border/50 border-t align-top"
                        key={entry.id}
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium">{entry.prismaFeature}</p>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {entry.example}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary">
                              {statusLabel(status)}
                            </Badge>
                            {entry.noScanBlocked ? (
                              <Badge
                                className="bg-amber-100 text-amber-900"
                                variant="secondary"
                              >
                                no-scan boundary
                              </Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1">
                            <ProbePill
                              label={
                                entry.probe?.ok
                                  ? 'ok'
                                  : entry.probe
                                    ? 'error'
                                    : 'n/a'
                              }
                              ok={validated}
                            />
                            {entry.probe ? (
                              <span className="font-mono text-[11px] text-muted-foreground">
                                {formatMs(entry.probe.elapsedMs)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-mono text-xs">
                            {entry.probe?.errorCode ??
                              entry.errorCode ??
                              'none'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground text-xs">
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

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Gauge className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Runtime Capability Coverage
          </h2>
        </div>

        <div className="mb-4 grid @lg:grid-cols-3 gap-3">
          {AREA_ORDER.map((area) => {
            const entries = runtimeCoverage.filter(
              (entry) => entry.area === area
            );
            const passed = entries.filter((entry) =>
              matchesExpectedProbe({
                expected: entry.expected,
                probe: entry.probe,
                expectedErrorCode:
                  entry.expected === 'blocked' ? entry.errorCode : null,
              })
            ).length;

            return (
              <div className="rounded-xl bg-secondary/30 p-3" key={area}>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {areaLabel(area)}
                </p>
                <p className="mt-1 font-semibold text-2xl">
                  {passed}/{entries.length}
                </p>
              </div>
            );
          })}
        </div>

        <div className="grid @2xl:grid-cols-2 gap-3">
          {runtimeCoverage.map((entry) => {
            const passed = matchesExpectedProbe({
              expected: entry.expected,
              probe: entry.probe,
              expectedErrorCode:
                entry.expected === 'blocked' ? entry.errorCode : null,
            });
            return (
              <div
                className="rounded-xl border border-border/60 bg-secondary/20 p-4"
                key={entry.id}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{areaLabel(entry.area)}</Badge>
                  <Badge
                    variant={
                      entry.expected === 'blocked' ? 'outline' : 'secondary'
                    }
                  >
                    expected: {entry.expected}
                  </Badge>
                  <ProbePill
                    label={entry.probe.ok ? 'ok' : 'error'}
                    ok={passed}
                  />
                </div>
                <p className="font-medium text-sm">{entry.label}</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  {entry.reason}
                </p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  code: {entry.probe.errorCode ?? entry.errorCode ?? 'none'} •
                  time: {formatMs(entry.probe.elapsedMs)}
                </p>
                {entry.probe.error ? (
                  <p className="mt-1 font-mono text-[11px] text-destructive">
                    {entry.probe.error}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid @2xl:grid-cols-3 gap-3">
          {engineProbes.map((probe) => (
            <div
              className="rounded-xl border border-border/60 bg-secondary/20 p-4"
              key={probe.id}
            >
              <p className="font-medium text-sm">{probe.label}</p>
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-muted-foreground">
                  serial baseline:{' '}
                  <span className="font-mono">{formatMs(probe.serialMs)}</span>
                </p>
                <p className="text-muted-foreground">
                  combined query:{' '}
                  <span className="font-mono">
                    {formatMs(probe.parallelMs)}
                  </span>
                </p>
                <p>
                  parallelized:{' '}
                  <span className="font-mono">
                    {probe.parallelized === null
                      ? 'n/a'
                      : probe.parallelized
                        ? 'yes'
                        : 'no'}
                  </span>
                </p>
                {probe.note ? (
                  <p className="text-muted-foreground">{probe.note}</p>
                ) : null}
                {probe.error ? (
                  <p className="font-mono text-destructive text-xs">
                    {probe.error}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <BarChart3 className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Live Metrics + Query Snapshots
          </h2>
        </div>

        <div className="mb-4 grid @lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-secondary/35 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              count(dueDate)
            </p>
            <p className="mt-1 font-semibold text-lg">
              {formatMetricValue(snapshot?.readOps?.metrics?.dueDateCount)}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/35 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              min(dueDate)
            </p>
            <p className="mt-1 font-semibold text-lg">
              {formatMetricValue(snapshot?.readOps?.metrics?.dueDateMin)}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/35 p-4">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              max(dueDate)
            </p>
            <p className="mt-1 font-semibold text-lg">
              {formatMetricValue(snapshot?.readOps?.metrics?.dueDateMax)}
            </p>
          </div>
          <div
            className={cn(
              'rounded-xl p-4',
              snapshot?.readOps?.metrics?.status === 'ready'
                ? 'bg-emerald-100/70 text-emerald-900'
                : 'bg-amber-100/70 text-amber-900'
            )}
          >
            <p className="text-xs uppercase tracking-wide">index state</p>
            <p className="mt-1 font-semibold text-lg">
              {snapshot?.readOps?.metrics?.status === 'ready'
                ? 'READY'
                : 'BUILDING'}
            </p>
          </div>
        </div>

        <div className="grid @2xl:grid-cols-3 gap-3">
          <JsonBox
            label="projects with _count"
            value={snapshot?.readOps?.projectSummaries ?? []}
          />
          <JsonBox
            label="tags with _count"
            value={snapshot?.readOps?.tagSummaries ?? []}
          />
          <JsonBox
            label="reply counts"
            value={snapshot?.readOps?.replySummaries ?? []}
          />
        </div>
      </section>

      <section className="snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Play className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Mutation Lab + Raw Payload
          </h2>
        </div>

        <div className="mb-4 grid @3xl:grid-cols-4 @lg:grid-cols-2 gap-3">
          {WRITE_OPS.map((item) => (
            <Button
              className="justify-start"
              disabled={!isAuth || runDirectOp.isPending}
              key={item.op}
              onClick={() => {
                if (
                  item.destructive &&
                  // biome-ignore lint/suspicious/noAlert: demo confirmation
                  !confirm(`Run destructive operation ${item.label}?`)
                ) {
                  return;
                }
                runDirectOp.mutate({ op: item.op });
              }}
              variant={item.destructive ? 'destructive' : 'secondary'}
            >
              {runDirectOp.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              {item.label}
            </Button>
          ))}
        </div>

        <Button
          className="mb-4 gap-2"
          disabled={!isAuth || runProof.isPending}
          onClick={() => runProof.mutate(undefined)}
          variant="secondary"
        >
          {runProof.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Execute count parity check
        </Button>

        <div className="grid @2xl:grid-cols-2 gap-3">
          <JsonBox label="last write result" value={lastWriteResult} />
          <JsonBox label="proof result" value={proofResult} />
          <JsonBox label="seed action" value={lastToggleResult} />
          <JsonBox label="runtime coverage payload" value={runtimeCoverage} />
        </div>

        <div className="mt-4 grid @2xl:grid-cols-2 gap-3">
          <JsonBox
            label="parity summary"
            value={snapshot?.parity?.summary ?? {}}
          />
          <JsonBox
            label="engine behavior"
            value={snapshot?.engineBehavior ?? {}}
          />
        </div>

        {isAuth ? null : (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
            <XCircle className="size-4" />
            Sign in to execute mutation actions.
          </div>
        )}
      </section>
    </div>
  );
}
