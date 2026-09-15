import { memoryAdapter } from 'better-auth/adapters/memory';
import { betterAuth } from 'better-auth/minimal';
import { expect, test } from 'vitest';
import { convex } from './convex-plugin';

const GITHUB_AUTHORIZE_URL =
  /^https:\/\/github\.com\/login\/oauth\/authorize\?/;

const makeAuth = () => {
  const errors: unknown[][] = [];
  const database = memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
    jwks: [],
  });
  const auth = betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'synthetic-cookie-regression-secret-not-for-production',
    emailAndPassword: { enabled: true },
    database: (options) => {
      const adapter = database(options);
      return {
        ...adapter,
        options: { ...adapter.options, isRunMutationCtx: true },
      };
    },
    logger: {
      level: 'error',
      log: (_level, message, ...args) => errors.push([message, ...args]),
    },
    socialProviders: {
      github: {
        clientId: 'synthetic-client',
        clientSecret: 'synthetic-secret',
      },
    },
    plugins: [
      convex({
        authConfig: {
          providers: [
            { applicationID: 'convex', issuer: 'https://convex.invalid' },
          ],
        },
      }),
    ],
  });
  return { auth, errors };
};

test('starting OAuth without a session does not log a JWT-cookie error', async () => {
  const { auth, errors } = makeAuth();
  const response = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'github', callbackURL: '/' }),
    })
  );

  expect(response.status).toBe(200);
  expect((await response.json()).url).toMatch(GITHUB_AUTHORIZE_URL);
  expect(errors).toEqual([]);
  expect(response.headers.get('set-cookie') ?? '').not.toContain('convex_jwt=');
});

test('new and existing sessions receive a Convex JWT cookie', async () => {
  const { auth, errors } = makeAuth();
  const signup = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'cookie-test@example.com',
        password: 'synthetic-password-for-cookie-test',
        name: 'Cookie Test',
      }),
    })
  );

  expect(signup.status).toBe(200);
  expect(signup.headers.getSetCookie().join('; ')).toContain('convex_jwt=');
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const session = await auth.handler(
    new Request('http://localhost:3000/api/auth/get-session', {
      headers: { cookie },
    })
  );

  expect(session.status).toBe(200);
  expect((await session.json()).user.email).toBe('cookie-test@example.com');
  expect(session.headers.getSetCookie().join('; ')).toContain('convex_jwt=');
  expect(errors).toEqual([]);
});
