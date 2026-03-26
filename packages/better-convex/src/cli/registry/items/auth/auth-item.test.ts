import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDefaultConfig } from '../../../test-utils';
import { getPluginCatalogEntry } from '../../index';

describe('auth registry item', () => {
  test('claims jwks on first managed auth scaffold pass', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-auth-item-')
    );
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'better-convex/orm';

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
    expect(plan?.content).toContain('auth:jwks:declaration:start');
    expect(plan?.content).toContain('auth:jwks:registration:start');
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
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-auth-item-')
    );
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from 'better-convex/orm';

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
    expect(plan?.content).toContain('auth:jwks:declaration:start');
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

  test('schema-only auth reconcile forwards applyScope and replaces managed drift', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-auth-item-')
    );
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from "better-convex/orm";

      /* better-convex-managed auth:user:declaration:start */
      export const userTable = convexTable("user", {
        email: text(),
      });
      /* better-convex-managed auth:user:declaration:end */

      export const tables = {
      /* better-convex-managed auth:user:registration:start */
        user: userTable,
      /* better-convex-managed auth:user:registration:end */
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
    expect(plan?.content).toContain('auth:user:declaration:start');
    expect(plan?.schemaOwnershipLock?.tables.user).toEqual({
      checksum: expect.any(String),
      owner: 'managed',
    });
  });

  test('schema-only auth reconcile claims existing auth tables when no schema lock exists yet', async () => {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'better-convex-auth-item-')
    );
    const functionsDir = path.join(dir, 'convex', 'functions');
    const schemaPath = path.join(functionsDir, 'schema.ts');
    const schemaSource = `
      import { convexTable, defineSchema, text } from "better-convex/orm";

      export const userTable = convexTable("user", {
        email: text(),
      });

      export const tables = {
        user: userTable,
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
    expect(plan?.content).toContain(
      'better-convex-managed auth:user:declaration:start'
    );
    expect(plan?.schemaOwnershipLock?.tables.user).toEqual({
      checksum: expect.any(String),
      owner: 'managed',
    });
  });
});
