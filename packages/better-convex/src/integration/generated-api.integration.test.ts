import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { getFunctionName } from 'convex/server';
import { generateMeta, getConvexConfig } from '../cli/codegen';
import { createServerCRPCProxy } from '../rsc/proxy-server';

const HTTP_ROUTE_NOT_FOUND_MISSING_RE = /HTTP route not found: missing/i;

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-integration-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
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
      expect(generatedServer).toContain(
        'export type QueryCtx = OrmCtx<ServerQueryCtx>;'
      );
      expect(generatedServer).toContain('export const orm = createOrm({');
      expect(generatedServer).toContain(
        "import { initCRPC as baseInitCRPC } from 'better-convex/server';"
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
        'export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx>'
      );
      expect(generatedServer).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(generatedServer).toContain('aggregateBackfill');
      expect(generatedServer).toContain('aggregateBackfillChunk');
      expect(generatedServer).toContain('aggregateBackfillStatus');
      expect(generatedServer).toContain('migrationRun');
      expect(generatedServer).toContain('migrationRunChunk');
      expect(generatedServer).toContain('migrationStatus');
      expect(generatedServer).toContain('migrationCancel');
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedMigrations).toContain('export function defineMigration(');
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
        path.join(dir, 'node_modules', 'better-convex', 'package.json'),
        JSON.stringify({
          name: 'better-convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'better-convex', 'server.js'),
        `export { createApiLeaf } from ${JSON.stringify(path.join(packageRoot, 'src', 'server', 'api-entry.ts'))};`
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
            rateLimit: "todo/create",
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
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(generatedServer).not.toContain('createOrm');
      expect(generatedServer).not.toContain('withOrm');
      expect(generatedServer).not.toContain('export type OrmCtx<');
      expect(generatedAuth).toContain('export function defineAuth<');
      const generated = await import(pathToFileURL(outputFile).href);
      const api = generated.api as any;

      expect(generated).toHaveProperty('api');
      expect(generated).not.toHaveProperty('crpcMeta');
      expect(api).not.toHaveProperty('__betterConvexCrpcMeta');
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
      expect(api.todos.create.rateLimit).toBe('todo/create');
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
        path.join(dir, 'node_modules', 'better-convex', 'package.json'),
        JSON.stringify({
          name: 'better-convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'better-convex', 'server.js'),
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

      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: "todos" },
        };
        export const relations = {
          todos: {},
        };
        export default {};
        `.trim()
      );

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
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason,');
      expect(generatedAuth).toContain(
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).toContain('type AuthDefinitionFromFile = Extract<');
      expect(generatedAuth).toContain('createAuthRuntime<');
      expect(generatedAuth).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedAuth).toContain(
        'resolveGeneratedAuthDefinition<AuthDefinitionFromFile>('
      );
      expect(generatedAuth).toContain(
        'getGeneratedAuthDisabledReason("default_export_unavailable")'
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
        path.join(dir, 'node_modules', 'better-convex', 'package.json'),
        JSON.stringify({
          name: 'better-convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'better-convex', 'server.js'),
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

      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: "todos" },
        };
        export const relations = {
          todos: {},
        };
        export default {};
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
      expect(generatedAuth).toContain(
        'const authRuntime = createDisabledAuthRuntime<DataModel, typeof schema, MutationCtx, GenericCtx>({'
      );
      expect(generatedAuth).toContain(
        'getGeneratedAuthDisabledReason("missing_auth_file")'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).toContain('authEnabled,');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
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
        path.join(dir, 'node_modules', 'better-convex', 'package.json'),
        JSON.stringify({
          name: 'better-convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'better-convex', 'server.js'),
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

      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: "todos" },
        };
        export const relations = {
          todos: {},
        };
        export default {};
        `.trim()
      );

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
      expect(generatedAuth).toContain(
        'getGeneratedAuthDisabledReason("missing_default_export")'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
