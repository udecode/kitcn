import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { log, PROJECT_ROOT } from './scaffold-utils';

const DEFAULT_AUTH_SMOKE_URL = 'http://localhost:3005';
const SIGN_UP_PATH = '/api/auth/sign-up/email';
const GET_SESSION_PATH = '/api/auth/get-session';
const URL_PROTOCOL_RE = /^https?:\/\//;
const TRAILING_SLASH_RE = /\/+$/;

type AuthSmokeArgs = {
  target: string | undefined;
  url: string | undefined;
};

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
    return headers.getSetCookie();
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

export const runAuthSmoke = async (argv: string[] = process.argv.slice(2)) => {
  const { target, url } = parseAuthSmokeArgs(argv);
  const baseUrl = resolveAuthSmokeBaseUrl({ target, url });
  const user = createSmokeUser();

  const signUpResponse = await fetch(new URL(SIGN_UP_PATH, baseUrl), {
    body: JSON.stringify(user),
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      origin: baseUrl,
    },
    method: 'POST',
    redirect: 'manual',
  });

  if (!signUpResponse.ok) {
    throw new Error(
      `Auth smoke sign-up failed (${signUpResponse.status}): ${await readResponseBody(signUpResponse)}`
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

  const sessionResponse = await fetch(new URL(GET_SESSION_PATH, baseUrl), {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${signUp.token}`,
      origin: baseUrl,
    },
    redirect: 'manual',
  });

  if (!sessionResponse.ok) {
    throw new Error(
      `Auth smoke get-session failed (${sessionResponse.status}): ${await readResponseBody(sessionResponse)}`
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

  log(`Auth smoke passed against ${baseUrl}.`);
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
