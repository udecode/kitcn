import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { generateMeta, getConvexConfig } from './codegen';

const RESERVED_HTTP_NAMESPACE_ERROR = /root "http" namespace is reserved/i;
const RESERVED_RUNTIME_NAMESPACE_ERROR = /reserved runtime caller namespace/i;

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'better-convex-codegen-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeScopedFixture(dir: string) {
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
  writeFile(
    path.join(dir, 'convex', 'http.ts'),
    `
    export default {};
    `.trim()
  );
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
        path.join(dir, 'convex', 'generated', 'server.ts'),
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
      const serverGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      expect(fs.existsSync(serverGeneratedFile)).toBe(true);
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      const migrationsGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'migrations.gen.ts'
      );
      expect(fs.existsSync(migrationsGeneratedFile)).toBe(true);
      const migrationsGenerated = fs.readFileSync(
        migrationsGeneratedFile,
        'utf-8'
      );
      const nestedRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'items',
        'queries.runtime.ts'
      );
      expect(fs.existsSync(nestedRuntimeFile)).toBe(true);
      const allRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'all.runtime.ts'
      );
      const serverRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'server.runtime.ts'
      );
      expect(fs.existsSync(allRuntimeFile)).toBe(false);
      expect(fs.existsSync(serverRuntimeFile)).toBe(true);
      const serverRuntimeGenerated = fs.readFileSync(
        serverRuntimeFile,
        'utf-8'
      );
      const nestedRuntimeGenerated = fs.readFileSync(
        nestedRuntimeFile,
        'utf-8'
      );
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
      expect(serverGenerated).not.toContain('export type MigrationCtx =');
      expect(serverGenerated).toContain(
        'export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx>'
      );
      expect(serverGenerated).not.toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(serverGenerated).not.toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain(
        'export function createCaller<TCtx extends'
      );
      expect(serverGenerated).not.toContain(
        'export function createHandler<TCtx extends'
      );
      expect(nestedRuntimeGenerated).toContain('const procedureRegistry = {');
      expect(nestedRuntimeGenerated).not.toContain('const handlerRegistry = {');
      expect(nestedRuntimeGenerated).not.toContain(
        'export type ProcedureCallerContext = QueryCtx | MutationCtx | ActionCtx;'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'export type ProcedureHandlerContext = QueryCtx | MutationCtx;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureCallerContext = QueryCtx | MutationCallerContext | ActionCtx;'
      );
      expect(nestedRuntimeGenerated).toContain(
        "import type { OrmTriggerContext } from 'better-convex/orm';"
      );
      expect(nestedRuntimeGenerated).toContain(
        'type MutationCallerContext = MutationCtx | OrmTriggerContext<any, MutationCtx>;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureHandlerContext = QueryCtx | MutationCtx;'
      );
      expect(nestedRuntimeGenerated).toContain(
        "type RuntimeServerModule = typeof import('better-convex/server');"
      );
      expect(nestedRuntimeGenerated).toContain(
        'function createProcedureRegistry() {'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureRegistryBundle = ReturnType<typeof createProcedureRegistry>;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'let cachedProcedureRegistry: ProcedureRegistryBundle | undefined;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'function createCallerFromRegistryFactory() {'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type CallerFactory = ReturnType<typeof createCallerFromRegistryFactory>;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'function getCreateCallerFromRegistry(): CallerFactory {'
      );
      expect(nestedRuntimeGenerated).toContain(
        "const { typedProcedureResolver } =\n    (require('better-convex/server') as RuntimeServerModule);"
      );
      expect(nestedRuntimeGenerated).toContain(
        'if (cachedProcedureRegistry) {\n    return cachedProcedureRegistry;\n  }'
      );
      expect(nestedRuntimeGenerated).toContain(
        'const { api, internal } =\n    (require("../../_generated/api.js") as typeof import(\'../../_generated/api.js\'));'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        "import { api, internal } from '../_generated/api.js';"
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'import {\n  createGenericCallerFactory,'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'const createCallerFromRegistry = createGenericCallerFactory<'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        "RuntimeServerModule['createGenericCallerFactory']<"
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'let cachedProcedureRegistry: ReturnType<typeof buildProcedureRegistry> | undefined;'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'export type GeneratedProcedureCaller<'
      );
      expect(nestedRuntimeGenerated).toContain(
        'export function createItemsQueriesCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(nestedRuntimeGenerated).toContain(
        'export function createItemsQueriesHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(serverRuntimeGenerated).toContain(
        'export function createServerCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(serverRuntimeGenerated).not.toContain(
        'export function createServerHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(serverRuntimeGenerated).not.toContain(
        'createGenericHandlerFactory'
      );
      expect(serverRuntimeGenerated).toContain(
        '"scheduledMutationBatch": ["mutation", typedProcedureResolver(internal["generated"]["server"]["scheduledMutationBatch"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"scheduledDelete": ["mutation", typedProcedureResolver(internal["generated"]["server"]["scheduledDelete"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"aggregateBackfill": ["mutation", typedProcedureResolver(internal["generated"]["server"]["aggregateBackfill"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"aggregateBackfillChunk": ["mutation", typedProcedureResolver(internal["generated"]["server"]["aggregateBackfillChunk"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"aggregateBackfillStatus": ["mutation", typedProcedureResolver(internal["generated"]["server"]["aggregateBackfillStatus"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"migrationRun": ["mutation", typedProcedureResolver(internal["generated"]["server"]["migrationRun"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"migrationRunChunk": ["mutation", typedProcedureResolver(internal["generated"]["server"]["migrationRunChunk"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"migrationStatus": ["mutation", typedProcedureResolver(internal["generated"]["server"]["migrationStatus"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"migrationCancel": ["mutation", typedProcedureResolver(internal["generated"]["server"]["migrationCancel"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"resetChunk": ["mutation", typedProcedureResolver(internal["generated"]["server"]["resetChunk"]'
      );
      expect(serverRuntimeGenerated).toContain(
        '"reset": ["action", typedProcedureResolver(internal["generated"]["server"]["reset"]'
      );
      expect(nestedRuntimeGenerated).toContain(
        "import type { ActionCtx, MutationCtx, QueryCtx } from '../server';"
      );
      expect(nestedRuntimeGenerated).toContain(
        '"internalOnly": ["query", typedProcedureResolver(internal["items"]["queries"]["internalOnly"], () => (require("../../items/queries") as Record<string, unknown>)["internalOnly"])],'
      );
      expect(serverGenerated).toContain('aggregateBackfill');
      expect(serverGenerated).toContain('aggregateBackfillChunk');
      expect(serverGenerated).toContain('aggregateBackfillStatus');
      expect(serverGenerated).toContain('migrationRun');
      expect(serverGenerated).toContain('migrationRunChunk');
      expect(serverGenerated).toContain('migrationStatus');
      expect(serverGenerated).toContain('migrationCancel');
      expect(serverGenerated).toContain('resetChunk');
      expect(serverGenerated).toContain('reset');
      expect(migrationsGenerated).toContain(
        "import { relations } from '../schema';"
      );
      expect(migrationsGenerated).not.toContain('export type MigrationCtx =');
      expect(migrationsGenerated).toContain('export function defineMigration(');
      expect(migrationsGenerated).not.toContain('defineMigrationSet');

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
      const serverGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      const serverRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'server.runtime.ts'
      );
      const todosRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'todos.runtime.ts'
      );
      const todosRuntimeGenerated = fs.readFileSync(todosRuntimeFile, 'utf-8');
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
      expect(serverGenerated).not.toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(serverGenerated).not.toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain(
        'export function createHandler<TCtx extends'
      );
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).not.toContain('withOrm');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).not.toContain('export type OrmCtx<');
      expect(fs.existsSync(serverRuntimeFile)).toBe(false);
      expect(todosRuntimeGenerated).toContain(
        "import type { ActionCtx, MutationCtx, QueryCtx } from './server';"
      );
      expect(todosRuntimeGenerated).toContain(
        "import type { OrmTriggerContext } from 'better-convex/orm';"
      );
      expect(todosRuntimeGenerated).toContain(
        "type RuntimeServerModule = typeof import('better-convex/server');"
      );
      expect(todosRuntimeGenerated).toContain(
        'function getCreateCallerFromRegistry(): CallerFactory {'
      );
      expect(todosRuntimeGenerated).toContain(
        '"list": ["query", typedProcedureResolver(api["todos"]["list"], () => (require("../todos") as Record<string, unknown>)["list"])],'
      );
      expect(todosRuntimeGenerated).not.toContain(
        "import { api, internal } from './_generated/api.js';"
      );
      expect(todosRuntimeGenerated).toContain(
        'export function createTodosCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(todosRuntimeGenerated).toContain(
        'export function createTodosHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(todosRuntimeGenerated).not.toContain(
        'export type ProcedureCallerContext ='
      );
      expect(todosRuntimeGenerated).not.toContain(
        'export type ProcedureHandlerContext ='
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta supports first-run runtime placeholders with module-named exports', async () => {
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
          foo: {
            list: { ref: 'foo:list' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'foo.ts'),
        `
        import { createFooCaller } from './generated/foo.runtime';
        void createFooCaller;

        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(path.join(dir, 'convex', 'schema.ts'), 'export default {};');
      writeFile(path.join(dir, 'convex', 'http.ts'), 'export default {};');

      await generateMeta(undefined, { silent: true });

      const runtimeFile = path.join(
        dir,
        'convex',
        'generated',
        'foo.runtime.ts'
      );
      const runtimeGenerated = fs.readFileSync(runtimeFile, 'utf-8');
      expect(runtimeGenerated).toContain(
        'export function createFooCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(runtimeGenerated).toContain(
        'export function createFooHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(runtimeGenerated).not.toContain('export function createCaller(');
      expect(runtimeGenerated).not.toContain('export function createHandler(');
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
      const serverGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      const serverRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'server.runtime.ts'
      );
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
      expect(serverGenerated).not.toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).not.toContain('withOrm');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).not.toContain('export type OrmCtx<');
      expect(fs.existsSync(serverRuntimeFile)).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta wires schema triggers into generated server when triggers export exists', async () => {
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
        export const triggers = {
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
        'server.ts'
      );
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain(
        "import schema, { relations, triggers } from '../schema';"
      );
      expect(generatedServer).toContain('schema: relations,');
      expect(generatedServer).toContain('triggers,');
      expect(generatedServer).toContain('ormFunctions,');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta wires migrations manifest into generated server when present', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'migrations', 'manifest.ts'),
        `
        export const migrations = {
          migrations: [],
          ids: [],
          byId: {},
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const serverGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const serverGenerated = fs.readFileSync(serverGeneratedFile, 'utf-8');
      const migrationsGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'migrations.gen.ts'
      );
      const migrationsGenerated = fs.readFileSync(
        migrationsGeneratedFile,
        'utf-8'
      );

      expect(serverGenerated).toContain(
        "import { migrations } from '../migrations/manifest';"
      );
      expect(serverGenerated).toContain('migrations,');
      expect(migrationsGenerated).toContain('export function defineMigration(');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta throws when schema exports triggers without relations', async () => {
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
        export const api = {};
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        export const triggers = {
          todos: {},
        };
        export default {};
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        "schema.ts exports 'triggers' but is missing 'relations'"
      );
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

      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      expect(generatedAuth).toContain('createAuthRuntime');
      expect(generatedAuth).toContain(
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason,');
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
      const generatedRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.runtime.ts'
      );
      const generatedRuntime = fs.readFileSync(generatedRuntimeFile, 'utf-8');
      expect(generatedRuntime).toContain(
        '"create": ["mutation", typedProcedureResolver('
      );
      expect(generatedRuntime).toContain(
        '"findOne": ["query", typedProcedureResolver('
      );
      expect(generatedRuntime).not.toContain('"beforeCreate": [');
      expect(generatedRuntime).not.toContain('"onCreate": [');
      expect(generatedRuntime).toContain(
        'export function createGeneratedAuthCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(generatedRuntime).toContain(
        'export function createGeneratedAuthHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(generatedAuth).not.toContain('createDisabledAuthRuntime');
      expect(generatedAuth).not.toContain('const authFunctions: AuthFunctions');
      expect(generatedAuth).not.toContain(
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

      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      expect(generatedAuth).toContain('createAuthRuntime');
      expect(generatedAuth).toContain(
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason,');
      expect(generatedAuth).toContain('type AuthDefinitionFromFile = Extract<');
      expect(generatedAuth).toContain('createAuthRuntime<');
      expect(generatedAuth).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedAuth).toContain(
        'getGeneratedAuthDisabledReason("default_export_unavailable")'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).not.toContain('import { withOrm } from');
      expect(generatedAuth).not.toContain('context: withOrm,');
      expect(generatedAuth).not.toContain('createDisabledAuthRuntime');

      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const generatedServer = fs.readFileSync(generatedServerFile, 'utf-8');
      expect(generatedServer).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>();'
      );
      expect(generatedServer).not.toContain('createOrm');
      expect(generatedServer).not.toContain('withOrm');
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

      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
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
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).not.toContain('createAuthRuntime<DataModel');
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

      const generatedAuthFile = path.join(
        dir,
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      expect(generatedAuth).toContain('createDisabledAuthRuntime');
      expect(generatedAuth).toContain(
        'getGeneratedAuthDisabledReason("missing_default_export")'
      );
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from '../auth';"
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
        RESERVED_HTTP_NAMESPACE_ERROR
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta rejects reserved runtime caller export names', async () => {
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
            actions: { ref: 'todos:actions' },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        export const actions = {
          _crpcMeta: { type: 'query' },
        };
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        RESERVED_RUNTIME_NAMESPACE_ERROR
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta scope=auth emits server+auth outputs only and removes stale cRPC outputs', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(path.join(dir, 'convex', 'shared', 'api.ts'), 'export {};');
      writeFile(
        path.join(dir, 'convex', 'generated', 'todos.runtime.ts'),
        'export {};'
      );
      writeFile(
        path.join(dir, 'convex', 'generated', 'items', 'queries.runtime.ts'),
        'export {};'
      );

      await generateMeta(undefined, { silent: true, scope: 'auth' as any });

      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'server.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      const serverRuntimeGenerated = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.runtime.ts'),
        'utf-8'
      );
      expect(serverRuntimeGenerated).toContain(
        'export function createServerCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(serverRuntimeGenerated).not.toContain(
        'export function createServerHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        false
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'items', 'queries.runtime.ts')
        )
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta scope=orm emits only generated/server.ts and removes auth+cRPC artifacts', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(path.join(dir, 'convex', 'shared', 'api.ts'), 'export {};');
      writeFile(path.join(dir, 'convex', 'generated', 'auth.ts'), 'export {};');
      writeFile(
        path.join(dir, 'convex', 'generated', 'auth.runtime.ts'),
        'export {};'
      );
      writeFile(
        path.join(dir, 'convex', 'generated', 'todos.runtime.ts'),
        'export {};'
      );

      await generateMeta(undefined, { silent: true, scope: 'orm' as any });

      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'server.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'migrations.gen.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(false);
      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        false
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta removes stale scoped outputs when switching all -> auth -> orm', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);

      await generateMeta(undefined, { silent: true, scope: 'all' as any });
      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        true
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);

      await generateMeta(undefined, { silent: true, scope: 'auth' as any });
      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        false
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(true);

      await generateMeta(undefined, { silent: true, scope: 'orm' as any });
      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        false
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'server.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta with api=true auth=false keeps api outputs and removes auth outputs', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      await generateMeta(undefined, {
        silent: true,
        api: true,
        auth: false,
      } as any);

      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        true
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'server.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta with api=false auth=false removes api.ts and auth outputs', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      await generateMeta(undefined, {
        silent: true,
        api: false,
        auth: false,
      } as any);

      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        false
      );
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'server.ts'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'auth.runtime.ts'))
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'server.runtime.ts')
        )
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta preserves module runtime file when module parse fails', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        throw new Error('parse failure');
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      const todosRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'todos.runtime.ts'
      );
      const runtimeSentinel = '// keep me';
      writeFile(todosRuntimeFile, runtimeSentinel);

      await generateMeta(undefined, { silent: true });

      expect(fs.existsSync(todosRuntimeFile)).toBe(true);
      expect(fs.readFileSync(todosRuntimeFile, 'utf-8')).toContain(
        runtimeSentinel
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta throws deterministic error for invalid scope', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      await expect(
        generateMeta(undefined, { silent: true, scope: 'bad' as any })
      ).rejects.toThrow(
        'Invalid codegen scope "bad". Expected one of: all, auth, orm.'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });
});
