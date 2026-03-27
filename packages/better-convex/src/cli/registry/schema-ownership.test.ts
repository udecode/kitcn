import { describe, expect, test } from 'bun:test';
import {
  type RootSchemaOwnershipLock,
  type RootSchemaTableUnit,
  reconcileRootSchemaOwnership,
} from './schema-ownership';

const createPromptAdapter = (confirm: boolean) => ({
  confirm: async () => confirm,
  isInteractive: () => true,
  multiselect: async () => [],
  select: async () => 'ignored',
});

const userUnit: RootSchemaTableUnit = {
  declaration: `export const userTable = convexTable("user", {
  email: text().notNull(),
});`,
  importNames: ['convexTable', 'text'],
  key: 'user',
  registration: '  user: userTable,',
  relations: `  user: {
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
  registration: '  session: sessionTable,',
  relations: `  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  }`,
};

const baseSchema = `import { convexTable, defineSchema, text } from "better-convex/orm";

export const messagesTable = convexTable("messages", {
  body: text().notNull(),
});

export const tables = {
  messages: messagesTable,
};

export default defineSchema(tables);
`;

const helperRelationsSchema = `import { convexTable, defineRelations, defineSchema, text } from "better-convex/orm";

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

const localUserSchema = `import { convexTable, defineSchema, text } from "better-convex/orm";

export const localUserTable = convexTable("user", {
  email: text().notNull(),
  name: text(),
});

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

describe('root schema ownership', () => {
  test('inserts managed table, registration, and relation blocks into root schema', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(true),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: baseSchema,
      tables: [userUnit, sessionUnit],
      yes: false,
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
    expect(result.content).not.toContain('authExtension()');
    expect(result.content).not.toContain('better-convex-managed');
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

  test('keeps conflicting local tables when the interactive prompt declines overwrite', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(false),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: localUserSchema,
      tables: [userUnit],
      yes: false,
    });

    expect(result.content).toContain(
      'export const localUserTable = convexTable("user"'
    );
    expect(result.content).not.toContain(
      'export const userTable = convexTable("user"'
    );
    expect(result.content).not.toContain('better-convex-managed');
    expect(result.lock).toEqual({
      path: '/repo/convex/functions/schema.ts',
      tables: {
        user: {
          owner: 'local',
        },
      },
    } satisfies RootSchemaOwnershipLock);
  });

  test('throws on unresolved local ownership conflicts in non-interactive yes mode', async () => {
    await expect(
      reconcileRootSchemaOwnership({
        lock: null,
        overwrite: false,
        pluginKey: 'auth',
        preview: false,
        promptAdapter: {
          confirm: async () => true,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        schemaPath: '/repo/convex/functions/schema.ts',
        source: localUserSchema,
        tables: [userUnit],
        yes: true,
      })
    ).rejects.toThrow(
      'Table "user" already exists in /repo/convex/functions/schema.ts. Re-run `better-convex add auth` interactively or pass --overwrite to let better-convex manage it.'
    );
  });

  test('overwrites conflicting local tables when overwrite is enabled', async () => {
    const result = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: true,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(false),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: localUserSchema,
      tables: [userUnit],
      yes: false,
    });

    expect(result.content).not.toContain('localUserTable');
    expect(result.content).toContain(
      'export const userTable = convexTable("user"'
    );
    expect(result.content).not.toContain('better-convex-managed');
    expect(result.lock?.tables.user).toEqual({
      checksum: expect.any(String),
      owner: 'managed',
    });
  });

  test('throws on drifted managed schema blocks in yes mode', async () => {
    const driftedSource = `import { convexTable, defineSchema, text } from "better-convex/orm";
export const userTable = convexTable("user", {
  email: text(),
});

export const tables = {
  user: userTable,
};

export default defineSchema(tables);
`;

    await expect(
      reconcileRootSchemaOwnership({
        lock: {
          path: 'convex/functions/schema.ts',
          tables: {
            user: {
              checksum: 'badbadbadbad',
              owner: 'managed',
            },
          },
        },
        overwrite: false,
        pluginKey: 'auth',
        preview: false,
        promptAdapter: {
          confirm: async () => true,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        schemaPath: '/repo/convex/functions/schema.ts',
        source: driftedSource,
        tables: [userUnit],
        yes: true,
      })
    ).rejects.toThrow(
      'Table "user" has drifted from the managed auth schema in /repo/convex/functions/schema.ts. Re-run `better-convex add auth` interactively or pass --overwrite to replace it.'
    );
  });

  test('cleans legacy managed comments while preserving managed ownership', async () => {
    const firstPass = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(true),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: baseSchema,
      tables: [userUnit],
      yes: false,
    });

    const legacySource = firstPass.content
      .replace(
        'export const userTable = convexTable("user", {\n  email: text().notNull(),\n});',
        `/* better-convex-managed auth:user:declaration:start */\nexport const userTable = convexTable("user", {\n  email: text().notNull(),\n});\n/* better-convex-managed auth:user:declaration:end */`
      )
      .replace(
        '  user: userTable,',
        '/* better-convex-managed auth:user:registration:start */\n  user: userTable,\n/* better-convex-managed auth:user:registration:end */'
      )
      .replace(
        '  user: {\n    sessions: r.many.session({\n      from: r.user.id,\n      to: r.session.userId,\n    }),\n  },',
        '/* better-convex-managed auth:user:relations:start */\n  user: {\n    sessions: r.many.session({\n      from: r.user.id,\n      to: r.session.userId,\n    }),\n  },\n/* better-convex-managed auth:user:relations:end */'
      );

    const result = await reconcileRootSchemaOwnership({
      lock: firstPass.lock,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: {
        confirm: async () => {
          throw new Error('should not prompt');
        },
        isInteractive: () => false,
        multiselect: async () => [],
        select: async () => 'ignored',
      },
      schemaPath: '/repo/convex/functions/schema.ts',
      source: legacySource,
      tables: [userUnit],
      yes: true,
    });

    expect(result.content).toContain(
      'export const userTable = convexTable("user"'
    );
    expect(result.content).not.toContain('better-convex-managed');
    expect(result.lock).toEqual(firstPass.lock);
  });

  test('reuses a fresh managed lock without false drift on rerun', async () => {
    const firstPass = await reconcileRootSchemaOwnership({
      lock: null,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: createPromptAdapter(true),
      schemaPath: '/repo/convex/functions/schema.ts',
      source: baseSchema,
      tables: [userUnit, sessionUnit],
      yes: false,
    });

    const secondPass = await reconcileRootSchemaOwnership({
      lock: firstPass.lock,
      overwrite: false,
      pluginKey: 'auth',
      preview: false,
      promptAdapter: {
        confirm: async () => {
          throw new Error('should not prompt');
        },
        isInteractive: () => false,
        multiselect: async () => [],
        select: async () => 'ignored',
      },
      schemaPath: '/repo/convex/functions/schema.ts',
      source: firstPass.content,
      tables: [userUnit, sessionUnit],
      yes: true,
    });

    expect(secondPass.content).toBe(firstPass.content);
    expect(secondPass.lock).toEqual(firstPass.lock);
  });

  test('rejects legacy defineRelations helper schemas', async () => {
    await expect(
      reconcileRootSchemaOwnership({
        lock: null,
        overwrite: false,
        pluginKey: 'auth',
        preview: false,
        promptAdapter: createPromptAdapter(true),
        schemaPath: '/repo/convex/functions/schema.ts',
        source: helperRelationsSchema,
        tables: [userUnit],
        yes: false,
      })
    ).rejects.toThrow(
      'Schema patch error: use `defineSchema(...).relations(...)` in schema.ts. Root schema patching no longer supports standalone `defineRelations(...)` exports.'
    );
  });
});
