import { getAuthTables } from 'better-auth/db';
import { organization } from 'better-auth/plugins';
import { createSchema } from './create-schema';

const tables = {
  session: {
    fields: {
      id: { required: true, type: 'string' },
      userId: { required: true, sortable: true, type: 'string', unique: false },
      expiresAt: {
        required: true,
        sortable: true,
        type: 'date',
        unique: false,
      },
      token: { required: false, type: 'string', unique: true },
    },
    modelName: 'session',
  },
  user: {
    fields: {
      id: { required: true, type: 'string' },
      email: { required: true, sortable: true, type: 'string', unique: true },
      name: { required: false, sortable: true, type: 'string', unique: false },
      profile: { required: false, type: 'json' },
    },
    modelName: 'user',
  },
} as any;

describe('createSchema', () => {
  test('throws when generating into a convex directory', async () => {
    await expect(createSchema({ file: 'convex', tables })).rejects.toThrow(
      'Better Auth schema must be generated in the Better Auth component directory.'
    );
  });

  test('generates schema code with convex field mappings and indexes', async () => {
    const result = await createSchema({
      file: 'auth/schema.ts',
      tables,
    });

    expect(result.overwrite).toBe(true);
    expect(result.path).toBe('auth/schema.ts');

    expect(result.code).toContain('export const tables = {');
    expect(result.code).toContain('session: defineTable({');
    expect(result.code).toContain('user: defineTable({');

    // `id` field is removed from Convex table schema.
    expect(result.code).not.toContain('id:');

    // Dates are stored as numbers and optionals are nullable.
    expect(result.code).toContain('expiresAt: v.number()');
    expect(result.code).toContain(
      'token: v.optional(v.union(v.null(), v.string()))'
    );

    // JSON fields are represented as strings in Convex.
    expect(result.code).toContain(
      'profile: v.optional(v.union(v.null(), v.string()))'
    );

    // Unique/sortable/manual indexes are included.
    expect(result.code).toContain('.index("email_name", ["email","name"])');
    expect(result.code).toContain('.index("expiresAt", ["expiresAt"])');
    expect(result.code).not.toMatch(
      /user: defineTable\([\s\S]*?\.index\("userId", \["userId"\]\)/
    );
  });

  test('adds organization helper fields for kitcn auth schema', async () => {
    const result = await createSchema({
      file: 'auth/schema.ts',
      exportName: 'authSchema',
      tables: getAuthTables({
        emailAndPassword: { enabled: true },
        plugins: [organization()],
      }),
    });

    expect(result.code).toContain(
      'activeOrganizationId: v.optional(v.union(v.null(), v.string()))'
    );
    expect(result.code).toContain(
      'lastActiveOrganizationId: v.optional(v.union(v.null(), v.string()))'
    );
    expect(result.code).toContain(
      'personalOrganizationId: v.optional(v.union(v.null(), v.string()))'
    );
    expect(result.code).toContain(
      '.index("lastActiveOrganizationId", ["lastActiveOrganizationId"])'
    );
    expect(result.code).toContain(
      '.index("personalOrganizationId", ["personalOrganizationId"])'
    );
  });
});
