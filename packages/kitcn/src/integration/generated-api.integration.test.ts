import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFunctionName } from 'convex/server';
import { generateMeta, getConvexConfig } from '../cli/codegen';
import { createServerCRPCProxy } from '../rsc/proxy-server';

const HTTP_ROUTE_NOT_FOUND_MISSING_RE = /HTTP route not found: missing/i;
const ORM_SCHEMA_STUB = `
const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');
const OrmSchemaTriggers = Symbol.for('kitcn:OrmSchemaTriggers');
export const tables = {
  todos: { table: 'todos' },
};
const schema = { tables };
Object.defineProperty(schema, OrmSchemaOptions, {
  value: {},
  enumerable: false,
});
Object.defineProperty(schema, OrmSchemaRelations, {
  value: {
    todos: { table: tables.todos },
  },
  enumerable: false,
});
Object.defineProperty(schema, OrmSchemaTriggers, {
  value: {
    todos: {},
  },
  enumerable: false,
});
export default schema;
`.trim();

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-integration-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function symlinkDir(targetPath: string, linkPath: string) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(targetPath, linkPath, 'dir');
}

describe('integration/generated-api', () => {
  test('codegen smoke test runs against real repo convex directory', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const repoRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../..'
    );
    const sourceConvexDir = path.join(repoRoot, 'convex');
    const sourceConvexConfig = path.join(repoRoot, 'convex.json');

    process.chdir(dir);
    try {
      fs.cpSync(sourceConvexDir, path.join(dir, 'convex'), { recursive: true });
      fs.copyFileSync(sourceConvexConfig, path.join(dir, 'convex.json'));
      symlinkDir(
        path.join(repoRoot, 'packages', 'kitcn'),
        path.join(dir, 'node_modules', 'kitcn')
      );
      symlinkDir(
        path.join(repoRoot, 'node_modules', 'convex'),
        path.join(dir, 'node_modules', 'convex')
      );
      symlinkDir(
        path.join(repoRoot, 'node_modules', 'convex-test'),
        path.join(dir, 'node_modules', 'convex-test')
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      const generated = fs.readFileSync(outputFile, 'utf-8');
      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      const generatedMigrationsFile = path.join(
        dir,
        'convex',
        'generated',
        'migrations.gen.ts'
      );
      const generatedMigrations = fs.readFileSync(
        generatedMigrationsFile,
        'utf-8'
      );

      expect(generated).toContain('export const api = {');
      expect(generated).toContain('export type Api = typeof api;');
      expect(generated).toContain(
        'export type ApiInputs = inferApiInputs<Api>;'
      );
      expect(generated).toContain(
        'export type ApiOutputs = inferApiOutputs<Api>;'
      );
      expect(generated).not.toContain(
        'import type { ActionCtx, MutationCtx, QueryCtx }'
      );
      expect(generated).not.toContain('export type GenericCtx =');
      expect(generated).not.toContain('export type OrmCtx<');
      expect(generated).not.toContain('export type OrmQueryCtx');
      expect(generated).not.toContain('export type OrmMutationCtx');
      expect(generated).toContain(
        'export type TableName = keyof typeof tables;'
      );
      expect(generated).toContain('export type Select<T extends TableName>');
      expect(generated).toContain('export type Insert<T extends TableName>');
      expect(generated).not.toContain('WithHttpRouter');
      expect(generatedServer).toContain("import schema from '../schema';");
      expect(generatedServer).toContain('createOrm');
      expect(generatedServer).toContain('initCRPC as baseInitCRPC,');
      expect(generatedServer).toContain('createGeneratedFunctionReference,');
      expect(generatedServer).toContain('const ormFunctions: OrmFunctions = {');
      expect(generatedServer).toContain(
        'scheduledMutationBatch: createGeneratedFunctionReference<"mutation", "internal", unknown>("generated/server:scheduledMutationBatch"),'
      );
      expect(generatedServer).not.toContain(
        "import { internal } from '../_generated/api.js';"
      );
      expect(generatedServer).not.toContain('getGeneratedValue(');
      expect(generatedServer).toContain(
        'export type QueryCtx = OrmCtx<ServerQueryCtx>;'
      );
      expect(generatedServer).toContain(
        'export type MutationCtx = OrmCtx<ServerMutationCtx>;'
      );
      expect(generatedServer).toContain(
        'export type ActionCtx = ServerActionCtx;'
      );
      expect(generatedServer).toContain(
        'export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(generatedServer).not.toContain('export type MigrationCtx =');
      expect(generatedServer).toContain(
        'export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx> = GenericOrmCtx<Ctx, typeof ormSchema>;'
      );
      expect(generatedServer).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(generatedServer).toContain('const ormSchema = schema;');
      expect(generatedServer).toContain('query: (ctx) => withOrm(ctx),');
      expect(generatedServer).toContain('mutation: (ctx) => withOrm(ctx),');
      expect(generatedServer).toContain('action: (ctx) => ctx,');
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedMigrations).toContain('export function defineMigration(');
      expect(generatedMigrations).toContain("import schema from '../schema';");
      expect(generatedMigrations).toContain(
        'migration: MigrationDefinition<typeof schema>'
      );
      expect(generatedMigrations).toContain(
        'return baseDefineMigration<typeof schema>(migration);'
      );
      expect(generatedMigrations).not.toContain('defineMigrationSet');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generated api works with merged leaves and server proxy', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    );

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'server.js'),
        `export { createApiLeaf, createGeneratedFunctionReference } from ${JSON.stringify(path.join(packageRoot, 'src', 'server', 'api-entry.ts'))};`
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        const makeRef = (name) => ({ [Symbol.for("functionName")]: name });

        export const api = {
          admin: {
            checkUserAdminStatus: makeRef("admin:checkUserAdminStatus"),
          },
          todos: {
            create: makeRef("todos:create"),
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'admin.ts'),
        `
        export const checkUserAdminStatus = {
          _crpcMeta: {
            type: "query",
            auth: "required",
            role: "admin",
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const create = {
          _crpcMeta: {
            type: "mutation",
            auth: "required",
            ratelimit: "todo/create",
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export const health = {
          _crpcHttpRoute: { path: "/api/health", method: "GET" },
        };

        export const httpRouter = {
          _def: {
            router: true,
            procedures: {
              health: {
                _crpcHttpRoute: { path: "/api/health", method: "GET" },
              },
            },
          },
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });
      const { outputFile } = getConvexConfig();
      const generatedSource = fs.readFileSync(outputFile, 'utf-8');
      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      expect(generatedSource).toContain(
        'http: undefined as unknown as typeof httpRouter,'
      );
      expect(generatedSource).toContain('export type Api = typeof api;');
      expect(generatedSource).not.toContain('export type GenericCtx =');
      expect(generatedSource).not.toContain('WithHttpRouter');
      expect(generatedServer).toContain(
        'export type QueryCtx = ServerQueryCtx;'
      );
      expect(generatedServer).toContain(
        'export type MutationCtx = ServerMutationCtx;'
      );
      expect(generatedServer).toContain(
        'export type ActionCtx = ServerActionCtx;'
      );
      expect(generatedServer).toContain(
        'export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(generatedServer).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(generatedServer).not.toContain('createOrm');
      expect(generatedServer).toContain('export function withOrm<');
      expect(generatedServer).toContain(
        'export type OrmCtx<Ctx = QueryCtx> = Ctx;'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      const generated = await import(pathToFileURL(outputFile).href);
      const api = generated.api as any;

      expect(generated).toHaveProperty('api');
      expect(generated).not.toHaveProperty('crpcMeta');
      expect(api).not.toHaveProperty('__kitcnCrpcMeta');
      expect(api.http).toBeUndefined();

      expect(api.admin.checkUserAdminStatus.type).toBe('query');
      expect(api.admin.checkUserAdminStatus.auth).toBe('required');
      expect(api.admin.checkUserAdminStatus.role).toBe('admin');
      expect(getFunctionName(api.admin.checkUserAdminStatus)).toBe(
        'admin:checkUserAdminStatus'
      );
      expect(getFunctionName(api.admin.checkUserAdminStatus.functionRef)).toBe(
        'admin:checkUserAdminStatus'
      );

      expect(api.todos.create.type).toBe('mutation');
      expect(api.todos.create.ratelimit).toBe('todo/create');
      expect(getFunctionName(api.todos.create)).toBe('todos:create');
      expect(getFunctionName(api.todos.create.functionRef)).toBe(
        'todos:create'
      );

      const crpc = createServerCRPCProxy({ api }) as any;
      const queryOptions = crpc.admin.checkUserAdminStatus.queryOptions(
        { userId: 'u_1' },
        { skipUnauth: true }
      );
      expect(queryOptions.queryKey).toEqual([
        'convexQuery',
        'admin:checkUserAdminStatus',
        { userId: 'u_1' },
      ]);
      expect(queryOptions.meta).toMatchObject({
        authType: 'required',
        skipUnauth: true,
      });
      expect(crpc.admin.checkUserAdminStatus.meta).toEqual({
        type: 'query',
        auth: 'required',
        role: 'admin',
      });

      expect(crpc.http.health.queryOptions({})).toMatchObject({
        queryKey: ['httpQuery', 'health', {}],
        meta: { path: '/api/health', method: 'GET' },
      });
      expect(() => crpc.http.missing.queryOptions({})).toThrow(
        HTTP_ROUTE_NOT_FOUND_MISSING_RE
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generated server contract includes auth runtime when auth.ts exports default auth definition', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    );

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'server.js'),
        `export { createApiLeaf } from ${JSON.stringify(path.join(packageRoot, 'src', 'server', 'api-entry.ts'))};`
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        const makeRef = (name) => ({ [Symbol.for("functionName")]: name });

        export const api = {
          todos: {
            list: makeRef("todos:list"),
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: "query",
          },
        };
        `.trim()
      );

      writeFile(path.join(dir, 'convex', 'schema.ts'), ORM_SCHEMA_STUB);

      writeFile(
        path.join(dir, 'convex', 'auth.ts'),
        `
        export default (_ctx) => ({
          baseURL: "http://localhost:3000",
          triggers: {},
        });
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedServerFile, 'utf-8');

      expect(generatedAuth).toContain('createAuthRuntime');
      expect(generatedAuth).toContain('getInvalidAuthDefinitionExportReason,');
      expect(generatedAuth).toContain(
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).toContain(
        'type AuthDefinitionFromFile = typeof authDefinitionModule.default;'
      );
      expect(generatedAuth).toContain('createAuthRuntime<');
      expect(generatedAuth).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedAuth).toContain(
        'const authDefinition = resolveGeneratedAuthDefinition<AuthDefinitionFromFile>('
      );
      expect(generatedAuth).toContain(
        'getInvalidAuthDefinitionExportReason("convex/auth.ts")'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).toContain('auth: authDefinition,');
      expect(generatedAuth).toContain('context: withOrm,');
      expect(generatedAuth).toContain('authEnabled,');
      expect(generatedAuth).not.toContain('createDisabledAuthRuntime');
      expect(generatedAuth).not.toContain('const authFunctions: AuthFunctions');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generated server contract emits disabled auth runtime when auth.ts is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    );

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'server.js'),
        `export { createApiLeaf } from ${JSON.stringify(path.join(packageRoot, 'src', 'server', 'api-entry.ts'))};`
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        const makeRef = (name) => ({ [Symbol.for("functionName")]: name });

        export const api = {
          todos: {
            list: makeRef("todos:list"),
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: "query",
          },
        };
        `.trim()
      );

      writeFile(path.join(dir, 'convex', 'schema.ts'), ORM_SCHEMA_STUB);

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedServerFile, 'utf-8');

      expect(generatedAuth).toContain('createDisabledAuthRuntime');
      expect(generatedAuth).toContain('const authRuntime: AuthRuntime<');
      expect(generatedAuth).toContain(
        '> = createDisabledAuthRuntime<DataModel, typeof schema, MutationCtx, GenericCtx>({'
      );
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason(');
      expect(generatedAuth).toContain('"missing_auth_file"');
      expect(generatedAuth).toContain('"convex/auth.ts"');
      expect(generatedAuth).toContain("} from 'kitcn/auth/generated';");
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).toContain('authEnabled,');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
      expect(generatedAuth).not.toContain("} from 'kitcn/auth';");
      expect(generatedAuth).not.toContain('createAuthRuntime,');
      expect(generatedAuth).not.toContain('createAuthRuntime<DataModel');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generated server contract emits disabled auth runtime when auth.ts has no default export', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../..'
    );

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'kitcn', 'server.js'),
        `export { createApiLeaf } from ${JSON.stringify(path.join(packageRoot, 'src', 'server', 'api-entry.ts'))};`
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        const makeRef = (name) => ({ [Symbol.for("functionName")]: name });

        export const api = {
          todos: {
            list: makeRef("todos:list"),
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: "query",
          },
        };
        `.trim()
      );

      writeFile(path.join(dir, 'convex', 'schema.ts'), ORM_SCHEMA_STUB);

      writeFile(
        path.join(dir, 'convex', 'auth.ts'),
        `
        export const authConfig = {
          baseURL: "http://localhost:3000",
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedAuth).toContain('createDisabledAuthRuntime');
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason(');
      expect(generatedAuth).toContain('"missing_default_export"');
      expect(generatedAuth).toContain('"convex/auth.ts"');
      expect(generatedAuth).toContain("} from 'kitcn/auth/generated';");
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
      expect(generatedAuth).not.toContain("} from 'kitcn/auth';");
      expect(generatedAuth).not.toContain('createAuthRuntime,');
    } finally {
      process.chdir(oldCwd);
    }
  });
});
