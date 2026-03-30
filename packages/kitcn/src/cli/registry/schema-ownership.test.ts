import { describe, expect, test } from 'bun:test';
import {
  type RootSchemaOwnershipLock,
  type RootSchemaTableUnit,
  reconcileRootSchemaOwnership,
} from './schema-ownership';

const createPromptAdapter = () => ({
  confirm: async () => true,
  isInteractive: () => false,
  multiselect: async () => [],
  select: async () => 'ignored',
});

const userUnit: RootSchemaTableUnit = {
  declaration: `export const userTable = convexTable("user", {
  email: text().notNull(),
});`,
  importNames: ['convexTable', 'text'],
  key: 'user',
  registration: 'user: userTable',
  relations: `user: {
  sessions: r.many.session({
    from: r.user.id,
    to: r.session.userId,
  }),
}`,
};

const sessionUnit: RootSchemaTableUnit = {
  declaration: `export const sessionTable = convexTable("session", {
  userId: text().references(() => userTable.id).notNull(),
});`,
  importNames: ['convexTable', 'text'],
  key: 'session',
  registration: 'session: sessionTable',
  relations: `session: {
  user: r.one.user({
    from: r.session.userId,
    to: r.user.id,
  }),
}`,
};

const usernameUserUnit: RootSchemaTableUnit = {
  declaration: `export const userTable = convexTable(
  "user",
  {
    email: text().notNull(),
    username: text(),
    displayUsername: text(),
  },
  (userTable) => [index("username").on(userTable.username)]
);`,
  importNames: ['convexTable', 'index', 'text'],
  key: 'user',
  registration: 'user: userTable',
  relations: `user: {
  sessions: r.many.session({
    from: r.user.id,
    to: r.session.userId,
  }),
}`,
};

const conflictingUserUnit: RootSchemaTableUnit = {
  declaration: `export const userTable = convexTable("user", {
  username: text(),
});`,
  importNames: ['convexTable', 'text'],
  key: 'user',
  registration: 'user: userTable',
};

const baseSchema = `import { convexTable, defineSchema, text } from "kitcn/orm";

export const messagesTable = convexTable("messages", {
  body: text().notNull(),
});

export const tables = {
  messages: messagesTable,
};

export default defineSchema(tables);
`;

const helperRelationsSchema = `import { convexTable, defineRelations, defineSchema, text } from "kitcn/orm";

export const messagesTable = convexTable("messages", {
  body: text().notNull(),
});

export const tables = {
  messages: messagesTable,
};

const schema = defineSchema(tables).relations((r) => ({
  messages: {
    self: r.one.messages({
      from: r.messages.id,
      to: r.messages.id,
    }),
  },
}));

export const relations = defineRelations(tables, (r) => ({
  messages: {
    self: r.one.messages({
      from: r.messages.id,
      to: r.messages.id,
    }),
  },
}));

export default schema;
`;

const localUserSchema = `import { convexTable, defineSchema, text } from "kitcn/orm";

export const localUserTable = convexTable(
  "user",
  {
    email: text().notNull(),
    name: text(),
  }
);

export default defineSchema({
  user: localUserTable,
}).relations((r) => ({
  user: {
    profile: r.one.profile({
      from: r.user.id,
      to: r.profile.userId,
    }),
  },
}));
`;

const conflictingLocalUserSchema = `import { convexTable, defineSchema, integer } from "kitcn/orm";

export const localUserTable = convexTable("user", {
  username: integer(),
});

export default defineSchema({
  user: localUserTable,
});
`;

const staleLockSchema = `import { convexTable, defineSchema, text } from "kitcn/orm";

export const invitationTable = convexTable("invitation", {
  email: text().notNull(),
});

export const tables = {
  invitation: invitationTable,
};

export default defineSchema(tables);
`;

describe('root schema ownership', () => {
  test('inserts missing table, registration, and relation blocks into root schema', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: baseSchema,
      tables: [userUnit, sessionUnit],
      yes: true,
    });

    expect(result.content).toContain(
      'export const userTable = convexTable("user"'
    );
    expect(result.content).toContain(
      'export const sessionTable = convexTable("session"'
    );
    expect(result.content).toContain('user: userTable,');
    expect(result.content).toContain('session: sessionTable,');
    expect(result.content).toContain('.relations((r) => ({');
    expect(result.content).toContain('sessions: r.many.session');
    expect(result.content).toContain('user: r.one.user');
    expect(result.content).not.toContain('kitcn-managed');
    expect(result.lock).toEqual({
      path: '/repo/convex/functions/schema.ts',
      tables: {
        session: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        user: {
          checksum: expect.any(String),
          owner: 'managed',
        },
      },
    } satisfies RootSchemaOwnershipLock);
  });

  test('merges missing fields, indexes, and relations into an existing local table', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: localUserSchema,
      tables: [usernameUserUnit],
      yes: true,
    });

    expect(result.content).toContain(
      'export const localUserTable = convexTable('
    );
    expect(result.content).toContain('name: text(),');
    expect(result.content).toContain('username: text(),');
    expect(result.content).toContain('displayUsername: text(),');
    expect(result.content).toContain(
      'index("username").on(localUserTable.username)'
    );
    expect(result.content).toContain('profile: r.one.profile');
    expect(result.content).toContain('sessions: r.many.session');
    expect(result.lock).toEqual({
      path: '/repo/convex/functions/schema.ts',
      tables: {
        user: {
          owner: 'local',
        },
      },
    } satisfies RootSchemaOwnershipLock);
  });

  test('throws on incompatible overlapping field definitions', async () => {
    await expect(
      reconcileRootSchemaOwnership({
        lock: null,
        overwrite: false,
        pluginKey: 'auth',
        preview: false,
        promptAdapter: createPromptAdapter(),
        schemaPath: '/repo/convex/functions/schema.ts',
        source: conflictingLocalUserSchema,
        tables: [conflictingUserUnit],
        yes: true,
      })
    ).rejects.toThrow(
      'Schema patch conflict in /repo/convex/functions/schema.ts: auth field "username" on table "user" is incompatible with the existing schema.'
    );
  });

  test('cleans legacy managed comments while preserving managed lock state', async () => {
    const firstPass = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: baseSchema,
      tables: [userUnit],
      yes: true,
    });

    const legacySource = firstPass.content
      .replace(
        'export const userTable = convexTable("user", {\n  email: text().notNull(),\n});',
        `/* kitcn-managed auth:user:declaration:start */\nexport const userTable = convexTable("user", {\n  email: text().notNull(),\n});\n/* kitcn-managed auth:user:declaration:end */`
      )
      .replace(
        '  user: userTable,',
        '/* kitcn-managed auth:user:registration:start */\n  user: userTable,\n/* kitcn-managed auth:user:registration:end */'
      )
      .replace(
        '  user: {\n    sessions: r.many.session({\n      from: r.user.id,\n      to: r.session.userId,\n    }),\n  },',
        '/* kitcn-managed auth:user:relations:start */\n  user: {\n    sessions: r.many.session({\n      from: r.user.id,\n      to: r.session.userId,\n    }),\n  },\n/* kitcn-managed auth:user:relations:end */'
      );

    const result = await reconcileRootSchemaOwnership({
      lock: firstPass.lock,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: legacySource,
      tables: [userUnit],
      yes: true,
    });

    expect(result.content).toBe(firstPass.content);
    expect(result.lock).toEqual(firstPass.lock);
  });

  test('emits manual cleanup warnings for stale schema lock tables', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: {
        path: 'convex/functions/schema.ts',
        tables: {
          invitation: {
            checksum: 'deadbeef1234',
            owner: 'managed',
          },
        },
      },
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: staleLockSchema,
      tables: [],
      yes: true,
    });

    expect(result.manualActions).toEqual([
      'auth no longer defines schema table "invitation" in /repo/convex/functions/schema.ts. Review and remove stale schema fragments manually if they are no longer needed.',
    ]);
  });

  test('rejects legacy defineRelations helper schemas', async () => {
    await expect(
      reconcileRootSchemaOwnership({
        lock: null,
        overwrite: false,
        pluginKey: 'auth',
        preview: false,
        promptAdapter: createPromptAdapter(),
        schemaPath: '/repo/convex/functions/schema.ts',
        source: helperRelationsSchema,
        tables: [userUnit],
        yes: true,
      })
    ).rejects.toThrow(
      'Schema patch error: use `defineSchema(...).relations(...)` in schema.ts. Root schema patching no longer supports standalone `defineRelations(...)` exports.'
    );
  });
});
