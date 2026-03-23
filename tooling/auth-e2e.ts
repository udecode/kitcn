import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { parseAuthSmokeArgs, resolveAuthSmokeBaseUrl } from './auth-smoke';
import { log } from './scaffold-utils';

const DEFAULT_AUTH_E2E_TARGET = 'next-auth';
const AUTH_E2E_SESSION = 'better-convex-auth-e2e';

type AuthE2EArgs = {
  target: string;
  url: string | undefined;
};

type AuthE2EUser = {
  email: string;
  name: string;
  password: string;
};

type AuthE2EPageState = {
  body: string;
  url: string;
};

export const parseAuthE2EArgs = (argv: string[]): AuthE2EArgs => {
  const { target, url } = parseAuthSmokeArgs(argv);
  return {
    target: target ?? DEFAULT_AUTH_E2E_TARGET,
    url,
  };
};

const createAuthE2EUser = (): AuthE2EUser => {
  const nonce = randomUUID();
  return {
    email: `e2e+${nonce}@example.com`,
    name: 'Browser E2E',
    password: 'BrowserPassword123!',
  };
};

export const buildAuthE2ECommands = ({
  baseUrl,
  user,
}: {
  baseUrl: string;
  user: AuthE2EUser;
}) =>
  [
    ['open', `${baseUrl}/auth`],
    [
      'find',
      'role',
      'button',
      'click',
      '--name',
      "Don't have an account? Sign up",
    ],
    ['find', 'placeholder', 'Name', 'fill', user.name],
    ['find', 'placeholder', 'Email', 'fill', user.email],
    ['find', 'placeholder', 'Password', 'fill', user.password],
    ['find', 'role', 'button', 'click', '--name', 'Create account'],
    ['find', 'role', 'button', 'click', '--name', 'Sign out'],
  ] as const;

const runAgentBrowserCommand = ({
  args,
  session,
}: {
  args: readonly string[];
  session: string;
}) => {
  const result = spawnSync('agent-browser', ['--session', session, ...args], {
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const detail = stderr || stdout || 'unknown agent-browser failure';
    throw new Error(
      `agent-browser ${args.join(' ')} failed with exit ${result.status}: ${detail}`
    );
  }

  return result.stdout.trim();
};

const parsePageStateValue = (value: unknown): AuthE2EPageState => {
  if (typeof value === 'string') {
    return parsePageStateValue(JSON.parse(value));
  }

  return {
    body:
      value && typeof value === 'object' && 'body' in value
        ? typeof value.body === 'string'
          ? value.body
          : ''
        : '',
    url:
      value && typeof value === 'object' && 'url' in value
        ? typeof value.url === 'string'
          ? value.url
          : ''
        : '',
  } satisfies AuthE2EPageState;
};

export const parsePageState = (value: string) =>
  parsePageStateValue(JSON.parse(value));

const getPageState = (session: string) =>
  parsePageState(
    runAgentBrowserCommand({
      session,
      args: [
        'eval',
        'JSON.stringify({ url: window.location.href, body: document.body.innerText })',
      ],
    })
  );

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPageText = async ({
  session,
  text,
  timeoutMs = 10_000,
}: {
  session: string;
  text: string;
  timeoutMs?: number;
}) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = getPageState(session);
    if (state.body.includes(text)) {
      return state;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for page text "${text}".`);
};

const assertSignedInState = (state: AuthE2EPageState, email: string) => {
  if (!state.body.includes('Signed in')) {
    throw new Error(
      `Auth E2E never reached the signed-in view.\n${state.body}`
    );
  }

  if (!state.body.includes(email)) {
    throw new Error(
      `Auth E2E signed-in view did not show ${email}.\n${state.body}`
    );
  }
};

const assertSignedOutState = (state: AuthE2EPageState) => {
  if (state.body.includes('Signed in')) {
    throw new Error(`Auth E2E stayed signed in after sign out.\n${state.body}`);
  }

  if (!state.body.includes('Auth demo')) {
    throw new Error(
      `Auth E2E did not return to the signed-out auth view.\n${state.body}`
    );
  }
};

export const runAuthE2E = async (argv: string[] = process.argv.slice(2)) => {
  const { target, url } = parseAuthE2EArgs(argv);
  const baseUrl = resolveAuthSmokeBaseUrl({ target, url });
  const user = createAuthE2EUser();
  const commands = buildAuthE2ECommands({ baseUrl, user });
  const session = `${AUTH_E2E_SESSION}-${Date.now()}`;

  for (const command of commands.slice(0, 6)) {
    runAgentBrowserCommand({ args: command, session });
  }

  const signedInState = await waitForPageText({
    session,
    text: 'Signed in',
  });
  runAgentBrowserCommand({ args: commands[6]!, session });
  const signedOutState = await waitForPageText({
    session,
    text: 'Auth demo',
  });

  assertSignedInState(signedInState, user.email);
  assertSignedOutState(signedOutState);
  log(`Auth E2E passed against ${baseUrl}.`);
};

if (import.meta.main) {
  try {
    await runAuthE2E();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
