import { getAuthTables } from 'better-auth/db';
import { organization } from 'better-auth/plugins';
import { createSchemaExtensionOrm, createSchemaOrm } from './create-schema-orm';

const tables = {
  account: {
    fields: {
      accountId: { required: true, type: 'string' },
      providerId: { required: true, type: 'string' },
      userId: {
        references: { field: 'id', model: 'user', onDelete: 'cascade' },
        required: true,
        type: 'string',
      },
      tags: { required: false, type: 'string[]' },
      weights: { required: false, type: 'number[]' },
      status: { required: true, type: ['active', 'inactive'] },
      tokenVersion: { bigint: true, required: true, type: 'number' },
    },
    modelName: 'account',
  },
  session: {
    fields: {
      expiresAt: {
        required: true,
        sortable: true,
        type: 'date',
      },
      id: { required: true, type: 'string' },
      token: { required: false, type: 'string', unique: true },
      userId: {
        references: { field: 'id', model: 'user', onDelete: 'cascade' },
        required: true,
        sortable: true,
        type: 'string',
      },
    },
    modelName: 'session',
  },
  user: {
    fields: {
      email: { required: true, sortable: true, type: 'string', unique: true },
      id: { required: true, type: 'string' },
      name: { required: false, sortable: true, type: 'string' },
      profile: { required: false, type: 'json' },
    },
    modelName: 'user',
  },
} as any;

describe('createSchemaOrm', () => {
  test('throws when generating into a convex directory', async () => {
    await expect(createSchemaOrm({ file: 'convex', tables })).rejects.toThrow(
      'Better Auth schema must be generated in the Better Auth component directory.'
    );
  });

  test('generates ORM schema code with field mappings and indexes', async () => {
    const result = await createSchemaOrm({
      file: 'auth/schema.ts',
      tables,
    });

    expect(result.overwrite).toBe(true);
    expect(result.path).toBe('auth/schema.ts');

    expect(result.code).toContain('import {');
    expect(result.code).toContain('convexTable');
    expect(result.code).toContain('defineSchema');
    expect(result.code).not.toContain('import { v } from "convex/values";');

    expect(result.code).toContain('export const sessionTable = convexTable(');
    expect(result.code).toContain('export const userTable = convexTable(');
    expect(result.code).toContain('export const accountTable = convexTable(');

    // `id` field is removed from table declarations.
    expect(result.code).not.toMatch(/\n\s+id:/);

    // Required vs optional.
    expect(result.code).toContain('expiresAt: timestamp().notNull(),');
    expect(result.code).toContain('token: text().unique(),');

    // Mapping coverage.
    expect(result.code).toContain('profile: text(),');
    expect(result.code).toContain('tags: arrayOf(text().notNull()),');
    expect(result.code).toContain('weights: arrayOf(integer().notNull()),');
    expect(result.code).toContain(
      'status: textEnum(["active", "inactive"]).notNull(),'
    );
    expect(result.code).toContain('tokenVersion: bigint().notNull(),');

    // Relations are generated without onDelete action config.
    expect(result.code).toContain(
      'userId: text().notNull().references(() => userTable.id),'
    );
    expect(result.code).not.toContain('onDelete');
    expect(result.code).not.toContain('cascade');

    // Manual + special index generation.
    expect(result.code).toContain(
      'index("expiresAt_userId").on(sessionTable.expiresAt, sessionTable.userId)'
    );
    expect(result.code).toContain('index("userId").on(sessionTable.userId)');
    expect(result.code).not.toContain('index("token").on(sessionTable.token)');
    expect(result.code).not.toContain('index("userId").on(userTable.userId)');

    expect(result.code).toContain('.relations((r) => ({');
    expect(result.code).toContain('session: {');
    expect(result.code).toContain('user: r.one.user({');
    expect(result.code).toContain('from: r.session.userId,');
    expect(result.code).toContain('to: r.user.id,');
    expect(result.code).toContain('account: {');
    expect(result.code).toContain('user: r.one.user({');
    expect(result.code).toContain('from: r.account.userId,');
    expect(result.code).toContain('user: {');
    expect(result.code).toContain('sessions: r.many.session({');
    expect(result.code).toContain('accounts: r.many.account({');
  });

  test('generates ORM extension code for scaffold-owned plugin schema files', async () => {
    const result = await createSchemaExtensionOrm({
      extensionKey: 'auth',
      exportName: 'authExtension',
      file: 'convex/lib/plugins/auth/schema.ts',
      tables,
    });

    expect(result.overwrite).toBe(true);
    expect(result.path).toBe('convex/lib/plugins/auth/schema.ts');
    expect(result.code).toContain('defineSchemaExtension');
    expect(result.code).not.toContain('defineSchema(tables)');
    expect(result.code).toContain('export function authExtension()');
    expect(result.code).toContain('return defineSchemaExtension("auth", {');
    expect(result.code).toContain('account: accountTable,');
    expect(result.code).toContain('session: sessionTable,');
    expect(result.code).toContain('user: userTable,');
    expect(result.code).toContain(
      'status: textEnum(["active", "inactive"]).notNull(),'
    );
    expect(result.code).toContain('}).relations((r) => ({');
    expect(result.code).toContain('sessions: r.many.session({');
    expect(result.code).toContain('accounts: r.many.account({');
    expect(result.code).not.toContain('index("userId").on(userTable.userId)');
  });

  test('adds organization helper fields and references for Better Convex auth schema', async () => {
    const result = await createSchemaExtensionOrm({
      extensionKey: 'auth',
      exportName: 'authExtension',
      file: 'convex/lib/plugins/auth/schema.ts',
      tables: getAuthTables({
        emailAndPassword: { enabled: true },
        plugins: [organization()],
      }),
    });

    expect(result.code).toContain(
      'lastActiveOrganizationId: text().references(() => organizationTable.id),'
    );
    expect(result.code).toContain(
      'personalOrganizationId: text().references(() => organizationTable.id),'
    );
    expect(result.code).toContain(
      'activeOrganizationId: text().references(() => organizationTable.id),'
    );
    expect(result.code).toContain(
      'lastActiveOrganization: r.one.organization({'
    );
    expect(result.code).toContain('from: r.user.lastActiveOrganizationId,');
    expect(result.code).toContain('personalOrganization: r.one.organization({');
    expect(result.code).toContain('from: r.user.personalOrganizationId,');
    expect(result.code).toContain('activeOrganization: r.one.organization({');
    expect(result.code).toContain('from: r.session.activeOrganizationId,');
  });
});
