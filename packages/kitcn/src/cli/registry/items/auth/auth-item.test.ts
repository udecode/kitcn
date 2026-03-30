import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig } from '../../../test-utils';
import { getPluginCatalogEntry } from '../../index';
import {
  loadDefaultManagedAuthOptions,
  renderManagedAuthSchemaUnits,
} from './reconcile-auth-schema.js';

describe('auth registry item', () => {
  test('claims jwks on first managed auth scaffold pass', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'kitcn/orm';

      export const messagesTable = convexTable('messages', {
        body: text().notNull(),
      });

      export const tables = {
        messages: messagesTable,
      };

      export default defineSchema(tables);
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {},
        },
        overwrite: false,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => false,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: true,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).toContain('export const jwksTable = convexTable(');
    expect(plan?.content).toContain('jwks: jwksTable,');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock).toEqual({
      path: schemaPath,
      tables: {
        account: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        jwks: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        session: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        user: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        verification: {
          checksum: expect.any(String),
          owner: 'managed',
        },
      },
    });
  });

  test('keeps local auth tables and still adds missing jwks table', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'kitcn/orm';

      export const accountTable = convexTable('account', {
        userId: text(),
      });
      export const sessionTable = convexTable('session', {
        userId: text(),
      });
      export const userTable = convexTable('user', {
        email: text(),
      });
      export const verificationTable = convexTable('verification', {
        identifier: text(),
      });

      const schema = defineSchema({
        account: accountTable,
        session: sessionTable,
        user: userTable,
        verification: verificationTable,
      });

      export default schema;
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {},
        },
        overwrite: false,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => false,
          isInteractive: () => true,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: false,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).not.toContain('authExtension()');
    expect(plan?.content).toContain('export const jwksTable = convexTable(');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock).toEqual({
      path: schemaPath,
      tables: {
        account: {
          owner: 'local',
        },
        jwks: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        session: {
          owner: 'local',
        },
        user: {
          owner: 'local',
        },
        verification: {
          owner: 'local',
        },
      },
    });
  });

  test('schema-only auth claim keeps forked local tables when no schema lock exists yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'kitcn/orm';

      export const accountTable = convexTable('account', {
        userId: text(),
      });
      export const sessionTable = convexTable('session', {
        userId: text(),
      });
      export const userTable = convexTable('user', {
        email: text(),
        bio: text(),
      });
      export const verificationTable = convexTable('verification', {
        identifier: text(),
      });

      const schema = defineSchema({
        account: accountTable,
        session: sessionTable,
        user: userTable,
        verification: verificationTable,
      });

      export default schema;
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        applyScope: 'schema',
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {},
        },
        overwrite: false,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => {
            throw new Error('should not prompt');
          },
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: true,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).toContain('export const jwksTable = convexTable(');
    expect(plan?.content).toContain('bio: text(),');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock).toEqual({
      path: schemaPath,
      tables: {
        account: {
          owner: 'local',
        },
        jwks: {
          checksum: expect.any(String),
          owner: 'managed',
        },
        session: {
          owner: 'local',
        },
        user: {
          owner: 'local',
        },
        verification: {
          owner: 'local',
        },
      },
    });
  });

  test('schema-only auth overwrite keeps explicitly local auth tables', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'kitcn/orm';

      export const accountTable = convexTable('account', {
        userId: text(),
      });
      export const jwksTable = convexTable('jwks', {
        publicKey: text(),
      });
      export const sessionTable = convexTable('session', {
        userId: text(),
      });
      export const userTable = convexTable('user', {
        email: text(),
        bio: text(),
      });
      export const verificationTable = convexTable('verification', {
        identifier: text(),
      });

      const schema = defineSchema({
        account: accountTable,
        jwks: jwksTable,
        session: sessionTable,
        user: userTable,
        verification: verificationTable,
      });

      export default schema;
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        applyScope: 'schema',
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {
            auth: {
              package: 'better-auth',
              schema: {
                path: schemaPath,
                tables: {
                  account: {
                    owner: 'local',
                  },
                  jwks: {
                    owner: 'local',
                  },
                  session: {
                    owner: 'local',
                  },
                  user: {
                    owner: 'local',
                  },
                  verification: {
                    owner: 'local',
                  },
                },
              },
            },
          },
        },
        overwrite: true,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => {
            throw new Error('should not prompt');
          },
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: true,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).toContain('bio: text(),');
    expect(plan?.content).toContain('name: text().notNull(),');
    expect(plan?.content).toContain('export const jwksTable = convexTable(');
    expect(plan?.content).toContain('privateKey: text().notNull(),');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock).toEqual({
      path: schemaPath,
      tables: {
        account: {
          owner: 'local',
        },
        jwks: {
          owner: 'local',
        },
        session: {
          owner: 'local',
        },
        user: {
          owner: 'local',
        },
        verification: {
          owner: 'local',
        },
      },
    });
  });

  test('schema-only auth reconcile forwards applyScope and replaces managed drift', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from "kitcn/orm";

      /* kitcn-managed auth:user:declaration:start */
      export const userTable = convexTable("user", {
        email: text(),
      });
      /* kitcn-managed auth:user:declaration:end */

      export const tables = {
      /* kitcn-managed auth:user:registration:start */
        user: userTable,
      /* kitcn-managed auth:user:registration:end */
      };

      export default defineSchema(tables);
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        applyScope: 'schema',
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {
            auth: {
              package: 'better-auth',
              schema: {
                path: schemaPath,
                tables: {
                  user: {
                    checksum: 'badbadbadbad',
                    owner: 'managed',
                  },
                },
              },
            },
          },
        },
        overwrite: false,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => false,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: true,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).toContain('export const userTable = convexTable(');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock?.tables.user).toEqual({
      checksum: expect.any(String),
      owner: 'managed',
    });
  });

  test('schema-only auth reconcile claims existing auth tables when no schema lock exists yet', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-auth-item-'));
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const authUnits = await renderManagedAuthSchemaUnits({
      authOptions: await loadDefaultManagedAuthOptions(),
    });
    const userUnit = authUnits.find((unit) => unit.key === 'user');
    if (!userUnit?.relations) {
      throw new Error('expected generated user auth schema unit');
    }
    const schemaSource = `
      import { boolean, convexTable, defineSchema, index, text, timestamp } from "kitcn/orm";

      ${userUnit.declaration}

      export const tables = {
${userUnit.registration}
      };

      export default defineSchema(tables).relations((r) => ({
${userUnit.relations},
      }));
    `.trim();

    fs.mkdirSync(functionsDir, { recursive: true });
    fs.writeFileSync(schemaPath, schemaSource, 'utf8');

    const descriptor = getPluginCatalogEntry('auth');
    const plan =
      await descriptor.integration?.buildSchemaRegistrationPlanFile?.({
        applyScope: 'schema',
        config: createDefaultConfig(),
        functionsDir,
        lockfile: {
          plugins: {},
        },
        overwrite: false,
        preset: 'default',
        preview: false,
        promptAdapter: {
          confirm: async () => false,
          isInteractive: () => false,
          multiselect: async () => [],
          select: async () => 'ignored',
        },
        roots: {
          appRootDir: null,
          clientLibRootDir: null,
          crpcFilePath: path.join(dir, 'convex', 'lib', 'crpc.ts'),
          envFilePath: path.join(dir, 'convex', 'lib', 'get-env.ts'),
          functionsRootDir: functionsDir,
          libRootDir: path.join(dir, 'convex', 'lib'),
          projectContext: null,
          sharedApiFilePath: path.join(dir, 'convex', 'shared', 'api.ts'),
        },
        yes: true,
      });

    expect(plan).toBeDefined();
    expect(plan?.action).toBe('update');
    expect(plan?.content).toContain('export const userTable = convexTable(');
    expect(plan?.content).not.toContain('kitcn-managed');
    expect(plan?.schemaOwnershipLock?.tables.user).toEqual({
      checksum: expect.any(String),
      owner: 'managed',
    });
  });
});
