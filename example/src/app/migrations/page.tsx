'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMaybeAuth } from 'better-convex/react';
import { Loader2, Play, RotateCcw, Square } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCRPC } from '@/lib/convex/crpc';

type MigrationRunRow = {
  status?: string | null;
} & Record<string, unknown>;

type MigrationStateRow = {
  applied?: boolean;
  status?: string | null;
} & Record<string, unknown>;

const EMPTY_RUNS: MigrationRunRow[] = [];
const EMPTY_STATES: MigrationStateRow[] = [];

function JsonBox({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100 shadow-inner">
      <p className="mb-2 font-medium text-[11px] text-zinc-400 uppercase tracking-[0.16em]">
        {label}
      </p>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function MigrationsPage() {
  const isAuth = useMaybeAuth();
  const crpc = useCRPC();
  const queryClient = useQueryClient();

  const statusQuery = useQuery(
    crpc.migrationDemo.getStatus.queryOptions(undefined, {
      skipUnauth: true,
      refetchInterval: 2000,
    })
  );

  const invalidateStatus = () => {
    queryClient.invalidateQueries(crpc.migrationDemo.getStatus.queryFilter());
  };

  const runUp = useMutation(
    crpc.migrationDemo.runUp.mutationOptions({
      onSuccess: () => {
        toast.success('Migration up kicked off');
        invalidateStatus();
      },
      onError: (error) => {
        toast.error(error.message || 'Migration up failed');
      },
    })
  );

  const runDown = useMutation(
    crpc.migrationDemo.runDown.mutationOptions({
      onSuccess: () => {
        toast.success('Migration down kicked off');
        invalidateStatus();
      },
      onError: (error) => {
        toast.error(error.message || 'Migration down failed');
      },
    })
  );

  const cancel = useMutation(
    crpc.migrationDemo.cancel.mutationOptions({
      onSuccess: () => {
        toast.success('Migration run canceled');
        invalidateStatus();
      },
      onError: (error) => {
        toast.error(error.message || 'Migration cancel failed');
      },
    })
  );

  const runs = (statusQuery.data?.runs ?? EMPTY_RUNS) as MigrationRunRow[];
  const states = (statusQuery.data?.states ?? EMPTY_STATES) as MigrationStateRow[];
  const latestRun = runs[0] ?? null;
  const activeRun = (statusQuery.data?.activeRun ??
    null) as MigrationRunRow | null;
  const stateSummary = useMemo(() => {
    return {
      total: states.length,
      applied: states.filter((state) => state.applied === true).length,
      running: states.filter((state) => state.status === 'running').length,
      failed: states.filter((state) => state.status === 'failed').length,
    };
  }, [states]);

  return (
    <div className="mx-auto max-w-6xl @3xl:px-8 px-6 @3xl:py-12 py-8">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl tracking-tight">
              Migrations Lab
            </h1>
            <p className="text-muted-foreground text-sm">
              Run built-in ORM migrations (`up`, `down`, `cancel`) and inspect
              live internal state tables.
            </p>
          </div>
          <Badge variant="secondary">{activeRun ? 'running' : 'idle'}</Badge>
        </div>
      </header>

      <section className="mb-8 rounded-lg bg-secondary/30 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {isAuth ? (
            <>
              <Button
                className="gap-2"
                disabled={
                  runUp.isPending || runDown.isPending || cancel.isPending
                }
                onClick={() => runUp.mutate(undefined)}
                size="sm"
                variant="secondary"
              >
                {runUp.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run Up
              </Button>
              <Button
                className="gap-2"
                disabled={
                  runUp.isPending || runDown.isPending || cancel.isPending
                }
                onClick={() => runDown.mutate({ steps: 1 })}
                size="sm"
                variant="secondary"
              >
                {runDown.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                Run Down (1)
              </Button>
              <Button
                className="gap-2"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(undefined)}
                size="sm"
                variant="ghost"
              >
                {cancel.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Square className="size-4" />
                )}
                Cancel
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Sign in to execute migration mutations.
            </p>
          )}
        </div>

        <div className="grid @lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Latest Run
            </p>
            <p className="mt-1 font-medium">{latestRun?.status ?? 'none'}</p>
          </div>
          <div className="rounded-md bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Migration States
            </p>
            <p className="mt-1 font-medium">{stateSummary.total}</p>
          </div>
          <div className="rounded-md bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Applied
            </p>
            <p className="mt-1 font-medium">{stateSummary.applied}</p>
          </div>
          <div className="rounded-md bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Failed
            </p>
            <p className="mt-1 font-medium">{stateSummary.failed}</p>
          </div>
        </div>
      </section>

      <section className="grid @lg:grid-cols-2 gap-4">
        <JsonBox label="migration_run" value={runs} />
        <JsonBox label="migration_state" value={states} />
      </section>
    </div>
  );
}
