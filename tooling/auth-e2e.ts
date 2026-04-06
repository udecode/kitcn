import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseAuthSmokeArgs, resolveAuthSmokeBaseUrl } from './auth-smoke';
import { log } from './scaffold-utils';

const DEFAULT_AUTH_E2E_TARGET = 'next-auth';
const DEV_BROWSER_URL = 'http://127.0.0.1:9222';
const DEV_BROWSER_TIMEOUT_SECONDS = '45';
const AUTH_E2E_WAIT_TIMEOUT_MS = 20_000;

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
await page.getByText("Signed in").waitFor({ timeout: ${AUTH_E2E_WAIT_TIMEOUT_MS} });
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
await page.getByText("Auth demo").waitFor({ timeout: ${AUTH_E2E_WAIT_TIMEOUT_MS} });
const signedOutBody = await page.locator("body").innerText();
if (signedOutBody.includes("Signed in")) {
  throw new Error("Auth E2E stayed signed in after sign out.\\n" + signedOutBody);
}
if (!signedOutBody.includes("Auth demo")) {
  throw new Error("Auth E2E did not return to the signed-out auth view.\\n" + signedOutBody);
}
console.log(JSON.stringify({ url: page.url(), email: ${JSON.stringify(user.email)} }));
`.trim();

const hasDevBrowserBinary = () =>
  spawnSync('which', ['dev-browser'], {
    encoding: 'utf8',
  }).status === 0;

type DevToolsTarget = {
  id: string;
  webSocketDebuggerUrl: string;
};

const resolveDevToolsVersion = async () => {
  const response = await fetch(`${DEV_BROWSER_URL}/json/version`);
  if (!response.ok) {
    throw new Error(
      `Failed to read Chrome DevTools version metadata from ${DEV_BROWSER_URL}/json/version.`
    );
  }

  const body = (await response.json()) as {
    webSocketDebuggerUrl?: string;
  };

  if (!body.webSocketDebuggerUrl) {
    throw new Error(
      `Chrome DevTools metadata at ${DEV_BROWSER_URL}/json/version did not include webSocketDebuggerUrl.`
    );
  }

  return body;
};

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

const openDevToolsPage = async (url: string): Promise<DevToolsTarget> => {
  const response = await fetch(
    `${DEV_BROWSER_URL}/json/new?${encodeURIComponent(url)}`,
    {
      method: 'PUT',
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to open a debug page for ${url}.`);
  }

  const body = (await response.json()) as Partial<DevToolsTarget>;
  if (!body.id || !body.webSocketDebuggerUrl) {
    throw new Error(
      `Chrome DevTools did not return a debuggable page for ${url}.`
    );
  }

  return {
    id: body.id,
    webSocketDebuggerUrl: body.webSocketDebuggerUrl,
  };
};

const closeDevToolsPage = async (targetId: string) => {
  await fetch(`${DEV_BROWSER_URL}/json/close/${targetId}`);
};

type CdpClient = {
  close: () => void;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
};

const createCdpClient = async (
  webSocketDebuggerUrl: string
): Promise<CdpClient> => {
  const version = await resolveDevToolsVersion();
  const socket = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >();

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timed out connecting to Chrome DevTools at ${version.webSocketDebuggerUrl}.`
        )
      );
    }, 15_000);

    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to connect to Chrome DevTools at ${version.webSocketDebuggerUrl}.`
        )
      );
    });
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      error?: { message?: string };
      result?: unknown;
    };

    if (typeof message.id !== 'number') {
      return;
    }

    const entry = pending.get(message.id);
    if (!entry) {
      return;
    }

    pending.delete(message.id);

    if (message.error?.message) {
      entry.reject(new Error(message.error.message));
      return;
    }

    entry.resolve(message.result);
  });

  return {
    close: () => {
      socket.close();
    },
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
  };
};

const evaluateOnPage = async (
  cdp: CdpClient,
  expression: string,
  label: string
) => {
  const result = (await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })) as {
    result?: { value?: unknown };
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };

  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ??
      'unknown browser evaluation failure';
    throw new Error(`${label}: ${detail}`);
  }

  return result.result?.value;
};

const waitForPageCondition = async ({
  cdp,
  expression,
  timeoutMs = AUTH_E2E_WAIT_TIMEOUT_MS,
}: {
  cdp: CdpClient;
  expression: string;
  timeoutMs?: number;
}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await evaluateOnPage(cdp, expression);
    if (value) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for browser condition: ${expression}`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runCdpAuthE2E = async ({
  baseUrl,
  user,
}: {
  baseUrl: string;
  user: AuthE2EUser;
}) => {
  const target = await openDevToolsPage(`${baseUrl}/auth`);
  const cdp = await createCdpClient(target.webSocketDebuggerUrl);

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await waitForPageCondition({
      cdp,
      expression:
        'document.readyState === "complete" || document.readyState === "interactive"',
    });
    await waitForPageCondition({
      cdp,
      expression: `(document.body?.innerText ?? "").includes("Auth demo") || [...document.querySelectorAll("button")].some((candidate) => candidate.textContent?.trim() === "Don't have an account? Sign up")`,
    });
    await sleep(2000);
    await waitForPageCondition({
      cdp,
      expression: `(document.body?.innerText ?? "").includes("Auth demo") || [...document.querySelectorAll("button")].some((candidate) => candidate.textContent?.trim() === "Don't have an account? Sign up")`,
    });
    await evaluateOnPage(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent?.trim() === "Don't have an account? Sign up"
        );
        if (!button) throw new Error("Could not find sign-up toggle button.");
        button.click();
        return true;
      })()`,
      'toggle sign-up mode'
    );
    await waitForPageCondition({
      cdp,
      expression:
        'document.querySelector(\'input[placeholder="Name"]\') instanceof HTMLInputElement',
    });
    await evaluateOnPage(
      cdp,
      `(() => {
        const input = document.querySelector('input[placeholder="Name"]');
        if (!(input instanceof HTMLInputElement)) throw new Error("Could not find Name input.");
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        );
        descriptor?.set?.call(input, ${JSON.stringify(user.name)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      'fill name'
    );
    await evaluateOnPage(
      cdp,
      `(() => {
        const input = document.querySelector('input[placeholder="Email"]');
        if (!(input instanceof HTMLInputElement)) throw new Error("Could not find Email input.");
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        );
        descriptor?.set?.call(input, ${JSON.stringify(user.email)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      'fill email'
    );
    await evaluateOnPage(
      cdp,
      `(() => {
        const input = document.querySelector('input[placeholder="Password"]');
        if (!(input instanceof HTMLInputElement)) throw new Error("Could not find Password input.");
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value'
        );
        descriptor?.set?.call(input, ${JSON.stringify(user.password)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`,
      'fill password'
    );
    await evaluateOnPage(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent?.trim() === "Create account"
        );
        if (!button) throw new Error("Could not find Create account button.");
        const form = button.closest('form');
        if (form instanceof HTMLFormElement) {
          form.requestSubmit();
        } else {
          button.click();
        }
        return true;
      })()`,
      'submit sign-up'
    );
    await waitForPageCondition({
      cdp,
      expression:
        'document.readyState === "complete" || document.readyState === "interactive"',
    });

    try {
      await waitForPageCondition({
        cdp,
        expression: '(document.body?.innerText ?? "").includes("Signed in")',
        timeoutMs: AUTH_E2E_WAIT_TIMEOUT_MS,
      });
    } catch (_error) {
      const currentBody = String(
        await evaluateOnPage(
          cdp,
          'document.body?.innerText ?? ""',
          'read timeout body'
        )
      );
      throw new Error(
        `Timed out waiting for signed-in view.\n${currentBody || '<empty body>'}`
      );
    }

    const signedInBody = String(
      await evaluateOnPage(
        cdp,
        'document.body?.innerText ?? ""',
        'read signed-in body'
      )
    );
    if (!signedInBody.includes('Signed in')) {
      throw new Error(
        `Auth E2E never reached the signed-in view.\n${signedInBody}`
      );
    }
    if (!signedInBody.includes(user.email)) {
      throw new Error(
        `Auth E2E signed-in view did not show ${user.email}.\n${signedInBody}`
      );
    }

    await evaluateOnPage(
      cdp,
      `(() => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) => candidate.textContent?.trim() === "Sign out"
        );
        if (!button) throw new Error("Could not find Sign out button.");
        button.click();
        return true;
      })()`,
      'submit sign-out'
    );

    await waitForPageCondition({
      cdp,
      expression: '(document.body?.innerText ?? "").includes("Auth demo")',
      timeoutMs: AUTH_E2E_WAIT_TIMEOUT_MS,
    });

    const signedOutBody = String(
      await evaluateOnPage(
        cdp,
        'document.body?.innerText ?? ""',
        'read signed-out body'
      )
    );
    if (signedOutBody.includes('Signed in')) {
      throw new Error(
        `Auth E2E stayed signed in after sign out.\n${signedOutBody}`
      );
    }
    if (!signedOutBody.includes('Auth demo')) {
      throw new Error(
        `Auth E2E did not return to the signed-out auth view.\n${signedOutBody}`
      );
    }
  } finally {
    cdp.close();
    await closeDevToolsPage(target.id);
  }
};

export const runAuthE2E = async (argv: string[] = process.argv.slice(2)) => {
  const { target, url } = parseAuthE2EArgs(argv);
  const baseUrl = resolveAuthSmokeBaseUrl({ target, url });
  const user = createAuthE2EUser();
  if (hasDevBrowserBinary()) {
    runDevBrowserScript(buildAuthE2EScript({ baseUrl, user }));
  } else {
    await runCdpAuthE2E({ baseUrl, user });
  }
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
