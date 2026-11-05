import type { BetterAuthOptions } from 'better-auth';
import { getAuthTables } from 'better-auth/db';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';
import { anyApi, defineSchema, defineTable } from 'convex/server';
import { type Validator, v } from 'convex/values';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { httpAdapter } from './adapter';
import { createApi } from './create-api';
import type { AuthFunctions } from './create-client';

const authOptions = {
  baseURL: 'http://localhost:3000',
  secret: 'synthetic-forced-id-regression-secret-not-for-production',
  emailAndPassword: { enabled: true },
  plugins: [organization()],
} satisfies BetterAuthOptions;

const authTables = getAuthTables(authOptions);

const validatorsByType: Record<string, () => Validator<any, any, any>> = {
  boolean: () => v.boolean(),
  date: () => v.number(),
  number: () => v.number(),
  'string[]': () => v.array(v.string()),
};

const fieldValidator = (field: { type: unknown; required?: boolean }) => {
  const validator = validatorsByType[String(field.type)]?.() ?? v.string();
  return field.required ? validator : v.optional(v.union(v.null(), validator));
};

const schema = defineSchema(
  Object.fromEntries(
    Object.values(authTables).map((table) => {
      const fields = Object.fromEntries(
        Object.entries(table.fields).map(([name, field]) => [
          field.fieldName ?? name,
          fieldValidator(field as any),
        ])
      );
      const indexes = [
        ...Object.keys(fields).map((column) => [column]),
        ...(table.indexes ?? []).map((index) => index.fields),
      ];
      let convexTable = defineTable(fields);
      for (const columns of indexes) {
        convexTable = convexTable.index(columns.join('_'), columns as any);
      }
      return [table.modelName, convexTable];
    })
  )
);

const authApi = createApi(schema, () => ({}), {
  getBetterAuthSchema: () => authTables,
});

const authFunctions = anyApi.auth as unknown as AuthFunctions;

const makeAuth = () => {
  const t = convexTest(schema, {
    './_generated/api.js': async () => ({}),
    './auth.js': async () => authApi,
  });
  const ctx = {
    runMutation: (ref: any, args: any) => t.mutation(ref, args),
    runQuery: (ref: any, args: any) => t.query(ref, args),
  };
  const auth = betterAuth({
    ...authOptions,
    database: httpAdapter(ctx as any, { authFunctions, schema }),
  });
  return { auth, t };
};

const post = (path: string, body: unknown, cookie?: string) =>
  new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:3000',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

const signUp = async (auth: ReturnType<typeof makeAuth>['auth']) => {
  const response = await auth.handler(
    post('/sign-up/email', {
      email: 'owner@example.com',
      name: 'Owner',
      password: 'synthetic-password-for-forced-id',
    })
  );
  return {
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; '),
    status: response.status,
  };
};

describe('auth create with a forced id', () => {
  test('organization invite-member stores the invitation under a Convex id', async () => {
    const { auth } = makeAuth();
    const { cookie, status } = await signUp(auth);
    expect(status).toBe(200);
    const created = await auth.handler(
      post('/organization/create', { name: 'Acme', slug: 'acme' }, cookie)
    );
    expect(created.status).toBe(200);
    const org = await created.json();

    const invited = await auth.handler(
      post(
        '/organization/invite-member',
        { email: 'guest@example.com', organizationId: org.id, role: 'member' },
        cookie
      )
    );
    expect(invited.status).toBe(200);
    const invitation = await invited.json();

    const fetched = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/organization/list-invitations?organizationId=${org.id}`,
        { headers: { cookie } }
      )
    );
    expect(await fetched.json()).toMatchObject([
      { email: 'guest@example.com', id: invitation.id },
    ]);
  });

  test('reserveVerificationValue lets the first caller reserve', async () => {
    const { auth, t } = makeAuth();
    const context = await auth.$context;

    const reserved = await context.internalAdapter.reserveVerificationValue({
      expiresAt: new Date(Date.now() + 60_000),
      identifier: 'synthetic-reservation',
      value: 'first',
    });

    expect(reserved).toBe(true);
    const rows = await t.run((ctx) => ctx.db.query('verification').collect());
    expect(rows).toMatchObject([
      { identifier: 'synthetic-reservation', value: 'first' },
    ]);
  });
});
