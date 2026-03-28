import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import { parseAuthSmokeArgs, resolveAuthSmokeBaseUrl } from './auth-smoke';
import { log } from './scaffold-utils';

const DEFAULT_AUTH_E2E_TARGET = 'next-auth';
const DEV_BROWSER_URL = 'http://127.0.0.1:9222';
const DEV_BROWSER_TIMEOUT_SECONDS = '45';

type AuthE2EArgs = {
  target: string;
  url: string | undefined;
};

type AuthE2EUser = {
  email: string;
  name: string;
  password: string;
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

export const buildAuthE2EScript = ({
  baseUrl,
  user,
}: {
  baseUrl: string;
  user: AuthE2EUser;
}) =>
  `
const page = await browser.newPage();
await page.goto(${JSON.stringify(`${baseUrl}/auth`)}, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: ${JSON.stringify("Don't have an account? Sign up")} }).click();
await page.getByPlaceholder("Name").fill(${JSON.stringify(user.name)});
await page.getByPlaceholder("Email").fill(${JSON.stringify(user.email)});
await page.getByPlaceholder("Password").fill(${JSON.stringify(user.password)});
await page.getByRole("button", { name: "Create account" }).click();
await page.getByText("Signed in").waitFor({ timeout: 10000 });
const signedInBody = await page.locator("body").innerText();
if (!signedInBody.includes("Signed in")) {
  throw new Error("Auth E2E never reached the signed-in view.\\n" + signedInBody);
}
if (!signedInBody.includes(${JSON.stringify(user.email)})) {
  throw new Error(${JSON.stringify(
    `Auth E2E signed-in view did not show ${user.email}.`
  )} + "\\n" + signedInBody);
}
await page.getByRole("button", { name: "Sign out" }).click();
await page.getByText("Auth demo").waitFor({ timeout: 10000 });
const signedOutBody = await page.locator("body").innerText();
if (signedOutBody.includes("Signed in")) {
  throw new Error("Auth E2E stayed signed in after sign out.\\n" + signedOutBody);
}
if (!signedOutBody.includes("Auth demo")) {
  throw new Error("Auth E2E did not return to the signed-out auth view.\\n" + signedOutBody);
}
console.log(JSON.stringify({ url: page.url(), email: ${JSON.stringify(user.email)} }));
`.trim();

const runDevBrowserScript = (script: string) => {
  const result = spawnSync(
    'dev-browser',
    ['--connect', DEV_BROWSER_URL, '--timeout', DEV_BROWSER_TIMEOUT_SECONDS],
    {
      input: script,
      encoding: 'utf8',
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const detail = stderr || stdout || 'unknown dev-browser failure';
    throw new Error(
      `dev-browser auth E2E failed with exit ${result.status}: ${detail}`
    );
  }

  return result.stdout.trim();
};

export const runAuthE2E = async (argv: string[] = process.argv.slice(2)) => {
  const { target, url } = parseAuthE2EArgs(argv);
  const baseUrl = resolveAuthSmokeBaseUrl({ target, url });
  const user = createAuthE2EUser();
  runDevBrowserScript(buildAuthE2EScript({ baseUrl, user }));
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
