import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { log, PROJECT_ROOT } from './scaffold-utils';

const DEFAULT_AUTH_SMOKE_URL = 'http://localhost:3005';
const SIGN_UP_PATH = '/api/auth/sign-up/email';
const GET_SESSION_PATH = '/api/auth/get-session';
const URL_PROTOCOL_RE = /^https?:\/\//;
const TRAILING_SLASH_RE = /\/+$/;
const AUTH_SMOKE_ATTEMPTS = 10;
const AUTH_SMOKE_RETRY_DELAY_MS = 1000;
const RETRYABLE_AUTH_SMOKE_STATUSES = new Set([502, 503, 504]);

type AuthSmokeArgs = {
  target: string | undefined;
  url: string | undefined;
};

type RunAuthSmokeOptions = {
  attempts?: number;
  fetchFn?: typeof fetch;
  logFn?: typeof log;
  retryDelayMs?: number;
};

class AuthSmokeRequestError extends Error {
  status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'AuthSmokeRequestError';
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const formatUnknownError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isRetryableAuthSmokeError = (error: unknown) =>
  error instanceof AuthSmokeRequestError &&
  (error.status === undefined ||
    RETRYABLE_AUTH_SMOKE_STATUSES.has(error.status));

const trimTrailingSlash = (value: string) =>
  value.replace(TRAILING_SLASH_RE, '');

export const parseAuthSmokeArgs = (argv: string[]): AuthSmokeArgs => {
  let target: string | undefined;
  let url: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(
          'Usage: bun tooling/auth-smoke.ts [scenario-name|url] [--url <base-url>]'
        );
      }
      url = value;
      index += 1;
      continue;
    }

    if (!target) {
      target = arg;
      continue;
    }

    throw new Error(
      `Unknown auth smoke argument "${arg}". Expected one target plus optional --url.`
    );
  }

  return { target, url };
};

const readScenarioSiteUrl = (projectRoot: string, target: string) => {
  const envLocalPath = path.join(
    projectRoot,
    'tmp',
    'scenarios',
    target,
    'project',
    '.env.local'
  );
  if (!existsSync(envLocalPath)) {
    return undefined;
  }

  const parsed = parseEnv(readFileSync(envLocalPath, 'utf8'));
  return parsed.NEXT_PUBLIC_SITE_URL ?? parsed.VITE_SITE_URL;
};

export const resolveAuthSmokeBaseUrl = ({
  projectRoot = PROJECT_ROOT,
  target,
  url,
}: {
  projectRoot?: string;
  target?: string;
  url?: string;
}) => {
  if (url) {
    return trimTrailingSlash(url);
  }
  if (target && URL_PROTOCOL_RE.test(target)) {
    return trimTrailingSlash(target);
  }
  if (target) {
    const scenarioSiteUrl = readScenarioSiteUrl(projectRoot, target);
    if (scenarioSiteUrl) {
      return trimTrailingSlash(scenarioSiteUrl);
    }
  }

  return DEFAULT_AUTH_SMOKE_URL;
};

export const buildCookieHeader = (setCookieValues: readonly string[]) => {
  const cookiePairs = setCookieValues
    .map((value) => value.split(';')[0]?.trim())
    .filter((value): value is string => Boolean(value));
  if (cookiePairs.length === 0) {
    return null;
  }
  return cookiePairs.join('; ');
};

const getSetCookieValues = (headers: Headers) => {
  if (typeof headers.getSetCookie === 'function') {
    const setCookieValues = headers.getSetCookie();
    if (setCookieValues.length > 0) {
      return setCookieValues;
    }
  }

  const rawHeader = headers.get('set-cookie');
  return rawHeader ? [rawHeader] : [];
};

const readResponseBody = async (response: Response) => {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return JSON.stringify(await response.json());
  }
  return await response.text();
};

const createSmokeUser = () => {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    email: `smoke+${nonce}@example.com`,
    name: 'Smoke Test',
    password: 'SmokePassword123!',
  };
};

const fetchAuthSmoke = async (
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  label: string
) => {
  try {
    return await fetchFn(url, init);
  } catch (error) {
    throw new AuthSmokeRequestError(
      `Auth smoke ${label} request failed: ${formatUnknownError(error)}`
    );
  }
};

const runAuthSmokeAttempt = async (baseUrl: string, fetchFn: typeof fetch) => {
  const user = createSmokeUser();

  const signUpResponse = await fetchAuthSmoke(
    fetchFn,
    new URL(SIGN_UP_PATH, baseUrl),
    {
      body: JSON.stringify(user),
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        origin: baseUrl,
      },
      method: 'POST',
      redirect: 'manual',
    },
    'sign-up'
  );

  if (!signUpResponse.ok) {
    throw new AuthSmokeRequestError(
      `Auth smoke sign-up failed (${signUpResponse.status}): ${await readResponseBody(signUpResponse)}`,
      signUpResponse.status
    );
  }

  const cookieHeader = buildCookieHeader(
    getSetCookieValues(signUpResponse.headers)
  );
  if (!cookieHeader) {
    throw new Error('Auth smoke sign-up did not return an auth cookie.');
  }

  const signUp = (await signUpResponse.json()) as {
    token?: string;
    user?: {
      email?: string;
    } | null;
  };

  if (!signUp.token) {
    throw new Error('Auth smoke sign-up did not return a bearer token.');
  }

  const sessionResponse = await fetchAuthSmoke(
    fetchFn,
    new URL(GET_SESSION_PATH, baseUrl),
    {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${signUp.token}`,
        origin: baseUrl,
      },
      redirect: 'manual',
    },
    'get-session'
  );

  if (!sessionResponse.ok) {
    throw new AuthSmokeRequestError(
      `Auth smoke get-session failed (${sessionResponse.status}): ${await readResponseBody(sessionResponse)}`,
      sessionResponse.status
    );
  }

  const session = (await sessionResponse.json()) as {
    user?: {
      email?: string;
    } | null;
  } | null;

  if (session?.user?.email !== user.email) {
    throw new Error(
      `Auth smoke session mismatch. Expected ${user.email}, got ${session?.user?.email ?? 'null'}.`
    );
  }
};

export const runAuthSmoke = async (
  argv: string[] = process.argv.slice(2),
  options: RunAuthSmokeOptions = {}
) => {
  const { target, url } = parseAuthSmokeArgs(argv);
  const baseUrl = resolveAuthSmokeBaseUrl({ target, url });
  const attempts = options.attempts ?? AUTH_SMOKE_ATTEMPTS;
  const fetchFn = options.fetchFn ?? fetch;
  const logFn = options.logFn ?? log;
  const retryDelayMs = options.retryDelayMs ?? AUTH_SMOKE_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runAuthSmokeAttempt(baseUrl, fetchFn);
      logFn(`Auth smoke passed against ${baseUrl}.`);
      return;
    } catch (error) {
      if (attempt === attempts || !isRetryableAuthSmokeError(error)) {
        throw error;
      }

      logFn(
        `Auth smoke retry ${attempt + 1}/${attempts} after ${formatUnknownError(error)}.`
      );
      await sleep(retryDelayMs);
    }
  }
};

if (import.meta.main) {
  try {
    await runAuthSmoke();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
