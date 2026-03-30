'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMaybeAuth } from 'kitcn/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  ShieldUser,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  authClient,
  useSignOutMutationOptions,
} from '@/lib/convex/auth-client';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

const STATUS_ORDER = ['supported', 'partial', 'blocked', 'missing'] as const;

type CoverageStatus = (typeof STATUS_ORDER)[number];

type CoverageExpectation = 'success' | 'failure';

type ProbeMode = 'live' | 'static';

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
  expectation: CoverageExpectation;
  probeMode: ProbeMode;
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

type ScenarioResult = {
  generatedAt: string;
  entry: CoverageEntry;
  matched: boolean;
};

type AuthState = {
  user: {
    id: string;
    email: string;
    name: string;
    isAnonymous: boolean | null;
    bio: string | null;
  };
  session: {
    id: string;
    tokenPreview: string;
    ipAddress: string | null;
    userAgent: string | null;
  } | null;
};

type TimelineEvent = {
  id: string;
  scenarioId: string;
  title: string;
  outcome: 'pass' | 'fail';
  at: string;
  payload: unknown;
};

type InteractiveFlowStatus = {
  kind: 'success' | 'error';
  message: string;
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
  total: 0,
  validated: 0,
};

let timelineSequence = 0;

function nextTimelineSequence(): number {
  timelineSequence += 1;
  return timelineSequence;
}

function matchesExpectation(entry: CoverageEntry): boolean {
  if (entry.expectation === 'failure') {
    return !entry.probe.ok;
  }
  return entry.probe.ok;
}

function formatOutcome(entry: CoverageEntry): 'pass' | 'fail' {
  return matchesExpectation(entry) ? 'pass' : 'fail';
}

function formatProbeSummary(entry: CoverageEntry): string {
  if (entry.probe.ok) {
    return `pass ${entry.probe.elapsedMs}ms`;
  }
  if (entry.probe.errorCode) {
    return `${entry.probe.errorCode} ${entry.probe.elapsedMs}ms`;
  }
  return `fail ${entry.probe.elapsedMs}ms`;
}

function formatUtcClock(isoTimestamp: string): string {
  if (isoTimestamp === EMPTY_SNAPSHOT.generatedAt) {
    return '—';
  }
  const value = new Date(isoTimestamp);
  if (Number.isNaN(value.getTime())) {
    return '—';
  }
  return `${value.toISOString().slice(11, 19)} UTC`;
}

function createDemoUpgradeValues() {
  const suffix = `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
  return {
    name: `Linked ${suffix.slice(-4)}`,
    email: `linked-${suffix}@example.com`,
    password: `DemoPass!${suffix.slice(0, 8)}Aa`,
  };
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

export default function AuthPage() {
  const isAuth = useMaybeAuth();
  const crpc = useCRPC();
  const queryClient = useQueryClient();
  const [lastRun, setLastRun] = useState<CoverageSnapshot | null>(null);
  const [scenarioOverrides, setScenarioOverrides] = useState<
    Record<string, CoverageEntry>
  >({});
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [upgradeName, setUpgradeName] = useState('');
  const [upgradeEmail, setUpgradeEmail] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [interactiveFlowStatus, setInteractiveFlowStatus] =
    useState<InteractiveFlowStatus | null>(null);

  const snapshotQuery = useQuery(
    crpc.authDemo.getSnapshot.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const authStateQuery = useQuery(
    crpc.authDemo.getAuthState.queryOptions(undefined, {
      skipUnauth: true,
    })
  );

  const snapshot = (snapshotQuery.data ?? EMPTY_SNAPSHOT) as CoverageSnapshot;

  const runCoverage = useMutation(
    crpc.authDemo.runCoverage.mutationOptions({
      onSuccess: (result) => {
        const snapshotResult = result as CoverageSnapshot;
        const outcome: TimelineEvent['outcome'] =
          snapshotResult.validated === snapshotResult.total ? 'pass' : 'fail';
        const event: TimelineEvent = {
          id: `coverage-${nextTimelineSequence()}`,
          scenarioId: 'all',
          title: 'Run all scenarios',
          outcome,
          at: snapshotResult.generatedAt,
          payload: {
            validated: snapshotResult.validated,
            total: snapshotResult.total,
          },
        };
        setLastRun(snapshotResult);
        setScenarioOverrides({});
        setTimeline((current) => [event, ...current].slice(0, 40));
        toast.success('Auth coverage executed');
        queryClient.invalidateQueries(crpc.authDemo.getSnapshot.queryFilter());
        queryClient.invalidateQueries(crpc.authDemo.getAuthState.queryFilter());
      },
      onError: (error) => {
        toast.error(error.message || 'Failed to execute auth coverage');
      },
    })
  );

  const runScenario = useMutation(
    crpc.authDemo.runScenario.mutationOptions({
      onSuccess: (result) => {
        const scenario = result as ScenarioResult;
        const event: TimelineEvent = {
          id: `${scenario.entry.id}-${nextTimelineSequence()}`,
          scenarioId: scenario.entry.id,
          title: scenario.entry.feature,
          outcome: scenario.matched ? 'pass' : 'fail',
          at: scenario.generatedAt,
          payload: scenario.entry.probe.value ?? {
            error: scenario.entry.probe.error,
            errorCode: scenario.entry.probe.errorCode,
          },
        };
        setScenarioOverrides((current) => ({
          ...current,
          [scenario.entry.id]: scenario.entry,
        }));
        setTimeline((current) => [event, ...current].slice(0, 40));

        if (scenario.matched) {
          toast.success(`Scenario passed: ${scenario.entry.feature}`);
        } else {
          toast.error(`Scenario failed: ${scenario.entry.feature}`);
        }

        queryClient.invalidateQueries(crpc.authDemo.getAuthState.queryFilter());
      },
      onError: (error, variables) => {
        const id = (variables as { id?: string } | undefined)?.id ?? 'scenario';
        const event: TimelineEvent = {
          id: `${id}-error-${nextTimelineSequence()}`,
          scenarioId: id,
          title: `Scenario ${id}`,
          outcome: 'fail',
          at: snapshot.generatedAt,
          payload: {
            error: error.message,
          },
        };
        setTimeline((current) => [event, ...current].slice(0, 40));
        toast.error(error.message || 'Failed to run scenario');
      },
    })
  );

  const signInAnonymous = useMutation({
    mutationFn: async () => {
      if (isAuth && authState?.user.isAnonymous !== true) {
        throw new Error(
          'Sign out first, then click Continue as Guest to create an anonymous session.'
        );
      }
      await authClient.signIn.anonymous({
        fetchOptions: { throw: true },
      });
    },
    onSuccess: () => {
      setInteractiveFlowStatus({
        kind: 'success',
        message: 'Guest session is active.',
      });
      toast.success('Signed in as guest');
      queryClient.invalidateQueries(crpc.authDemo.getAuthState.queryFilter());
    },
    onError: (error: Error) => {
      setInteractiveFlowStatus({
        kind: 'error',
        message: error.message || 'Anonymous sign-in failed.',
      });
      toast.error(error.message || 'Anonymous sign-in failed');
    },
  });

  const linkAnonymousAccount = useMutation({
    mutationFn: async () => {
      const email = upgradeEmail.trim();
      const password = upgradePassword.trim();
      if (!email || !password) {
        throw new Error('Email and password are required to link account.');
      }
      const callbackURL =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth`
          : '/auth';

      await authClient.signUp.email({
        email,
        name: upgradeName.trim() || 'Linked User',
        password,
        callbackURL,
        fetchOptions: { throw: true },
      });
    },
    onSuccess: () => {
      setInteractiveFlowStatus({
        kind: 'success',
        message:
          'Anonymous account upgraded. Refreshing session state for /auth.',
      });
      toast.success('Anonymous account linked to email credentials');
      window.location.assign('/auth');
    },
    onError: (error: Error) => {
      setInteractiveFlowStatus({
        kind: 'error',
        message: error.message || 'Account linking failed.',
      });
      toast.error(error.message || 'Account linking failed');
    },
  });

  const signOut = useMutation(
    useSignOutMutationOptions({
      onSuccess: () => {
        setInteractiveFlowStatus({
          kind: 'success',
          message: 'Signed out.',
        });
        toast.success('Signed out');
        queryClient.invalidateQueries(crpc.authDemo.getAuthState.queryFilter());
      },
      onError: () => {
        setInteractiveFlowStatus({
          kind: 'error',
          message: 'Sign out failed.',
        });
        toast.error('Failed to sign out');
      },
    })
  );

  const effectiveEntries = useMemo(() => {
    const baseEntries = (lastRun?.entries ??
      snapshot.entries) as CoverageEntry[];
    return baseEntries.map((entry) => scenarioOverrides[entry.id] ?? entry);
  }, [lastRun?.entries, scenarioOverrides, snapshot.entries]);

  const summary = useMemo(() => {
    return effectiveEntries.reduce(
      (acc, entry) => {
        acc[entry.status] += 1;
        return acc;
      },
      { supported: 0, partial: 0, blocked: 0, missing: 0 }
    );
  }, [effectiveEntries]);

  const validated = effectiveEntries.filter(matchesExpectation).length;
  const total = effectiveEntries.length;

  const generatedAt = lastRun?.generatedAt ?? snapshot.generatedAt;
  const generatedAtLabel = formatUtcClock(generatedAt);

  const runningScenarioId = (
    runScenario.variables as { id?: string } | undefined
  )?.id;

  const authState = authStateQuery.data as AuthState | undefined;
  const isAnonymousUser = authState?.user.isAnonymous === true;
  const canLinkAnonymous =
    isAnonymousUser &&
    upgradeEmail.trim().length > 0 &&
    upgradePassword.trim().length > 0;
  const interactiveBusy =
    signInAnonymous.isPending ||
    linkAnonymousAccount.isPending ||
    signOut.isPending;

  return (
    <div className="mx-auto max-w-7xl snap-y snap-mandatory @3xl:px-8 px-6 @3xl:py-12 py-8">
      <section className="relative mb-8 min-h-[58vh] snap-start overflow-hidden rounded-3xl border border-zinc-200/80 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-800 p-8 text-zinc-100 shadow-xl">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-12 size-72 rounded-full bg-emerald-400/20 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between gap-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-xs tracking-wide">
              <ShieldUser className="size-3.5" />
              Auth Summary Slides
            </div>
            <h1 className="max-w-4xl font-semibold @lg:text-5xl text-4xl tracking-tight">
              Better Auth anonymous full-surface coverage board.
            </h1>
            <p className="max-w-4xl @lg:text-base text-sm text-zinc-300">
              Runs live anonymous sign-in/link probes, validates onLinkAccount
              migration, and documents static capability contracts.
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
              <p className="mt-1 font-semibold text-2xl">{summary.supported}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Live probes
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {
                  effectiveEntries.filter((entry) => entry.probeMode === 'live')
                    .length
                }
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Static rows
              </p>
              <p className="mt-1 font-semibold text-2xl">
                {
                  effectiveEntries.filter(
                    (entry) => entry.probeMode === 'static'
                  ).length
                }
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-[11px] text-zinc-300 uppercase tracking-[0.14em]">
                Generated
              </p>
              <p className="mt-1 font-semibold text-sm">{generatedAtLabel}</p>
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
                Run Auth Coverage
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-amber-900 text-sm">
                <AlertTriangle className="size-4" />
                Sign in to execute auth probes.
              </div>
            )}
            <Badge className="rounded-full px-3 py-1 font-medium text-xs">
              anonymous plugin observability
            </Badge>
          </div>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-lg tracking-tight">
          Interactive Account Flow
        </h2>
        <p className="mb-4 text-muted-foreground text-sm">
          Human test flow: create guest session, then link that same anonymous
          account to email credentials.
        </p>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Button
            className="gap-2"
            disabled={interactiveBusy || isAnonymousUser}
            onClick={() => signInAnonymous.mutate()}
            variant="secondary"
          >
            {signInAnonymous.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldUser className="size-4" />
            )}
            {isAnonymousUser ? 'Already Guest' : 'Continue as Guest'}
          </Button>

          <Button
            className="gap-2"
            disabled={interactiveBusy || !canLinkAnonymous}
            onClick={() => linkAnonymousAccount.mutate()}
            variant="secondary"
          >
            {linkAnonymousAccount.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Link Anonymous to Email
          </Button>

          <Button
            className="gap-2"
            disabled={interactiveBusy || !isAuth}
            onClick={() => signOut.mutate()}
            variant="ghost"
          >
            {signOut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            Sign Out
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Input
            onChange={(event) => setUpgradeName(event.target.value)}
            placeholder="Name for linked account"
            value={upgradeName}
          />
          <Input
            onChange={(event) => setUpgradeEmail(event.target.value)}
            placeholder="linked@example.com"
            type="email"
            value={upgradeEmail}
          />
          <Input
            onChange={(event) => setUpgradePassword(event.target.value)}
            placeholder="Password"
            type="password"
            value={upgradePassword}
          />
          <Button
            onClick={() => {
              const next = createDemoUpgradeValues();
              setUpgradeName(next.name);
              setUpgradeEmail(next.email);
              setUpgradePassword(next.password);
              setInteractiveFlowStatus(null);
            }}
            variant="secondary"
          >
            Fill Demo Credentials
          </Button>
        </div>

        {interactiveFlowStatus ? (
          <p
            className={cn(
              'mt-3 rounded-md px-3 py-2 text-sm',
              interactiveFlowStatus.kind === 'success'
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-rose-50 text-rose-800'
            )}
          >
            {interactiveFlowStatus.message}
          </p>
        ) : null}
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-lg tracking-tight">
          Scenario Grid
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {STATUS_ORDER.flatMap((status) =>
            effectiveEntries
              .filter((entry) => entry.status === status)
              .map((entry) => {
                const outcome = formatOutcome(entry);
                const running =
                  runScenario.isPending && runningScenarioId === entry.id;

                return (
                  <article
                    className="rounded-2xl border border-border/60 bg-secondary/20 p-4"
                    key={entry.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{entry.feature}</p>
                        <p className="mt-1 text-muted-foreground text-xs">
                          {entry.example}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] uppercase',
                          entry.probeMode === 'live'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-200 text-zinc-700'
                        )}
                      >
                        {entry.probeMode}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs',
                          outcome === 'pass'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        )}
                      >
                        {outcome}
                      </Badge>
                      <Badge className="rounded-full bg-secondary px-2 py-0.5 text-foreground text-xs">
                        {entry.status}
                      </Badge>
                      <Badge className="rounded-full bg-secondary px-2 py-0.5 text-foreground text-xs">
                        {entry.expectation}
                      </Badge>
                      <p className="text-muted-foreground text-xs">
                        {formatProbeSummary(entry)}
                      </p>
                    </div>

                    <p className="mt-3 text-muted-foreground text-xs">
                      {entry.reason}
                    </p>

                    {entry.probe.error && (
                      <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-rose-700 text-xs">
                        {entry.probe.error}
                      </p>
                    )}

                    <div className="mt-3">
                      <Button
                        className="gap-2"
                        disabled={!isAuth || runCoverage.isPending || running}
                        onClick={() =>
                          runScenario.mutate({ id: entry.id as never })
                        }
                        size="sm"
                        variant="secondary"
                      >
                        {running ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5" />
                        )}
                        Run
                      </Button>
                    </div>
                  </article>
                );
              })
          )}
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-lg tracking-tight">Auth Matrix</h2>

        <div className="overflow-x-auto rounded-2xl border border-border/60">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Mode</th>
                <th className="px-3 py-2 text-left">Probe</th>
                <th className="px-3 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {STATUS_ORDER.flatMap((status) =>
                effectiveEntries
                  .filter((entry) => entry.status === status)
                  .map((entry) => (
                    <tr className="border-border/60 border-t" key={entry.id}>
                      <td className="px-3 py-2 align-top">
                        <p className="font-medium">{entry.feature}</p>
                        <p className="text-muted-foreground text-xs">
                          {entry.example}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge className="rounded-full px-2 py-0.5 text-xs">
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <Badge className="rounded-full px-2 py-0.5 text-xs">
                          {entry.probeMode}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <p className="text-xs">{formatProbeSummary(entry)}</p>
                        {entry.probe.error ? (
                          <p className="mt-1 text-rose-600 text-xs">
                            {entry.probe.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        {entry.reason}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8 snap-start rounded-3xl border border-border/60 bg-background p-6 shadow-sm">
        <h2 className="mb-4 font-medium text-lg tracking-tight">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No runs yet. Execute a scenario to see timeline events.
          </p>
        ) : (
          <div className="space-y-2">
            {timeline.map((event) => (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-secondary/10 px-3 py-2"
                key={event.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm">{event.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {event.scenarioId}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs',
                      event.outcome === 'pass'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    )}
                  >
                    {event.outcome === 'pass' ? (
                      <CheckCircle2 className="mr-1 size-3" />
                    ) : (
                      <XCircle className="mr-1 size-3" />
                    )}
                    {event.outcome}
                  </Badge>
                  <Badge className="rounded-full bg-secondary px-2 py-0.5 text-foreground text-xs">
                    <Clock3 className="mr-1 size-3" />
                    {formatUtcClock(event.at)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 grid snap-start @4xl:grid-cols-3 gap-3">
        <JsonBox
          label="Current Snapshot"
          value={{
            ...snapshot,
            entries: effectiveEntries,
            summary,
            total,
            validated,
          }}
        />
        <JsonBox
          label="Auth State"
          value={{
            loading: authStateQuery.isLoading,
            auth: authState ?? null,
          }}
        />
        <JsonBox
          label="Latest Timeline Payload"
          value={timeline[0]?.payload ?? null}
        />
      </section>
    </div>
  );
}
