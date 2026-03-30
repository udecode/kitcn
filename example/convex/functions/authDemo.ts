import { z } from 'zod';
import { authAction, authQuery } from '../lib/crpc';
import { getEnv } from '../lib/get-env';
import {
  AUTH_DEMO_ANON_EMAIL_DOMAIN,
  AUTH_DEMO_ANON_NAME_PREFIX,
} from '../shared/auth-anonymous-demo';
import {
  AUTH_COVERAGE_DEFINITIONS,
  AUTH_LIVE_PROBE_IDS,
  type AuthCoverageDefinition,
  type AuthCoverageExpectation,
  type AuthCoverageId,
  type AuthCoverageProbeResult,
  type AuthCoverageStatus,
  createStaticProbeResult,
} from './authDemo.coverage';
import { createAuthDemoDataCaller } from './generated/authDemoData.runtime';

type ProbeResult = AuthCoverageProbeResult;

type AuthCoverageEntry = AuthCoverageDefinition & {
  probe: ProbeResult;
};

type AuthCoverageSnapshot = {
  generatedAt: string;
  entries: AuthCoverageEntry[];
  summary: Record<AuthCoverageStatus, number>;
  validated: number;
  total: number;
};

type DemoSignals = {
  ip: string;
  userAgent: string;
};

type StoredSession = {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

type StoredUser = {
  id: string;
  email: string;
  name: string;
  isAnonymous: boolean;
  bio: string | null;
};

type AnonymousSignInFlow = {
  token: string;
  sessionCookie: string;
  session: StoredSession;
  user: StoredUser;
  signals: DemoSignals;
};

type LinkFlow = {
  sourceAnonymousUserId: string;
  sourceAnonymousBio: string;
  linkedUser: StoredUser;
  sourceDeleted: boolean;
  linkedToken: string | null;
};

type DemoActionCtx = Parameters<typeof createAuthDemoDataCaller>[0];

type DemoDataCaller = {
  getSessionByToken(input: { token: string }): Promise<StoredSession | null>;
  getUserById(input: { id: string }): Promise<StoredUser | null>;
  setUserBio(input: { id: string; bio: string }): Promise<null>;
};

type HttpAuthResponse = {
  sessionCookie: string | null;
  token: string | null;
  user: {
    id: string | null;
    email: string | null;
    name: string | null;
    isAnonymous: boolean | null;
  };
};

const COVERAGE_IDS = AUTH_COVERAGE_DEFINITIONS.map((entry) => entry.id) as [
  AuthCoverageId,
  ...AuthCoverageId[],
];

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid JSON payload.`);
  }
  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string
): string | null {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string
): boolean | null {
  const value = record[key];
  return typeof value === 'boolean' ? value : null;
}

function randomSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDemoSignals(): DemoSignals {
  const suffix = Math.floor(Math.random() * 200) + 20;
  return {
    ip: `198.51.100.${suffix}`,
    userAgent: `kitcn-auth-demo/${randomSuffix()}`,
  };
}

function createAuthRequestHeaders({
  signals,
  siteUrl,
  sessionCookie,
}: {
  signals: DemoSignals;
  siteUrl: string;
  sessionCookie?: string;
}): Headers {
  const headers = new Headers({
    accept: 'application/json',
    'content-type': 'application/json',
    origin: siteUrl,
    referer: siteUrl,
    'user-agent': signals.userAgent,
    'x-forwarded-for': signals.ip,
  });

  if (sessionCookie) {
    headers.set('cookie', sessionCookie);
  }

  return headers;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();

  if (text.length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Auth route returned invalid JSON (${response.status} ${response.statusText}).`
    );
  }
}

function getResponseMessage(payload: unknown): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directMessage = readString(record, 'message');
  if (directMessage) {
    return directMessage;
  }

  const nestedError = record.error;
  if (
    typeof nestedError === 'object' &&
    nestedError !== null &&
    !Array.isArray(nestedError)
  ) {
    return readString(nestedError as Record<string, unknown>, 'message');
  }

  return null;
}

function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) {
    return null;
  }

  const marker = 'better-auth.session_token=';
  const start = setCookieHeader.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const rest = setCookieHeader.slice(start);
  const end = rest.indexOf(';');
  return end === -1 ? rest : rest.slice(0, end);
}

function parseAuthResponse(payload: unknown): HttpAuthResponse {
  const record = asRecord(payload, 'Auth route');
  const rawUser = record.user;
  const userRecord =
    typeof rawUser === 'object' && rawUser !== null && !Array.isArray(rawUser)
      ? (rawUser as Record<string, unknown>)
      : {};

  return {
    sessionCookie: null,
    token: readString(record, 'token'),
    user: {
      id: readString(userRecord, 'id'),
      email: readString(userRecord, 'email'),
      name: readString(userRecord, 'name'),
      isAnonymous: readBoolean(userRecord, 'isAnonymous'),
    },
  };
}

async function callAuthRoute({
  path,
  body,
  signals,
  siteUrl,
  sessionCookie,
}: {
  path: string;
  body: Record<string, unknown>;
  signals: DemoSignals;
  siteUrl: string;
  sessionCookie?: string;
}): Promise<HttpAuthResponse> {
  const response = await fetch(new URL(path, siteUrl), {
    method: 'POST',
    headers: createAuthRequestHeaders({
      signals,
      siteUrl,
      sessionCookie,
    }),
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message =
      getResponseMessage(payload) ??
      `${response.status} ${response.statusText}`;
    throw new Error(`Auth route ${path} failed: ${message}`);
  }

  return {
    ...parseAuthResponse(payload),
    sessionCookie: extractSessionCookie(response.headers.get('set-cookie')),
  };
}

function buildSummary(
  entries: AuthCoverageEntry[]
): Record<AuthCoverageStatus, number> {
  return entries.reduce(
    (acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1;
      return acc;
    },
    {
      supported: 0,
      partial: 0,
      blocked: 0,
      missing: 0,
    } as Record<AuthCoverageStatus, number>
  );
}

function matchesExpectation(
  expectation: AuthCoverageExpectation,
  probe: ProbeResult
): boolean {
  if (expectation === 'failure') {
    return !probe.ok;
  }
  return probe.ok;
}

async function runProbe(probe: () => Promise<unknown>): Promise<ProbeResult> {
  const startedAt = Date.now();

  try {
    const value = await probe();
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      error: null,
      errorCode: null,
      value,
    };
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: asErrorMessage(error),
      errorCode: 'PROBE_FAILED',
    };
  }
}

async function createAnonymousSignInFlow({
  caller,
  siteUrl,
}: {
  caller: DemoDataCaller;
  siteUrl: string;
}): Promise<AnonymousSignInFlow> {
  const signals = createDemoSignals();
  const signInResult = await callAuthRoute({
    path: '/api/auth/sign-in/anonymous',
    body: {},
    signals,
    siteUrl,
  });

  const token = signInResult.token;
  if (!token) {
    throw new Error('Anonymous sign-in did not return a session token.');
  }
  const sessionCookie = signInResult.sessionCookie;
  if (!sessionCookie) {
    throw new Error('Anonymous sign-in did not return a session cookie.');
  }

  const session = await caller.getSessionByToken({ token });
  if (!session) {
    throw new Error('Anonymous sign-in did not persist a session row.');
  }

  const user = await caller.getUserById({ id: session.userId });
  if (!user) {
    throw new Error('Anonymous sign-in did not persist a user row.');
  }

  return {
    token,
    sessionCookie,
    session,
    user,
    signals,
  };
}

async function createAnonymousLinkFlow({
  caller,
  siteUrl,
}: {
  caller: DemoDataCaller;
  siteUrl: string;
}): Promise<LinkFlow> {
  const anonymous = await createAnonymousSignInFlow({
    caller,
    siteUrl,
  });
  const sourceAnonymousBio = `anon-bio-${randomSuffix()}`;

  await caller.setUserBio({
    id: anonymous.user.id,
    bio: sourceAnonymousBio,
  });

  const signUpResult = await callAuthRoute({
    path: '/api/auth/sign-up/email',
    body: {
      name: `Linked User ${randomSuffix()}`,
      email: `anon-link-${randomSuffix()}@example.com`,
      password: `DemoPassword!${Math.floor(Math.random() * 99_999)}Aa`,
    },
    signals: anonymous.signals,
    siteUrl,
    sessionCookie: anonymous.sessionCookie,
  });

  const linkedUserId = signUpResult.user.id;
  if (!linkedUserId) {
    throw new Error('Email sign-up did not return a linked user.');
  }

  const linkedUser = await caller.getUserById({ id: linkedUserId });
  if (!linkedUser) {
    throw new Error('Linked user was not found in storage.');
  }

  const sourceAfter = await caller.getUserById({
    id: anonymous.user.id,
  });

  return {
    sourceAnonymousUserId: anonymous.user.id,
    sourceAnonymousBio,
    linkedToken: signUpResult.token,
    linkedUser,
    sourceDeleted: sourceAfter === null,
  };
}

function buildLiveProbes({
  caller,
  siteUrl,
}: {
  caller: DemoDataCaller;
  siteUrl: string;
}) {
  return {
    'anonymous-sign-in': async () => {
      const flow = await createAnonymousSignInFlow({
        caller,
        siteUrl,
      });
      return {
        tokenPresent: flow.token.length > 0,
        sessionId: flow.session.id,
        userId: flow.user.id,
        ipAddress: flow.session.ipAddress,
        userAgent: flow.session.userAgent,
      };
    },
    'anonymous-flag': async () => {
      const flow = await createAnonymousSignInFlow({
        caller,
        siteUrl,
      });
      if (!flow.user.isAnonymous) {
        throw new Error(
          'Expected anonymous user to be marked isAnonymous=true.'
        );
      }
      return {
        isAnonymous: flow.user.isAnonymous,
        userId: flow.user.id,
      };
    },
    'anonymous-email-domain': async () => {
      const flow = await createAnonymousSignInFlow({
        caller,
        siteUrl,
      });
      if (!flow.user.email.endsWith(`@${AUTH_DEMO_ANON_EMAIL_DOMAIN}`)) {
        throw new Error(
          `Expected anonymous email domain @${AUTH_DEMO_ANON_EMAIL_DOMAIN}, got ${flow.user.email}`
        );
      }
      return {
        email: flow.user.email,
        expectedDomain: AUTH_DEMO_ANON_EMAIL_DOMAIN,
      };
    },
    'anonymous-generate-name': async () => {
      const flow = await createAnonymousSignInFlow({
        caller,
        siteUrl,
      });
      if (!flow.user.name.startsWith(AUTH_DEMO_ANON_NAME_PREFIX)) {
        throw new Error(
          `Expected generated name to start with ${AUTH_DEMO_ANON_NAME_PREFIX}`
        );
      }
      return {
        name: flow.user.name,
        expectedPrefix: AUTH_DEMO_ANON_NAME_PREFIX,
      };
    },
    'link-account-non-anonymous': async () => {
      const flow = await createAnonymousLinkFlow({
        caller,
        siteUrl,
      });
      if (flow.linkedUser.isAnonymous) {
        throw new Error('Expected linked user to be non-anonymous.');
      }
      return {
        linkedUserId: flow.linkedUser.id,
        linkedEmail: flow.linkedUser.email,
        linkedIsAnonymous: flow.linkedUser.isAnonymous,
      };
    },
    'on-link-account-bio-migration': async () => {
      const flow = await createAnonymousLinkFlow({
        caller,
        siteUrl,
      });
      if (flow.linkedUser.bio !== flow.sourceAnonymousBio) {
        throw new Error('Expected onLinkAccount to migrate anonymous bio.');
      }
      return {
        sourceAnonymousUserId: flow.sourceAnonymousUserId,
        migratedBio: flow.linkedUser.bio,
      };
    },
    'linked-source-anonymous-deleted': async () => {
      const flow = await createAnonymousLinkFlow({
        caller,
        siteUrl,
      });
      if (!flow.sourceDeleted) {
        throw new Error(
          'Expected source anonymous user to be deleted after linking.'
        );
      }
      return {
        linkedToken: flow.linkedToken,
        sourceAnonymousUserId: flow.sourceAnonymousUserId,
        sourceDeleted: flow.sourceDeleted,
      };
    },
  } satisfies Record<
    Exclude<
      AuthCoverageId,
      | 'disable-delete-anonymous-user-option'
      | 'generate-random-email-precedence'
    >,
    () => Promise<unknown>
  >;
}

function runScenarioImpl(ctx: DemoActionCtx) {
  const caller = createAuthDemoDataCaller(ctx) as DemoDataCaller;
  const siteUrl = getEnv().SITE_URL;
  const liveProbes = buildLiveProbes({
    caller,
    siteUrl,
  });

  return async (id: AuthCoverageId): Promise<AuthCoverageEntry> => {
    const definition = AUTH_COVERAGE_DEFINITIONS.find(
      (entry) => entry.id === id
    );
    if (!definition) {
      throw new Error(`Unknown auth coverage id: ${id}`);
    }

    if (!AUTH_LIVE_PROBE_IDS.has(id)) {
      return {
        ...definition,
        probe: createStaticProbeResult(definition),
      };
    }

    const liveProbe = liveProbes[id as keyof typeof liveProbes];
    if (!liveProbe) {
      throw new Error(`Missing live probe implementation for ${id}`);
    }

    const probe = await runProbe(liveProbe);
    return {
      ...definition,
      probe,
    };
  };
}

export const getSnapshot = authQuery.query(async () => {
  const entries = AUTH_COVERAGE_DEFINITIONS.map((entry) => ({
    ...entry,
    probe: {
      ok: false,
      elapsedMs: 0,
      error: null,
      errorCode: null,
    } satisfies ProbeResult,
  }));

  return {
    generatedAt: new Date().toISOString(),
    entries,
    summary: buildSummary(entries),
    validated: 0,
    total: entries.length,
  } satisfies AuthCoverageSnapshot;
});

export const getAuthState = authQuery.query(async ({ ctx }) => {
  const session = await ctx.orm.query.session.findFirst({
    where: { userId: ctx.userId },
  });

  return {
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      isAnonymous: ctx.user.isAnonymous ?? null,
      bio: ctx.user.bio ?? null,
    },
    session: session
      ? {
          id: session.id,
          tokenPreview: session.token.slice(0, 10),
          ipAddress: session.ipAddress ?? null,
          userAgent: session.userAgent ?? null,
        }
      : null,
  };
});

export const runScenario = authAction
  .input(
    z.object({
      id: z.enum(COVERAGE_IDS),
    })
  )
  .action(async ({ ctx, input }) => {
    const execute = runScenarioImpl(ctx);
    const entry = await execute(input.id);

    return {
      generatedAt: new Date().toISOString(),
      entry,
      matched: matchesExpectation(entry.expectation, entry.probe),
    };
  });

export const runCoverage = authAction.action(async ({ ctx }) => {
  const execute = runScenarioImpl(ctx);

  const entries = await Promise.all(
    AUTH_COVERAGE_DEFINITIONS.map(async (definition) => execute(definition.id))
  );

  const validated = entries.filter((entry) =>
    matchesExpectation(entry.expectation, entry.probe)
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    entries,
    summary: buildSummary(entries),
    validated,
    total: entries.length,
  } satisfies AuthCoverageSnapshot;
});
