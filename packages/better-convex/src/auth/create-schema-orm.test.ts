import { createSchemaOrm } from './create-schema-orm';

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

    expect(result.code).toContain('export const session = convexTable(');
    expect(result.code).toContain('export const user = convexTable(');
    expect(result.code).toContain('export const account = convexTable(');

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
      'userId: text().notNull().references(() => user.id),'
    );
    expect(result.code).not.toContain('onDelete');
    expect(result.code).not.toContain('cascade');

    // Manual + special index generation.
    expect(result.code).toContain(
      'index("expiresAt_userId").on(session.expiresAt, session.userId)'
    );
    expect(result.code).toContain('index("userId").on(session.userId)');
    expect(result.code).toContain('index("token").on(session.token)');
  });
});
