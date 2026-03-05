'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMaybeAuth } from 'better-convex/react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCode2,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

const EVENT_TYPE_ORDER = [
  'todo_completed',
  'project_visibility',
  'tag_renamed',
] as const;

type EventType = (typeof EVENT_TYPE_ORDER)[number];

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
  expected: 'supported' | 'blocked';
  reason: string;
  probe: ProbeResult;
};

type EventDetailsByType = {
  todo_completed: {
    todoId: string | null;
    completed: boolean;
  };
  project_visibility: {
    projectId: string | null;
    isPublic: boolean;
  };
  tag_renamed: {
    tagId: string | null;
    previousName: string;
    nextName: string;
  };
};

type EventRow = {
  id: string;
  createdAt: Date;
  eventType: EventType;
  details: EventDetailsByType[EventType];
  actor: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  todo: {
    id: string;
    title: string;
    completed: boolean;
  } | null;
  project: {
    id: string;
    name: string;
    isPublic: boolean;
  } | null;
  tag: {
    id: string;
    name: string;
    color: string;
  } | null;
};

type Snapshot = {
  generatedAt: string;
  summary: {
    totalRecentEvents: number;
    byType: Record<EventType, number>;
  };
  recentEvents: EventRow[];
};

type CoverageRun = {
  generatedAt: string;
  validated: number;
  total: number;
  entries: CoverageEntry[];
  snapshot: Snapshot;
};

const EMPTY_SNAPSHOT: Snapshot = {
  generatedAt: '1970-01-01T00:00:00.000Z',
  summary: {
    totalRecentEvents: 0,
    byType: {
      todo_completed: 0,
      project_visibility: 0,
      tag_renamed: 0,
    },
  },
  recentEvents: [],
};

function eventLabel(eventType: EventType): string {
  if (eventType === 'todo_completed') return 'todo_completed';
  if (eventType === 'project_visibility') return 'project_visibility';
  return 'tag_renamed';
}

function eventAccent(eventType: EventType): string {
  if (eventType === 'todo_completed') return 'bg-emerald-100 text-emerald-900';
  if (eventType === 'project_visibility') return 'bg-sky-100 text-sky-900';
  return 'bg-violet-100 text-violet-900';
}

function formatMs(value: number): string {
  return `${value}ms`;
}

function formatTime(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return '—';
  }
  return value.toLocaleTimeString();
}

function formatDateTime(value: Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'invalid date';
  }
  return date.toLocaleString();
}

function matchesExpectation(entry: CoverageEntry): boolean {
  if (entry.expected === 'supported') {
    return entry.probe.ok;
  }
  return !entry.probe.ok;
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

function EventDetailsPreview({ row }: { row: EventRow }) {
  if (row.eventType === 'todo_completed') {
    const details = row.details as EventDetailsByType['todo_completed'];
    return (
      <div className="space-y-1 text-xs">
        <p>
          <span className="text-muted-foreground">todoId:</span>{' '}
          <span className="font-mono">{details.todoId ?? 'null'}</span>
        </p>
        <p>
          <span className="text-muted-foreground">completed:</span>{' '}
          <span className="font-mono">{String(details.completed)}</span>
        </p>
      </div>
    );
  }

  if (row.eventType === 'project_visibility') {
    const details = row.details as EventDetailsByType['project_visibility'];
    return (
      <div className="space-y-1 text-xs">
        <p>
          <span className="text-muted-foreground">projectId:</span>{' '}
          <span className="font-mono">{details.projectId ?? 'null'}</span>
        </p>
        <p>
          <span className="text-muted-foreground">isPublic:</span>{' '}
          <span className="font-mono">{String(details.isPublic)}</span>
        </p>
      </div>
    );
  }

  const details = row.details as EventDetailsByType['tag_renamed'];
  return (
    <div className="space-y-1 text-xs">
      <p>
        <span className="text-muted-foreground">tagId:</span>{' '}
        <span className="font-mono">{details.tagId ?? 'null'}</span>
      </p>
      <p>
        <span className="text-muted-foreground">previousName:</span>{' '}
        <span className="font-mono">{details.previousName}</span>
      </p>
      <p>
        <span className="text-muted-foreground">nextName:</span>{' '}
        <span className="font-mono">{details.nextName}</span>
      </p>
    </div>
  );
}

export default function OrmPage() {
  const isAuth = useMaybeAuth();
  const crpc = useCRPC();
  const queryClient = useQueryClient();

  const [lastSeedResult, setLastSeedResult] = useState<unknown>(null);
  const [lastClearResult, setLastClearResult] = useState<unknown>(null);
  const [lastCoverage, setLastCoverage] = useState<CoverageRun | null>(null);

  const snapshotQuery = useQuery(
    crpc.ormDemo.getSnapshot.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const invalidateSnapshot = () => {
    queryClient.invalidateQueries(crpc.ormDemo.getSnapshot.queryFilter());
  };

  const seedPolymorphic = useMutation(
    crpc.ormDemo.seedPolymorphic.mutationOptions({
      onSuccess: (data) => {
        setLastSeedResult(data);
        toast.success(`Seeded ${data.inserted} polymorphic events`);
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to seed polymorphic events');
      },
    })
  );

  const clearPolymorphic = useMutation(
    crpc.ormDemo.clearPolymorphic.mutationOptions({
      onSuccess: (data) => {
        setLastClearResult(data);
        toast.success(`Cleared ${data.deleted} polymorphic events`);
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to clear polymorphic events');
      },
    })
  );

  const runCoverage = useMutation(
    crpc.ormDemo.runCoverage.mutationOptions({
      onSuccess: (data) => {
        setLastCoverage(data as unknown as CoverageRun);
        toast.success('ORM polymorphic coverage executed');
        invalidateSnapshot();
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to run ORM coverage');
      },
    })
  );

  const snapshot = (lastCoverage?.snapshot ??
    snapshotQuery.data ??
    EMPTY_SNAPSHOT) as Snapshot;

  const coverageEntries = lastCoverage?.entries ?? [];
  const coverageValidated = coverageEntries.filter(matchesExpectation).length;

  const generatedLabel = useMemo(() => {
    const source = lastCoverage?.generatedAt ?? snapshot.generatedAt;
    return formatTime(source);
  }, [lastCoverage?.generatedAt, snapshot.generatedAt]);

  return (
    <div className="mx-auto max-w-7xl snap-y snap-mandatory @3xl:px-8 px-6 @3xl:py-12 py-8">
      <section className="relative mb-8 min-h-[64vh] snap-start overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8 text-zinc-100 shadow-xl">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-sky-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-emerald-400/25 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-xs tracking-wide">
              <Sparkles className="size-3.5" />
              ORM Summary Slides
            </div>
            <h1 className="max-w-4xl font-semibold @lg:text-5xl text-4xl tracking-tight">
              Schema-first polymorphic union coverage board.
            </h1>
            <p className="max-w-4xl @lg:text-base text-sm text-zinc-300">
              Live demo for `polymorphic({'{'} variants, as? {'}'})`: flat
              writes, generated top-level refs for indexes, and nested `details`
              read synthesis.
            </p>
          </div>

          <div className="grid @lg:grid-cols-6 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Recent events
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {snapshot.summary.totalRecentEvents}
              </p>
            </div>
            {EVENT_TYPE_ORDER.map((eventType) => (
              <div
                className="rounded-2xl border border-white/10 bg-white/10 p-4"
                key={eventType}
              >
                <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                  {eventLabel(eventType)}
                </p>
                <p className="mt-1 font-semibold text-2xl">
                  {snapshot.summary.byType[eventType] ?? 0}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Coverage
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {coverageEntries.length === 0
                  ? '—'
                  : `${coverageValidated}/${coverageEntries.length}`}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Generated
              </p>
              <p className="mt-1 font-semibold text-sm">{generatedLabel}</p>
            </div>
          </div>

          <div className="flex min-h-9 flex-wrap items-center gap-3">
            {isAuth ? (
              <>
                <Button
                  className="gap-2"
                  disabled={seedPolymorphic.isPending}
                  onClick={() => seedPolymorphic.mutate(undefined)}
                  variant="secondary"
                >
                  {seedPolymorphic.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Database className="size-4" />
                  )}
                  Seed polymorphic set
                </Button>
                <Button
                  className="gap-2"
                  disabled={clearPolymorphic.isPending}
                  onClick={() => clearPolymorphic.mutate(undefined)}
                  variant="secondary"
                >
                  {clearPolymorphic.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Clear events
                </Button>
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
                  Run ORM coverage
                </Button>
              </>
            ) : (
              <div className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
                <AlertTriangle className="size-4" />
                Sign in to run demo mutations.
              </div>
            )}
            <Button
              className="gap-2"
              disabled={snapshotQuery.isFetching}
              onClick={invalidateSnapshot}
              size="sm"
              variant="ghost"
            >
              {snapshotQuery.isFetching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh snapshot
            </Button>
            <Badge className="rounded-full px-3 py-1 font-medium text-xs">
              no query-level polymorphic config
            </Badge>
          </div>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Runtime Coverage Matrix
          </h2>
        </div>

        {coverageEntries.length === 0 ? (
          <div className="rounded-xl border border-border/70 border-dashed bg-secondary/20 p-6 text-muted-foreground text-sm">
            Run coverage to validate supported vs blocked polymorphic behavior.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Feature</th>
                  <th className="px-3 py-2 text-left">Expected</th>
                  <th className="px-3 py-2 text-left">Probe</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Reason</th>
                </tr>
              </thead>
              <tbody>
                {coverageEntries.map((entry) => {
                  const passed = matchesExpectation(entry);

                  return (
                    <tr
                      className="border-border/50 border-t align-top"
                      key={entry.id}
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium">{entry.feature}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {entry.id}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="secondary">{entry.expected}</Badge>
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
                            {entry.probe.ok ? 'ok' : 'error'}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {formatMs(entry.probe.elapsedMs)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs">
                          {entry.probe.errorCode ?? 'none'}
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
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <GitBranch className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">
            Polymorphic Events (details union)
          </h2>
        </div>

        {snapshot.recentEvents.length === 0 ? (
          <div className="rounded-xl border border-border/70 border-dashed bg-secondary/20 p-6 text-muted-foreground text-sm">
            No events yet. Seed the demo set to generate one row per variant.
          </div>
        ) : (
          <div className="grid @2xl:grid-cols-2 gap-3">
            {snapshot.recentEvents.map((row) => (
              <article
                className="rounded-xl border border-border/60 bg-secondary/20 p-4"
                key={row.id}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'font-mono text-[11px]',
                      eventAccent(row.eventType)
                    )}
                  >
                    {eventLabel(row.eventType)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>

                <div className="mb-3 rounded-lg bg-background/60 p-3">
                  <p className="mb-1 text-[11px] text-muted-foreground uppercase tracking-wide">
                    details
                  </p>
                  <EventDetailsPreview row={row} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-background/60 p-2">
                    <p className="text-muted-foreground">actor</p>
                    <p className="font-mono">
                      {row.actor?.name ?? row.actor?.email ?? 'unknown'}
                    </p>
                  </div>
                  <div className="rounded-md bg-background/60 p-2">
                    <p className="text-muted-foreground">related</p>
                    <p className="font-mono">
                      {row.todo?.title ??
                        row.project?.name ??
                        row.tag?.name ??
                        'none'}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileCode2 className="size-4" />
          <h2 className="font-medium text-lg tracking-tight">Live Payloads</h2>
        </div>

        <div className="grid @2xl:grid-cols-3 gap-3">
          <JsonBox label="snapshot" value={snapshot} />
          <JsonBox label="last coverage" value={lastCoverage} />
          <JsonBox
            label="last mutations"
            value={{
              seed: lastSeedResult,
              clear: lastClearResult,
            }}
          />
        </div>

        {lastCoverage ? (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-secondary/35 px-3 py-2 text-sm">
            {coverageValidated === coverageEntries.length ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : (
              <XCircle className="size-4 text-rose-600" />
            )}
            <span>
              Coverage validated: {coverageValidated}/{coverageEntries.length}
            </span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
