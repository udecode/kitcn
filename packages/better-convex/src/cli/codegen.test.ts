import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { generateMeta, getConvexConfig } from './codegen';

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-codegen-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('cli/codegen', () => {
  test('getConvexConfig uses defaults when convex.json is missing', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      const cwd = process.cwd();
      const cfg = getConvexConfig();
      expect(cfg).toEqual({
        functionsDir: path.join(cwd, 'convex'),
        outputFile: path.join(cwd, 'convex', 'shared', 'api.ts'),
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('getConvexConfig respects convex.json functions dir and outputDir override', () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    writeFile(
      path.join(dir, 'convex.json'),
      JSON.stringify({ functions: 'fn' })
    );

    process.chdir(dir);
    try {
      const cwd = process.cwd();
      const cfg = getConvexConfig('out/meta');
      expect(cfg).toEqual({
        functionsDir: path.join(cwd, 'fn'),
        outputFile: path.join(cwd, 'out', 'meta', 'api.ts'),
      });
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits merged public api leaves and dedupes _http routes', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );

      // Runtime Convex API refs used as values in generated api.ts.
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          items: {
            queries: {
              get: { ref: 'items:queries:get' },
              list: { ref: 'items:queries:list' },
            },
          },
          posts: {
            create: { ref: 'posts:create' },
          },
        };
        `.trim()
      );

      // Functions (Convex default).
      writeFile(
        path.join(dir, 'convex', 'items', 'queries.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
            auth: 'optional',
            role: 'admin',
            rateLimit: 10,
            dev: true,
            nested: { a: 1 },
          },
        };

        export const get = {
          _crpcMeta: {
            type: 'query',
          },
        };

        export const internalOnly = { _crpcMeta: { type: 'query', internal: true } };
        export const _private = { _crpcMeta: { type: 'query', auth: 'required' } };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'posts.ts'),
        `
        export const create = { _crpcMeta: { type: 'mutation' } };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      // Excluded by isValidConvexFile.
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          users: { table: 'users' },
          todos: { table: 'todos' },
        };

        export const relations = {
          users: {},
          todos: {},
        };

        export const shouldNotAppear = { _crpcMeta: { type: 'query' } };
        `.trim()
      );
      // Excluded by private file/dir rule.
      writeFile(
        path.join(dir, 'convex', '_private.ts'),
        `export const shouldNotAppear = { _crpcMeta: { type: 'query' } };`
      );
      // Excluded generated server file (should never be parsed as cRPC module).
      writeFile(
        path.join(dir, 'convex', 'generated.ts'),
        `export const shouldBeIgnored = { _crpcMeta: { type: 'query' } };`
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.ts'),
        `export const shouldNotAppear = { _crpcMeta: { type: 'query' } };`
      );
      // Excluded auth module (to prevent generated/auth circular scan issues).
      writeFile(
        path.join(dir, 'convex', 'auth.ts'),
        `export const shouldBeIgnoredAuth = { _crpcMeta: { type: 'query' } };`
      );

      // HTTP routes: export-level + router-level with duplicate route keys.
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export const get = {
          _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' },
        };

        export const httpRouter = {
          _def: {
            router: true,
            procedures: {
              health: {},
            },
          },
        };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'routers', 'todos.ts'),
        `
        export const router = {
          _def: {
            router: true,
            procedures: {
              // Duplicate of todos.get (same route path+method) - should be deduped away.
              get: { _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' } },
              'todos.get': { _crpcHttpRoute: { path: '/api/todos/:id', method: 'GET' } },
              'todos.create': { _crpcHttpRoute: { path: '/api/todos', method: 'POST' } },
            },
          },
        };

        export function __cov() {
          return 1;
        }
        __cov();
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      expect(fs.existsSync(outputFile)).toBe(true);
      const generated = fs.readFileSync(outputFile, 'utf-8');
      const serverGeneratedFile = path.join(dir, 'convex', 'generated.ts');
      expect(fs.existsSync(serverGeneratedFile)).toBe(true);
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      expect(generated).toContain(
        'import { createApiLeaf } from "better-convex/server";'
      );
      expect(generated).toContain(
        'import type { inferApiInputs, inferApiOutputs } from "better-convex/server";'
      );
      expect(generated).toContain(
        'import type { InferInsertModel, InferSelectModel } from "better-convex/orm";'
      );
      expect(generated).toContain('import type { httpRouter } from "../http";');
      expect(generated).toContain('import type { tables } from "../schema";');
      expect(generated).not.toContain(
        'import type { relations } from "../schema";'
      );
      expect(generated).toContain(
        'http: undefined as unknown as typeof httpRouter,'
      );
      expect(generated).toContain('export type Api = typeof api;');
      expect(generated).toContain(
        'export type ApiInputs = inferApiInputs<Api>;'
      );
      expect(generated).toContain(
        'export type ApiOutputs = inferApiOutputs<Api>;'
      );
      expect(generated).not.toContain('export type GenericCtx =');
      expect(generated).not.toContain('export type OrmCtx<');
      expect(generated).not.toContain('export type OrmQueryCtx');
      expect(generated).not.toContain('export type OrmMutationCtx');
      expect(generated).toContain(
        'export type TableName = keyof typeof tables;'
      );
      expect(generated).toContain(
        'export type Select<T extends TableName> = InferSelectModel<(typeof tables)[T]>;'
      );
      expect(generated).toContain(
        'export type Insert<T extends TableName> = InferInsertModel<(typeof tables)[T]>;'
      );
      expect(generated).not.toContain('const decorateApiFunction');
      expect(generated).not.toContain('ApiFunctionEntry');
      expect(generated).not.toContain('ApiFunctionLeafMeta');
      expect(generated).not.toContain('ApiFunctionRefFromExport');
      expect(generated).not.toContain('shouldBeIgnored');
      expect(generated).not.toContain('shouldBeIgnoredAuth');

      expect(serverGenerated).toContain(
        "import { createOrm, type GenericOrmCtx, type OrmFunctions } from 'better-convex/orm';"
      );
      expect(serverGenerated).toContain(
        "import { initCRPC as baseInitCRPC } from 'better-convex/server';"
      );
      expect(serverGenerated).toContain(
        "import {\n  createGenericCallerFactory,\n  createGenericHandlerFactory,\n  typedProcedureResolver,\n  type ProcedureCallerFromRegistry,\n} from 'better-convex/server';"
      );
      expect(serverGenerated).toContain('export const orm = createOrm({');
      expect(serverGenerated).toContain(
        'export type QueryCtx = OrmCtx<ServerQueryCtx>;'
      );
      expect(serverGenerated).toContain(
        'export type MutationCtx = OrmCtx<ServerMutationCtx>;'
      );
      expect(serverGenerated).toContain(
        'export type ActionCtx = ServerActionCtx;'
      );
      expect(serverGenerated).toContain(
        'export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(serverGenerated).toContain(
        'export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx>'
      );
      expect(serverGenerated).toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(serverGenerated).toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain('createRequire');
      expect(serverGenerated).toContain(
        '"items.queries.internalOnly": ["query", typedProcedureResolver(internal["items"]["queries"]["internalOnly"], () => (require("./items/queries") as Record<string, unknown>)["internalOnly"])],'
      );
      expect(serverGenerated).toContain(
        'export function createCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(serverGenerated).toContain(
        'const createCallerFromRegistry = createGenericCallerFactory<'
      );
      expect(serverGenerated).toContain(
        'export type ProcedureCallerContext = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(serverGenerated).toContain(
        'export type ProcedureHandlerContext = QueryCtx | MutationCtx;'
      );
      expect(serverGenerated).toContain(
        'const createHandlerFromRegistry = createGenericHandlerFactory<'
      );
      expect(serverGenerated).toContain(
        'export function createHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(serverGenerated).toContain(
        'export const { scheduledMutationBatch, scheduledDelete } = orm.api();'
      );

      const module = await import(pathToFileURL(outputFile).href);
      expect(module).toHaveProperty('api');
      expect(module).not.toHaveProperty('crpcMeta');

      const api = module.api as any;
      expect(api.http).toBeUndefined();

      // Leaf uses merged metadata + functionRef while preserving runtime ref identity.
      expect(api.items.queries.list.ref).toBe('items:queries:list');
      expect(api.items.queries.list.type).toBe('query');
      expect(api.items.queries.list.auth).toBe('optional');
      expect(api.items.queries.list.role).toBe('admin');
      expect(api.items.queries.list.rateLimit).toBe(10);
      expect(api.items.queries.list.dev).toBe(true);
      expect(api.items.queries.list.functionRef).toBe(api.items.queries.list);
      expect(api.items.queries).not.toHaveProperty('internalOnly');
      expect(api.items.queries).not.toHaveProperty('_private');

      expect(api.posts.create.ref).toBe('posts:create');
      expect(api.posts.create.type).toBe('mutation');
      expect(api.posts.create.functionRef).toBe(api.posts.create);

      // Hidden metadata key should not exist anymore.
      expect(Object.keys(api)).not.toContain('__betterConvexCrpcMeta');

      // HTTP route map is present on api root and should prefer longer/nested keys.
      expect(api._http['todos.get']).toEqual({
        path: '/api/todos/:id',
        method: 'GET',
      });
      expect(api._http['todos.create']).toEqual({
        path: '/api/todos',
        method: 'POST',
      });
      expect(api._http).not.toHaveProperty('get');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta omits optional type helpers when schema tables and httpRouter are missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export default {};
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export default {};
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      const generated = fs.readFileSync(outputFile, 'utf-8');
      const serverGeneratedFile = path.join(dir, 'convex', 'generated.ts');
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      expect(generated).toContain(
        'import type { inferApiInputs, inferApiOutputs } from "better-convex/server";'
      );
      expect(generated).not.toContain('WithHttpRouter');
      expect(generated).toContain('export type Api = typeof api;');
      expect(generated).toContain(
        'export type ApiInputs = inferApiInputs<Api>;'
      );
      expect(generated).toContain(
        'export type ApiOutputs = inferApiOutputs<Api>;'
      );
      expect(generated).not.toContain('export type GenericCtx =');
      expect(generated).not.toContain('GenericOrmCtx');
      expect(generated).not.toContain('export type OrmCtx<');
      expect(generated).not.toContain('export type OrmQueryCtx');
      expect(generated).not.toContain('export type OrmMutationCtx');
      expect(generated).not.toContain('InferSelectModel');
      expect(generated).not.toContain('InferInsertModel');
      expect(generated).not.toContain('TableName');
      expect(generated).not.toContain('export type Select<');
      expect(generated).not.toContain('export type Insert<');
      expect(serverGenerated).toContain(
        'export type QueryCtx = ServerQueryCtx;'
      );
      expect(serverGenerated).toContain(
        'export type MutationCtx = ServerMutationCtx;'
      );
      expect(serverGenerated).toContain(
        'export type ActionCtx = ServerActionCtx;'
      );
      expect(serverGenerated).toContain(
        'export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(serverGenerated).toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(serverGenerated).toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain('createRequire');
      expect(serverGenerated).toContain(
        '"todos.list": ["query", typedProcedureResolver(api["todos"]["list"], () => (require("./todos") as Record<string, unknown>)["list"])],'
      );
      expect(serverGenerated).toContain(
        'const createHandlerFromRegistry = createGenericHandlerFactory<'
      );
      expect(serverGenerated).toContain(
        'export function createHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).not.toContain('withOrm');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).not.toContain('export type OrmCtx<');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta keeps table helpers but omits Orm* helpers when relations export is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: 'todos' },
        };
        export default {};
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export default {};
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      const generated = fs.readFileSync(outputFile, 'utf-8');
      const serverGeneratedFile = path.join(dir, 'convex', 'generated.ts');
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      expect(generated).not.toContain('export type GenericCtx =');
      expect(generated).toContain(
        'export type TableName = keyof typeof tables;'
      );
      expect(generated).toContain(
        'export type Select<T extends TableName> = InferSelectModel<(typeof tables)[T]>;'
      );
      expect(generated).toContain(
        'export type Insert<T extends TableName> = InferInsertModel<(typeof tables)[T]>;'
      );

      expect(generated).not.toContain('import type { relations }');
      expect(generated).not.toContain('GenericOrmCtx');
      expect(generated).not.toContain('export type OrmCtx<');
      expect(generated).not.toContain('export type OrmQueryCtx');
      expect(generated).not.toContain('export type OrmMutationCtx');
      expect(serverGenerated).toContain(
        'export type QueryCtx = ServerQueryCtx;'
      );
      expect(serverGenerated).toContain(
        'export type MutationCtx = ServerMutationCtx;'
      );
      expect(serverGenerated).toContain(
        'export type ActionCtx = ServerActionCtx;'
      );
      expect(serverGenerated).toContain(
        'export type GenericCtx = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(serverGenerated).toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).not.toContain('withOrm');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).not.toContain('export type OrmCtx<');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta does not infer HTTP router from legacy appRouter export', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: { type: 'query' },
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export const appRouter = {
          _def: { router: true, procedures: {} },
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      const generated = fs.readFileSync(outputFile, 'utf-8');
      expect(generated).not.toContain('import type { httpRouter }');
      expect(generated).not.toContain('WithHttpRouter');
      expect(generated).toContain('export type Api = typeof api;');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits generated auth runtime in server contract when auth.ts exports default auth definition', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: 'todos' },
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

      const generatedServerFile = path.join(dir, 'convex', 'generated.ts');
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain('createAuthRuntime');
      expect(generatedServer).toContain(
        "import * as authDefinitionModule from './auth';"
      );
      expect(generatedServer).toContain('getGeneratedAuthDisabledReason,');
      expect(generatedServer).toContain(
        'type AuthDefinitionFromFile = Extract<'
      );
      expect(generatedServer).toContain('createAuthRuntime<');
      expect(generatedServer).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedServer).toContain(
        'resolveGeneratedAuthDefinition<AuthDefinitionFromFile>('
      );
      expect(generatedServer).toContain(
        'getGeneratedAuthDisabledReason("default_export_unavailable")'
      );
      expect(generatedServer).toContain('export function defineAuth<');
      expect(generatedServer).toContain('auth: authDefinition,');
      expect(generatedServer).toContain('context: withOrm,');
      expect(generatedServer).toContain('authEnabled,');
      expect(generatedServer).not.toContain('createDisabledAuthRuntime');
      expect(generatedServer).not.toContain(
        'const authFunctions: AuthFunctions'
      );
      expect(generatedServer).not.toContain(
        'import { type AuthFunctions, createApi, createClient } from "better-convex/auth";'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits auth runtime without ORM wiring when relations export is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: 'todos' },
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

      const generatedServerFile = path.join(dir, 'convex', 'generated.ts');
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain('createAuthRuntime');
      expect(generatedServer).toContain(
        "import * as authDefinitionModule from './auth';"
      );
      expect(generatedServer).toContain('getGeneratedAuthDisabledReason,');
      expect(generatedServer).toContain(
        'type AuthDefinitionFromFile = Extract<'
      );
      expect(generatedServer).toContain('createAuthRuntime<');
      expect(generatedServer).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedServer).toContain(
        'getGeneratedAuthDisabledReason("default_export_unavailable")'
      );
      expect(generatedServer).toContain('export function defineAuth<');
      expect(generatedServer).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(generatedServer).not.toContain('createOrm');
      expect(generatedServer).not.toContain('withOrm');
      expect(generatedServer).not.toContain('context: withOrm,');
      expect(generatedServer).not.toContain('createDisabledAuthRuntime');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits disabled auth runtime when auth.ts is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const tables = {
          todos: { table: 'todos' },
        };
        export const relations = {
          todos: {},
        };
        export default {};
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(dir, 'convex', 'generated.ts');
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain('createDisabledAuthRuntime');
      expect(generatedServer).toContain(
        'const authRuntime = createDisabledAuthRuntime<DataModel, typeof schema, MutationCtx, GenericCtx>({'
      );
      expect(generatedServer).toContain(
        'getGeneratedAuthDisabledReason("missing_auth_file")'
      );
      expect(generatedServer).toContain('export function defineAuth<');
      expect(generatedServer).toContain('authEnabled,');
      expect(generatedServer).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
      expect(generatedServer).not.toContain('createAuthRuntime<DataModel');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits disabled auth runtime when auth.ts exists without default auth export', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          todos: {
            list: { ref: 'todos:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export default {};
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'auth.ts'),
        `
        export const getAuthOptions = (_ctx) => ({
          baseURL: "http://localhost:3000",
        });
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(dir, 'convex', 'generated.ts');
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain('createDisabledAuthRuntime');
      expect(generatedServer).toContain(
        'getGeneratedAuthDisabledReason("missing_default_export")'
      );
      expect(generatedServer).toContain('export function defineAuth<');
      expect(generatedServer).not.toContain(
        "import * as authDefinitionModule from './auth';"
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta rejects reserved root http namespace', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fn, meta) =>
          Object.assign(fn, meta, { functionRef: fn });
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          http: {
            list: { ref: 'http:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        export const list = {
          _crpcMeta: { type: 'query' },
        };
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        /root "http" namespace is reserved/i
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
