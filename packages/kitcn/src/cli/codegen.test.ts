import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getFunctionName } from 'convex/server';
import { generateMeta, getConvexConfig } from './codegen';

const RESERVED_HTTP_NAMESPACE_ERROR = /root "http" namespace is reserved/i;
const RESERVED_RUNTIME_NAMESPACE_ERROR = /reserved runtime caller namespace/i;
const HASHED_RUNTIME_CALLER_RE =
  /export function createFooBarPlugins_[0-9a-f]{6}Caller<TCtx extends ProcedureCallerContext>\(/;

function mkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-codegen-'));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

function writeScopedFixture(dir: string) {
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
    `
    const initCRPC = {
      meta() {
        return this;
      },
      dataModel() {
        return this;
      },
      context() {
        return this;
      },
      create() {
        return {
          query: {},
          mutation: {},
          action: {},
          httpAction: {},
          router: (...args) => args[0] ?? {},
        };
      },
    };

    export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
      const meta = maybeMeta ?? pathOrMeta;
      const fn = Array.isArray(pathOrMeta)
        ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
        : fnOrRoot;
      return Object.assign(fn, meta, { functionRef: fn });
    };
    export const createGeneratedFunctionReference = (name) => ({
      [Symbol.for("functionName")]: name,
    });
    export const registerProcedureNameLookup = () => {};
    export { initCRPC };
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
    const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
    const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');
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
    export default schema;
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

function writeRealOrmFixture(dir: string) {
  const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
  fs.symlinkSync(packageRoot, path.join(dir, 'node_modules', 'kitcn'), 'dir');
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

  test('generateMeta keeps api and runtime lookup boilerplate package-owned', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);

      await generateMeta(undefined, { silent: true });

      const { outputFile } = getConvexConfig();
      const generatedApi = fs.readFileSync(outputFile, 'utf-8');
      const generatedRuntime = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'todos.runtime.ts'),
        'utf-8'
      );

      expect(generatedApi).not.toContain('function getGeneratedValue(');
      expect(generatedApi).toContain(
        'import { createApiLeaf, createGeneratedFunctionReference } from "kitcn/server";'
      );
      expect(generatedApi).toContain(
        'createApiLeaf<"query", typeof import("../todos").list>(createGeneratedFunctionReference<"query", "public", typeof import("../todos").list>("todos:list"), { type: "query" })'
      );
      expect(generatedApi).not.toContain('_generated/api.js');
      expect(generatedApi).not.toContain('convexApi');

      expect(generatedRuntime).not.toContain('function getGeneratedValue(');
      expect(generatedRuntime).not.toContain('type ProcedureArgsFromExport<');
      expect(generatedRuntime).not.toContain(
        'type ProcedureFunctionReference<'
      );
      expect(generatedRuntime).not.toContain(
        'function createProcedureRegistry()'
      );
      expect(generatedRuntime).toContain('createGeneratedFunctionReference,');
      expect(generatedRuntime).toContain('typedProcedureResolver,');
      expect(generatedRuntime).toContain('const procedureRegistry = {');
      expect(generatedRuntime).toContain(
        'type ProcedureCallerRegistry = typeof procedureRegistry;'
      );
      expect(generatedRuntime).not.toContain('_generated/api.js');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits server-side procedure name lookup registration', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        `
        import { initCRPC } from '../generated/server';

        const c = initCRPC.meta<{}>().create();

        export const publicQuery = c.query;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        import { publicQuery } from './lib/crpc';

        export const list = publicQuery.query(async () => []);
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServer = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf-8'
      );

      expect(generatedServer).toContain('registerProcedureNameLookup');
      expect(generatedServer).toContain('"convex"');
      expect(generatedServer).toContain('"todos.ts"');
      expect(generatedServer).toContain('"todos:list"');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta types regular runtime refs from source module exports', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'items', 'queries.ts'),
        `
        export const list = {
          _handler: () => [],
          _crpcMeta: {
            type: 'query',
          },
        };
        export const internalOnly = {
          _handler: () => null,
          _crpcMeta: {
            type: 'query',
            internal: true,
          },
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const moduleRuntime = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'items', 'queries.runtime.ts'),
        'utf-8'
      );
      expect(moduleRuntime).toContain('createGeneratedFunctionReference,');
      expect(moduleRuntime).not.toContain('getGeneratedFunctionReference(');
      expect(moduleRuntime).not.toContain('_generated/api.js');
      expect(moduleRuntime).not.toContain(
        "import type {\n  api as generatedApi,\n  internal as generatedInternal,\n} from '../_generated/api';"
      );
      expect(moduleRuntime).toContain(
        'createGeneratedFunctionReference<"query", "public", typeof import("../../items/queries").list>("items/queries:list")'
      );
      expect(moduleRuntime).toContain(
        'createGeneratedFunctionReference<"query", "internal", typeof import("../../items/queries").internalOnly>("items/queries:internalOnly")'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('getConvexConfig respects convex.json functions dir and sharedDir override', () => {
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

  test('generateMeta supports a file and directory with the same name', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'items.ts'),
        `
        export const rootQuery = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'items', 'list.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );

      await generateMeta('convex/shared');

      const generated = fs.readFileSync(
        path.join(dir, 'convex', 'shared', 'api.ts'),
        'utf8'
      );
      expect(generated).toContain('rootQuery');
      expect(generated).toContain('list: {');
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
        export const createGeneratedFunctionReference = (name) => ({
          [Symbol.for("functionName")]: name,
        });
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
            ratelimit: 10,
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
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
        const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');
        export const tables = {
          users: { table: 'users' },
          todos: { table: 'todos' },
        };
        const schema = { tables };
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: {},
          enumerable: false,
        });
        Object.defineProperty(schema, OrmSchemaRelations, {
          value: {
            users: { table: tables.users },
            todos: { table: tables.todos },
          },
          enumerable: false,
        });

        export const shouldNotAppear = { _crpcMeta: { type: 'query' } };
        export default schema;
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
      const ormGeneratedFile = path.join(dir, 'convex', 'generated', 'orm.ts');
      expect(fs.existsSync(ormGeneratedFile)).toBe(false);
      const crpcGeneratedFile = path.join(
        dir,
        'convex',
        'generated',
        'crpc.ts'
      );
      expect(fs.existsSync(crpcGeneratedFile)).toBe(false);
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
        'import { createApiLeaf, createGeneratedFunctionReference } from "kitcn/server";'
      );
      expect(generated).toContain(
        'import type { inferApiInputs, inferApiOutputs } from "kitcn/server";'
      );
      expect(generated).toContain(
        'import type { InferInsertModel, InferSelectModel } from "kitcn/orm";'
      );
      expect(generated).not.toContain('GeneratedQueryCtx');
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
      expect(generated).not.toContain('function getGeneratedValue(');
      expect(generated).toContain(
        'import { createApiLeaf, createGeneratedFunctionReference } from "kitcn/server";'
      );
      expect(generated).toContain(
        'createApiLeaf<"query", typeof import("../items/queries").list>(createGeneratedFunctionReference<"query", "public", typeof import("../items/queries").list>("items/queries:list"), { auth: "optional", dev: true, ratelimit: 10, role: "admin", type: "query" })'
      );
      expect(generated).not.toContain('shouldBeIgnored');
      expect(generated).not.toContain('shouldBeIgnoredAuth');
      expect(generated).not.toContain('_generated/api.js');
      expect(generated).not.toContain('convexApi');

      expect(serverGenerated).toContain('import {\n  createOrm,');
      expect(serverGenerated).not.toContain('requireSchemaRelations');
      expect(serverGenerated).not.toContain('getSchemaTriggers');
      expect(serverGenerated).toContain('initCRPC as baseInitCRPC,');
      expect(serverGenerated).toContain('createGeneratedFunctionReference,');
      expect(serverGenerated).toContain("import schema from '../schema';");
      expect(serverGenerated).not.toContain(
        "import { internal } from '../_generated/api.js';"
      );
      expect(serverGenerated).not.toContain('getGeneratedValue(');
      expect(serverGenerated).toContain('const ormFunctions: OrmFunctions = {');
      expect(serverGenerated).toContain(
        'scheduledMutationBatch: createGeneratedFunctionReference<"mutation", "internal", unknown>("generated/server:scheduledMutationBatch"),'
      );
      expect(serverGenerated).not.toContain('const relations =');
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
      expect(serverGenerated).not.toContain('type InstalledPluginKey =');
      expect(serverGenerated).not.toContain('withPluginApi');
      expect(serverGenerated).not.toContain('export type MigrationCtx =');
      expect(serverGenerated).toContain('export type OrmCtx<');
      expect(serverGenerated).toContain(
        'export type OrmCtx<Ctx extends ServerQueryCtx | ServerMutationCtx = ServerQueryCtx> = GenericOrmCtx<Ctx, typeof ormSchema>;'
      );
      expect(serverGenerated).not.toContain('ResolveOrmSchema');
      expect(serverGenerated).not.toContain('export function defineAuth<');
      expect(serverGenerated).toContain(
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(serverGenerated).toContain('query: (ctx) => withOrm(ctx),');
      expect(serverGenerated).toContain('mutation: (ctx) => withOrm(ctx),');
      expect(serverGenerated).toContain('action: (ctx) => ctx,');
      expect(serverGenerated).not.toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain(
        'export function createCaller<TCtx extends'
      );
      expect(serverGenerated).not.toContain(
        'export function createHandler<TCtx extends'
      );
      expect(serverGenerated).toContain('export function withOrm<');
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
        "import type { OrmTriggerContext } from 'kitcn/orm';"
      );
      expect(nestedRuntimeGenerated).toContain(
        'type MutationCallerContext = MutationCtx | OrmTriggerContext<any, MutationCtx>;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureHandlerContext = QueryCtx | MutationCtx;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'createGeneratedRegistryRuntime,'
      );
      expect(nestedRuntimeGenerated).toContain(
        'createGeneratedFunctionReference,'
      );
      expect(nestedRuntimeGenerated).toContain('typedProcedureResolver,');
      expect(nestedRuntimeGenerated).not.toContain(
        'function getGeneratedValue('
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'type ProcedureArgsFromExport<'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'type ProcedureFunctionReference<'
      );
      expect(nestedRuntimeGenerated).toContain('const procedureRegistry = {');
      expect(nestedRuntimeGenerated).toContain(
        'const handlerRegistry = procedureRegistry;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureCallerRegistry = typeof procedureRegistry;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type ProcedureHandlerRegistry = typeof handlerRegistry;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type GeneratedProcedureCaller<'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type GeneratedProcedureHandler<'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type GeneratedRegistryCallerForContext,'
      );
      expect(nestedRuntimeGenerated).toContain(
        'type GeneratedRegistryHandlerForContext,'
      );
      expect(nestedRuntimeGenerated).toContain(
        'const generatedRuntime = createGeneratedRegistryRuntime<'
      );
      expect(nestedRuntimeGenerated).toContain('ProcedureHandlerRegistry');
      expect(nestedRuntimeGenerated).toContain(
        'procedureRegistry,\n  handlerRegistry,\n});'
      );
      expect(nestedRuntimeGenerated).toContain(
        'return generatedRuntime.getCallerFactory()(\n    ctx as any\n  ) as GeneratedProcedureCaller<TCtx>;'
      );
      expect(nestedRuntimeGenerated).toContain(
        'return generatedRuntime.getHandlerFactory()(ctx) as GeneratedProcedureHandler<TCtx>;'
      );
      expect(nestedRuntimeGenerated).not.toContain('_generated/api.js');
      expect(nestedRuntimeGenerated).not.toContain(
        "import { api, internal } from '../_generated/api.js';"
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'import {\n  createGenericCallerFactory,'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'function createCallerFromRegistryFactory() {'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'let cachedProcedureRegistry: ProcedureRegistryBundle | undefined;'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'function getCreateCallerFromRegistry(): CallerFactory {'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'ProcedureActionCallerFromRegistry'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'ProcedureScheduleCallerFromRegistry'
      );
      expect(nestedRuntimeGenerated).not.toContain(
        'ProcedureCallerFromRegistry'
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
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["scheduledMutationBatch"]>("generated/server:scheduledMutationBatch")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["scheduledDelete"]>("generated/server:scheduledDelete")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["aggregateBackfill"]>("generated/server:aggregateBackfill")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["aggregateBackfillChunk"]>("generated/server:aggregateBackfillChunk")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["aggregateBackfillStatus"]>("generated/server:aggregateBackfillStatus")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["migrationRun"]>("generated/server:migrationRun")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["migrationRunChunk"]>("generated/server:migrationRunChunk")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["migrationStatus"]>("generated/server:migrationStatus")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["migrationCancel"]>("generated/server:migrationCancel")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"mutation", "internal", typeof generatedInternal["generated"]["server"]["resetChunk"]>("generated/server:resetChunk")'
      );
      expect(serverRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"action", "internal", typeof generatedInternal["generated"]["server"]["reset"]>("generated/server:reset")'
      );
      expect(nestedRuntimeGenerated).toContain(
        "import type { ActionCtx, MutationCtx, QueryCtx } from '../server';"
      );
      expect(nestedRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"query", "internal", typeof import("../../items/queries").internalOnly>("items/queries:internalOnly")'
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
      expect(migrationsGenerated).toContain("import schema from '../schema';");
      expect(migrationsGenerated).not.toContain('const relations =');
      expect(migrationsGenerated).toContain(
        'migration: MigrationDefinition<typeof schema>'
      );
      expect(migrationsGenerated).toContain(
        'return baseDefineMigration<typeof schema>(migration);'
      );
      expect(migrationsGenerated).not.toContain('export type MigrationCtx =');
      expect(migrationsGenerated).toContain('export function defineMigration(');
      expect(migrationsGenerated).not.toContain('defineMigrationSet');

      const module = await import(pathToFileURL(outputFile).href);
      expect(module).toHaveProperty('api');
      expect(module).not.toHaveProperty('crpcMeta');

      const api = module.api as any;
      expect(api.http).toBeUndefined();

      // Leaf uses merged metadata on top of a cold generated function ref.
      expect(getFunctionName(api.items.queries.list)).toBe(
        'items/queries:list'
      );
      expect(api.items.queries.list.type).toBe('query');
      expect(api.items.queries.list.auth).toBe('optional');
      expect(api.items.queries.list.role).toBe('admin');
      expect(api.items.queries.list.ratelimit).toBe(10);
      expect(api.items.queries.list.dev).toBe(true);
      expect(api.items.queries.list.functionRef).toBe(api.items.queries.list);
      expect(api.items.queries).not.toHaveProperty('internalOnly');
      expect(api.items.queries).not.toHaveProperty('_private');

      expect(getFunctionName(api.posts.create)).toBe('posts:create');
      expect(api.posts.create.type).toBe('mutation');
      expect(api.posts.create.functionRef).toBe(api.posts.create);

      // Hidden metadata key should not exist anymore.
      expect(Object.keys(api)).not.toContain('__kitcnCrpcMeta');

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
      const serverGenerated = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf-8'
      );
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
        'import type { inferApiInputs, inferApiOutputs } from "kitcn/server";'
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
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(serverGenerated).not.toContain('const procedureRegistry = {');
      expect(serverGenerated).not.toContain(
        'export function createHandler<TCtx extends'
      );
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).toContain('withOrm');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).toContain('export type OrmCtx<');
      expect(fs.existsSync(serverRuntimeFile)).toBe(false);
      expect(todosRuntimeGenerated).toContain(
        "import type { ActionCtx, MutationCtx, QueryCtx } from './server';"
      );
      expect(todosRuntimeGenerated).toContain(
        '/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */'
      );
      expect(todosRuntimeGenerated).toContain(
        "import type { OrmTriggerContext } from 'kitcn/orm';"
      );
      expect(todosRuntimeGenerated).not.toContain('type RuntimeServerModule =');
      expect(todosRuntimeGenerated).toContain(
        'const generatedRuntime = createGeneratedRegistryRuntime<'
      );
      expect(todosRuntimeGenerated).toContain(
        'createGeneratedFunctionReference<"query", "public", typeof import("../todos").list>("todos:list")'
      );
      expect(todosRuntimeGenerated).toContain(
        'return generatedRuntime.getCallerFactory()(\n    ctx as any\n  ) as GeneratedProcedureCaller<TCtx>;'
      );
      expect(todosRuntimeGenerated).not.toContain(
        "import { api, internal } from './_generated/api.js';"
      );
      expect(todosRuntimeGenerated).not.toContain('_generated/api.js');
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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

  test('generateMeta avoids self-import type cycles in module runtime files', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'foo.ts'),
        `
        import { createFooHandler } from './generated/foo.runtime';

        export const list = {
          _handler: async (ctx) => {
            const handler = createFooHandler(ctx);
            return handler.detail({});
          },
          _crpcMeta: {
            type: 'query',
          },
        };

        export const detail = {
          _handler: async () => ({ ok: true }),
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const runtimeFile = path.join(
        dir,
        'convex',
        'generated',
        'foo.runtime.ts'
      );
      const runtimeGenerated = fs.readFileSync(runtimeFile, 'utf-8');

      expect(runtimeGenerated).toContain(
        "import type {\n  api as generatedApi,\n  internal as generatedInternal,\n} from '../_generated/api';"
      );
      expect(runtimeGenerated).toContain(
        'createGeneratedFunctionReference<"query", "public", typeof generatedApi["foo"]["detail"]>("foo:detail")'
      );
      expect(runtimeGenerated).toContain(
        'createGeneratedFunctionReference<"query", "public", typeof generatedApi["foo"]["list"]>("foo:list")'
      );
      expect(runtimeGenerated).not.toContain('typeof import("../foo").detail');
      expect(runtimeGenerated).not.toContain('typeof import("../foo").list');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta supports scaffolded crpc imports during first-run placeholder generation', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const errorLines: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        `
        import { initCRPC } from '../generated/server';

        const c = initCRPC
          .meta<{
            auth?: 'optional' | 'required';
          }>()
          .create();

        export const publicRoute = c.httpAction;
        export const router = c.router;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        import './lib/crpc';

        export default {};
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );

      expect(errorLines).toEqual([]);
      const serverGenerated = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf8'
      );
      expect(serverGenerated).toContain('export const initCRPC =');
      expect(
        fs.readFileSync(
          path.join(oldCwd, 'packages', 'kitcn', 'src', 'cli', 'codegen.ts'),
          'utf8'
        )
      ).toContain('return `// @ts-nocheck');
      expect(
        fs.readFileSync(
          path.join(
            oldCwd,
            'packages',
            'kitcn',
            'src',
            'cli',
            'backend-core.ts'
          ),
          'utf8'
        )
      ).toContain(
        'const INIT_GENERATED_SERVER_STUB_TEMPLATE = `// @ts-nocheck'
      );
    } finally {
      console.error = originalError;
      process.chdir(oldCwd);
    }
  });

  test('generateMeta trims configured path segments from runtime symbol names', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          plugins: {
            resend: {
              list: { ref: 'plugins:resend:list' },
            },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'plugins', 'resend.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(path.join(dir, 'convex', 'schema.ts'), 'export default {};');
      writeFile(path.join(dir, 'convex', 'http.ts'), 'export default {};');

      await generateMeta(undefined, {
        silent: true,
        trimSegments: ['plugins'],
      });

      const runtimeFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'resend.runtime.ts'
      );
      const runtimeGenerated = fs.readFileSync(runtimeFile, 'utf-8');
      expect(runtimeGenerated).toContain(
        'export function createResendCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(runtimeGenerated).toContain(
        'export function createResendHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(runtimeGenerated).not.toContain(
        'export function createPluginsResendCaller<'
      );
      expect(runtimeGenerated).not.toContain(
        'export function createPluginsResendHandler<'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta always trims plugins segment even when trimSegments omits it', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          plugins: {
            resend: {
              list: { ref: 'plugins:resend:list' },
            },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'plugins', 'resend.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(path.join(dir, 'convex', 'schema.ts'), 'export default {};');
      writeFile(path.join(dir, 'convex', 'http.ts'), 'export default {};');

      await generateMeta(undefined, {
        silent: true,
        trimSegments: ['generated'],
      });

      const runtimeFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'resend.runtime.ts'
      );
      const runtimeGenerated = fs.readFileSync(runtimeFile, 'utf-8');
      expect(runtimeGenerated).toContain(
        'export function createResendCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(runtimeGenerated).not.toContain(
        'export function createPluginsResendCaller<'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta trims generated segment by default', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          plugins: {
            generated: {
              resend: {
                list: { ref: 'plugins:generated:resend:list' },
              },
            },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'plugins', 'generated', 'resend.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(path.join(dir, 'convex', 'schema.ts'), 'export default {};');
      writeFile(path.join(dir, 'convex', 'http.ts'), 'export default {};');

      await generateMeta(undefined, {
        silent: true,
      });

      const runtimeFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'generated',
        'resend.runtime.ts'
      );
      const runtimeGenerated = fs.readFileSync(runtimeFile, 'utf-8');
      expect(runtimeGenerated).toContain(
        'export function createResendCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(runtimeGenerated).not.toContain(
        'export function createGeneratedResendCaller<'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta appends stable hash suffix when trimmed runtime symbol names collide', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', '_generated', 'api.js'),
        `
        export const api = {
          plugins: {
            "foo-bar": {
              list: { ref: 'plugins:foo-bar:list' },
            },
            foo_bar: {
              list: { ref: 'plugins:foo_bar:list' },
            },
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'plugins', 'foo-bar.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'plugins', 'foo_bar.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(path.join(dir, 'convex', 'schema.ts'), 'export default {};');
      writeFile(path.join(dir, 'convex', 'http.ts'), 'export default {};');

      await generateMeta(undefined, {
        silent: true,
        trimSegments: ['plugins'],
      });

      const firstRuntime = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'plugins', 'foo-bar.runtime.ts'),
        'utf-8'
      );
      const secondRuntime = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'plugins', 'foo_bar.runtime.ts'),
        'utf-8'
      );
      const combinedRuntime = `${firstRuntime}\n${secondRuntime}`;

      expect(combinedRuntime).toContain(
        'export function createFooBarPluginsCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(combinedRuntime).toMatch(HASHED_RUNTIME_CALLER_RE);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta keeps table helpers but omits Orm* helpers when schema relations metadata is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(serverGenerated).toContain('query: (ctx) => ctx,');
      expect(serverGenerated).toContain('mutation: (ctx) => ctx,');
      expect(serverGenerated).toContain('action: (ctx) => ctx,');
      expect(serverGenerated).not.toContain('createOrm');
      expect(serverGenerated).toContain('export function withOrm<');
      expect(serverGenerated).not.toContain('scheduledMutationBatch');
      expect(serverGenerated).toContain(
        'export type OrmCtx<Ctx = QueryCtx> = Ctx;'
      );
      expect(fs.existsSync(serverRuntimeFile)).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta wires schema triggers metadata into generated orm module', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
      expect(generatedServer).toContain("import schema from '../schema';");
      expect(generatedServer).not.toContain('const relations =');
      expect(generatedServer).not.toContain('const triggers =');
      expect(generatedServer).toContain('const ormSchema = schema;');
      expect(generatedServer).toContain('schema: ormSchema,');
      expect(generatedServer).toContain('ormFunctions,');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta rejects dedicated triggers file exports', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });

        export const tables = {
          todos: { table: 'todos' },
        };
        export default schema;
        `.trim()
      );

      writeFile(
        path.join(dir, 'convex', 'triggers.ts'),
        `
        export const triggers = {
          todos: {},
        };
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'Codegen error: do not export `triggers` from schema.ts or triggers.ts. Chain triggers on the default schema export with `defineSchema(...).relations(...).triggers(...)`.'
      );
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

  test('generateMeta rejects named triggers export', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });

        export const triggers = {
          todos: {},
        };
        export default schema;
        `.trim()
      );
      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'Codegen error: do not export `triggers` from schema.ts or triggers.ts. Chain triggers on the default schema export with `defineSchema(...).relations(...).triggers(...)`.'
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
        const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');
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
        export default schema;
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
      expect(generatedAuth).toContain('type AuthRuntime,');
      expect(generatedAuth).toContain('getInvalidAuthDefinitionExportReason,');
      expect(generatedAuth).toContain(
        'type AuthDefinitionFromFile = typeof authDefinitionModule.default;'
      );
      expect(generatedAuth).toContain('const authRuntime: AuthRuntime<');
      expect(generatedAuth).toContain('= createAuthRuntime<');
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
        'export function createAuthCaller<TCtx extends ProcedureCallerContext>('
      );
      expect(generatedRuntime).toContain(
        'export function createAuthHandler<TCtx extends ProcedureHandlerContext>('
      );
      expect(generatedAuth).not.toContain('createDisabledAuthRuntime');
      expect(generatedAuth).not.toContain('const authFunctions: AuthFunctions');
      expect(generatedAuth).not.toContain(
        'import { type AuthFunctions, createApi, createClient } from "kitcn/auth";'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits auth runtime without ORM wiring when schema relations metadata is missing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
      expect(generatedAuth).toContain('getInvalidAuthDefinitionExportReason,');
      expect(generatedAuth).toContain(
        'type AuthDefinitionFromFile = typeof authDefinitionModule.default;'
      );
      expect(generatedAuth).toContain('createAuthRuntime<');
      expect(generatedAuth).toContain('ReturnType<AuthDefinitionFromFile>');
      expect(generatedAuth).toContain(
        'getInvalidAuthDefinitionExportReason("convex/auth.ts")'
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
        'export const initCRPC = baseInitCRPC.dataModel<DataModel>().context({'
      );
      expect(generatedServer).not.toContain('orm.with(');
      expect(generatedServer).not.toContain('import { createOrm');
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });

        export const tables = {
          todos: { table: 'todos' },
        };
        export default schema;
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
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).not.toContain("} from 'kitcn/auth';");
      expect(generatedAuth).not.toContain('createAuthRuntime,');
      expect(generatedAuth).not.toContain('createAuthRuntime<DataModel');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta keeps generated auth and migrations schema-free when schema metadata is absent', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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

      await generateMeta(undefined, { silent: true });

      const generatedAuth = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'auth.ts'),
        'utf-8'
      );
      const generatedMigrations = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'migrations.gen.ts'),
        'utf-8'
      );

      expect(generatedAuth).toContain('createDisabledAuthRuntime');
      expect(generatedAuth).not.toContain("import schema from '../schema';");
      expect(generatedAuth).toContain(
        "import type { GenericSchema, SchemaDefinition } from 'convex/server';"
      );
      expect(generatedAuth).toContain(
        'type GeneratedSchema = SchemaDefinition<GenericSchema, true>;'
      );
      expect(generatedAuth).toContain(
        '> = createDisabledAuthRuntime<DataModel, GeneratedSchema, MutationCtx, GenericCtx>({'
      );
      expect(generatedMigrations).toContain(
        "export { defineMigration } from 'kitcn/orm';"
      );
      expect(generatedMigrations).not.toContain(
        "import schema from '../schema';"
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta uses convex.json functions dir in disabled auth guidance', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'convex.json'),
        JSON.stringify({ functions: 'custom/convex' }, null, 2)
      );
      writeFile(
        path.join(dir, 'custom', 'convex', 'todos.ts'),
        `
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'custom', 'convex', 'schema.ts'),
        `
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });

        export const tables = {
          todos: { table: 'todos' },
        };
        export default schema;
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedAuthFile = path.join(
        dir,
        'custom',
        'convex',
        'generated',
        'auth.ts'
      );
      const generatedAuth = fs.readFileSync(generatedAuthFile, 'utf-8');
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason(');
      expect(generatedAuth).toContain('"missing_auth_file"');
      expect(generatedAuth).toContain('"custom/convex/auth.ts"');
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
        `
        export const createApiLeaf = (fnOrRoot, pathOrMeta, maybeMeta) => {
          const meta = maybeMeta ?? pathOrMeta;
          const fn = Array.isArray(pathOrMeta)
            ? pathOrMeta.reduce((current, segment) => current?.[segment], fnOrRoot)
            : fnOrRoot;
          return Object.assign(fn, meta, { functionRef: fn });
        };
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
      expect(generatedAuth).toContain('getGeneratedAuthDisabledReason(');
      expect(generatedAuth).toContain('"missing_default_export"');
      expect(generatedAuth).toContain('"convex/auth.ts"');
      expect(generatedAuth).toContain("} from 'kitcn/auth/generated';");
      expect(generatedAuth).toContain('export function defineAuth<');
      expect(generatedAuth).not.toContain(
        "import * as authDefinitionModule from '../auth';"
      );
      expect(generatedAuth).not.toContain("} from 'kitcn/auth';");
      expect(generatedAuth).not.toContain('createAuthRuntime,');
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

  test('generateMeta with scope=all keeps api and auth outputs', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      await generateMeta(undefined, {
        silent: true,
        scope: 'all',
      } as any);

      expect(fs.existsSync(path.join(dir, 'convex', 'shared', 'api.ts'))).toBe(
        true
      );
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
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'todos.runtime.ts'))
      ).toBe(true);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta with scope=orm removes api.ts and auth outputs', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      await generateMeta(undefined, {
        silent: true,
        scope: 'orm',
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

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'kitcn codegen aborted because module parsing failed'
      );

      expect(fs.existsSync(todosRuntimeFile)).toBe(true);
      expect(fs.readFileSync(todosRuntimeFile, 'utf-8')).toContain(
        runtimeSentinel
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta removes newly-created runtime placeholder when module parse fails without prior runtime file', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'broken.ts'),
        `
        throw new Error('parse failure');
        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      const brokenRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'broken.runtime.ts'
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'kitcn codegen aborted because module parsing failed'
      );

      expect(fs.existsSync(brokenRuntimeFile)).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta preserves existing shared api and generated plugin runtimes on fatal parse failure', async () => {
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

      const sharedApiFile = path.join(dir, 'convex', 'shared', 'api.ts');
      const sharedApiSentinel = '// keep shared api';
      writeFile(sharedApiFile, sharedApiSentinel);

      const pluginRuntimeFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'resend.runtime.ts'
      );
      const pluginRuntimeSentinel = '// keep resend runtime';
      writeFile(pluginRuntimeFile, pluginRuntimeSentinel);

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'kitcn codegen aborted because module parsing failed'
      );

      expect(fs.readFileSync(sharedApiFile, 'utf-8')).toContain(
        sharedApiSentinel
      );
      expect(fs.readFileSync(pluginRuntimeFile, 'utf-8')).toContain(
        pluginRuntimeSentinel
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta suppresses expected http.ts bootstrap warnings when kitcn is not installed yet', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const originalError = console.error;
    const errorLines: string[] = [];

    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      fs.rmSync(path.join(dir, 'node_modules', 'kitcn'), {
        force: true,
        recursive: true,
      });
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        import { createHttpRouter } from 'kitcn/server';

        export const http = createHttpRouter({});
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      expect(errorLines.join('\n')).not.toContain('Failed to parse http.ts');
    } finally {
      console.error = originalError;
      process.chdir(oldCwd);
    }
  });

  test('generateMeta resolves scaffold imports when local kitcn install is symlinked into a bun-style cache path', async () => {
    const dir = mkTempDir();
    try {
      writeFile(
        path.join(dir, 'convex.json'),
        `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
      );
      writeFile(
        path.join(dir, 'node_modules', 'convex', 'package.json'),
        JSON.stringify({
          name: 'convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'convex', 'server.js'),
        `export const queryGeneric = () => ({})
export const mutationGeneric = () => ({})
export const actionGeneric = () => ({})
export const internalQueryGeneric = () => ({})
export const internalMutationGeneric = () => ({})
export const internalActionGeneric = () => ({})
`.trim()
      );

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-cache-'));
      writeFile(
        path.join(cacheDir, 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './dist/server/index.js',
          },
        })
      );
      writeFile(
        path.join(cacheDir, 'dist', 'server', 'index.js'),
        `
        export { queryGeneric as initCRPC } from 'convex/server';
        export const createHttpRouter = () => ({});
        `.trim()
      );
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
      fs.symlinkSync(cacheDir, path.join(dir, 'node_modules', 'kitcn'));

      writeFile(
        path.join(dir, 'convex', 'functions', 'http.ts'),
        `
        import { createHttpRouter } from 'kitcn/server';
        export default createHttpRouter({}, {});
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'messages.ts'),
        `
        import { initCRPC } from 'kitcn/server';
        export const list = initCRPC;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'schema.ts'),
        'export default {};'
      );

      const result = Bun.spawnSync(
        [
          'bun',
          '--cwd',
          path.join(process.cwd(), 'packages', 'kitcn'),
          '-e',
          'import { generateMeta, getConvexConfig } from "./src/cli/codegen.ts"; process.chdir(process.argv[1]); await generateMeta(undefined, { silent: true }); console.log(getConvexConfig().outputFile);',
          dir,
        ],
        {
          cwd: process.cwd(),
          stderr: 'pipe',
          stdout: 'pipe',
        }
      );

      expect(result.exitCode).toBe(0);
      const outputFile = result.stdout.toString().trim();
      expect(fs.existsSync(outputFile)).toBe(true);
    } finally {
      fs.rmSync(path.join(dir, 'node_modules', 'kitcn'), {
        force: true,
        recursive: true,
      });
    }
  });

  test('generateMeta resolves the nested scaffold chain through lib/crpc and generated/server placeholders under a bun-style cache path', async () => {
    const dir = mkTempDir();
    try {
      writeFile(
        path.join(dir, 'convex.json'),
        `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
      );
      writeFile(
        path.join(dir, 'node_modules', 'convex', 'package.json'),
        JSON.stringify({
          name: 'convex',
          type: 'module',
          exports: {
            './server': './server.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'convex', 'server.js'),
        `export const queryGeneric = () => ({})
export const mutationGeneric = () => ({})
export const actionGeneric = () => ({})
export const internalQueryGeneric = () => ({})
export const internalMutationGeneric = () => ({})
export const internalActionGeneric = () => ({})
export const GenericActionCtx = {};
export const GenericDataModel = {};
export const GenericMutationCtx = {};
export const GenericQueryCtx = {};
`.trim()
      );

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kitcn-cache-'));
      writeFile(
        path.join(cacheDir, 'package.json'),
        JSON.stringify({
          name: 'kitcn',
          type: 'module',
          exports: {
            './server': './dist/server/index.js',
          },
        })
      );
      writeFile(
        path.join(cacheDir, 'dist', 'server', 'index.js'),
        `
        export { queryGeneric as initCRPC } from 'convex/server';
        export const createHttpRouter = (_app, httpRouter) => httpRouter ?? {};
        export const CRPCError = class extends Error {};
        export const createEnv = ({ schema }) => () => schema?.parse?.(process.env) ?? process.env;
        export const registerProcedureNameLookup = () => {};
        `.trim()
      );
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
      fs.symlinkSync(cacheDir, path.join(dir, 'node_modules', 'kitcn'));

      writeFile(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        `import { initCRPC } from '../functions/generated/server';
const c = initCRPC.meta<{}>().create();
export const publicQuery = c.query;
export const publicMutation = c.mutation;
export const publicAction = c.action;
export const router = c.router;
`
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'messages.ts'),
        `import { publicQuery } from '../lib/crpc';
export const list = publicQuery.query(async () => []);
`
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'http.ts'),
        `import { createHttpRouter } from 'kitcn/server';
import { router } from '../lib/crpc';
export default createHttpRouter({}, router({}));
`
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'schema.ts'),
        'export default {};'
      );

      const result = Bun.spawnSync(
        [
          'bun',
          '--cwd',
          path.join(process.cwd(), 'packages', 'kitcn'),
          '-e',
          'import { generateMeta, getConvexConfig } from "./src/cli/codegen.ts"; process.chdir(process.argv[1]); await generateMeta(undefined, { silent: true }); console.log(getConvexConfig().outputFile);',
          dir,
        ],
        {
          cwd: process.cwd(),
          stderr: 'pipe',
          stdout: 'pipe',
        }
      );

      expect(result.exitCode).toBe(0);
      const outputFile = result.stdout.toString().trim();
      expect(fs.existsSync(outputFile)).toBe(true);
    } finally {
      fs.rmSync(path.join(dir, 'node_modules', 'kitcn'), {
        force: true,
        recursive: true,
      });
    }
  });

  test('generateMeta parses query chains that call paginated() after input()', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        `
        import { initCRPC } from '../generated/server';

        const c = initCRPC.meta<{}>().create();

        export const publicQuery = c.query;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'messages.ts'),
        `
        import { publicQuery } from './lib/crpc';

        const schema = {} as any;

        export const listConversations = publicQuery
          .input(schema)
          .paginated({ limit: 40, item: schema })
          .query(async () => ({
            continueCursor: null,
            isDone: true,
            page: [],
          }));
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );

      const generatedApi = fs.readFileSync(
        path.join(dir, 'convex', 'shared', 'api.ts'),
        'utf-8'
      );
      expect(generatedApi).toContain('{ limit: 40, type: "query" }');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta parses modules that import tsx files', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'node_modules', 'react', 'package.json'),
        JSON.stringify({
          name: 'react',
          type: 'module',
          exports: {
            './jsx-runtime': './jsx-runtime.js',
            './jsx-dev-runtime': './jsx-dev-runtime.js',
          },
        })
      );
      writeFile(
        path.join(dir, 'node_modules', 'react', 'jsx-runtime.js'),
        `
        export const Fragment = Symbol.for('react.fragment');
        export const jsx = (type, props) => ({ type, props });
        export const jsxs = jsx;
        `.trim()
      );
      writeFile(
        path.join(dir, 'node_modules', 'react', 'jsx-dev-runtime.js'),
        `
        export const Fragment = Symbol.for('react.fragment');
        export const jsxDEV = (type, props) => ({ type, props });
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'lib', 'email-otp.tsx'),
        `
        export function EmailOtp(props: { code: string }) {
          return <div>{props.code}</div>;
        }
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'resend.ts'),
        `
        import { EmailOtp } from './lib/email-otp';

        void EmailOtp;

        export const sendOtp = {
          _crpcMeta: {
            type: 'action',
          },
        };
        `.trim()
      );

      const result = Bun.spawnSync(
        [
          'bun',
          '--cwd',
          path.join(oldCwd, 'packages', 'kitcn'),
          '-e',
          'import { generateMeta } from "./src/cli/codegen.ts"; process.chdir(process.argv[1]); await generateMeta(undefined, { silent: true });',
          dir,
        ],
        {
          cwd: oldCwd,
          env: {
            ...process.env,
            JITI_TRY_NATIVE: '0',
          },
          stderr: 'pipe',
          stdout: 'pipe',
        }
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr.toString()).toBe('');

      const generatedApi = fs.readFileSync(
        path.join(dir, 'convex', 'shared', 'api.ts'),
        'utf-8'
      );
      expect(generatedApi).toContain('sendOtp');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta skips non-procedure helper ts files even if importing them would fail', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'test.setup.ts'),
        `
        ({} as Record<string, never>).glob();

        export const testSetup = true;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'test.call-tracking.ts'),
        `
        ({} as Record<string, never>).glob();

        export const testCallTracking = true;
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );

      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'test.setup.runtime.ts')
        )
      ).toBe(false);
      expect(
        fs.existsSync(
          path.join(dir, 'convex', 'generated', 'test.call-tracking.runtime.ts')
        )
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta parses scaffolded http route chains from generated/server placeholders', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'lib', 'crpc.ts'),
        `
        import { initCRPC } from '../generated/server';

        const c = initCRPC.meta<{}>().create();

        export const publicRoute = c.httpAction;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'routes.ts'),
        `
        import { publicRoute } from './lib/crpc';

        export const authRoute = publicRoute
          .use(async ({ next }) => next())
          .post('/api/auth/demo')
          .mutation(async () => ({ ok: true }));
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta resolves tsconfig path aliases during module parsing', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeFile(
        path.join(dir, 'convex.json'),
        `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
      );
      writeFile(
        path.join(dir, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {
                '@/*': ['./*'],
              },
            },
          },
          null,
          2
        )}\n`
      );
      writeFile(
        path.join(dir, 'lib', 'crpc.ts'),
        `
        export const publicQuery = {
          query(handler: unknown) {
            return {
              _crpcMeta: {
                type: 'query',
              },
              _handler: handler,
            };
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'internal', 'dialpad.ts'),
        `
        import { publicQuery } from '@/lib/crpc';

        export const list = publicQuery.query(async () => []);
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'http.ts'),
        'export default {};'
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'schema.ts'),
        'export default {};'
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta resolves tsconfig path aliases when parse-time kitcn/server rewriting is active', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

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
        `
        export const createEnv = ({ schema }) => () =>
          typeof schema?.parse === 'function' ? schema.parse(process.env) : process.env;
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex.json'),
        `${JSON.stringify({ functions: 'convex/functions' }, null, 2)}\n`
      );
      writeFile(
        path.join(dir, 'tsconfig.json'),
        `${JSON.stringify(
          {
            compilerOptions: {
              baseUrl: '.',
              paths: {
                '@/*': ['./*'],
              },
            },
          },
          null,
          2
        )}\n`
      );
      writeFile(
        path.join(dir, 'lib', 'crpc.ts'),
        `
        export const publicQuery = {
          query(handler: unknown) {
            return {
              _crpcMeta: {
                type: 'query',
              },
              _handler: handler,
            };
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'internal', 'dialpad.ts'),
        `
        import { createEnv } from 'kitcn/server';
        import { publicQuery } from '@/lib/crpc';

        const getEnv = createEnv({ schema: undefined });
        void getEnv;

        export const list = publicQuery.query(async () => []);
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'http.ts'),
        'export default {};'
      );
      writeFile(
        path.join(dir, 'convex', 'functions', 'schema.ts'),
        'export default {};'
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta still logs unexpected http.ts parse failures', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();
    const originalError = console.error;
    const errorLines: string[] = [];

    console.error = (...args: unknown[]) => {
      errorLines.push(args.map(String).join(' '));
    };

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'http.ts'),
        `
        throw new Error('parse failure');
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'kitcn codegen aborted because module parsing failed'
      );

      expect(errorLines.join('\n')).toContain('Failed to parse http.ts');
    } finally {
      console.error = originalError;
      process.chdir(oldCwd);
    }
  });

  test('generateMeta regenerates stale runtime files that still import generated/crpc', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'todos.ts'),
        `
        import { createTodosCaller } from './generated/todos.runtime';
        void createTodosCaller;

        export const list = {
          _crpcMeta: {
            type: 'query',
          },
        };
        `.trim()
      );
      writeFile(
        path.join(dir, 'convex', 'generated', 'todos.runtime.ts'),
        `
        import type { ActionCtx, MutationCtx, QueryCtx } from './crpc';

        export function createTodosCaller(_ctx: QueryCtx | MutationCtx | ActionCtx) {
          return null;
        }
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedTodosRuntime = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'todos.runtime.ts'),
        'utf-8'
      );
      expect(generatedTodosRuntime).toContain(
        "import type { ActionCtx, MutationCtx, QueryCtx } from './server';"
      );
      expect(generatedTodosRuntime).not.toContain("from './crpc'");
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

  test('generateMeta ignores plugin codegen module metadata from schema extensions', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaExtensions = Symbol.for('kitcn:OrmSchemaExtensions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaExtensions, {
          value: [
            {
              key: 'resend',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
              codegen: {
                generatedModules: [
                  {
                    moduleName: 'generated/plugins/resend',
                    content: "export const pluginSentinel = 'resend';\\n",
                  },
                ],
              },
            },
          ],
          enumerable: false,
        });

        export const tables = {};
        export default schema;
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedPluginFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'resend.ts'
      );
      expect(fs.existsSync(generatedPluginFile)).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta removes stale generated/plugins directory artifacts', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);

      const generatedPluginFile = path.join(
        dir,
        'convex',
        'generated',
        'plugins',
        'resend.ts'
      );
      writeFile(generatedPluginFile, 'export const stale = true;\n');

      await generateMeta(undefined, { silent: true });

      expect(fs.existsSync(generatedPluginFile)).toBe(false);
      expect(
        fs.existsSync(path.join(dir, 'convex', 'generated', 'plugins'))
      ).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta does not reconcile plugin lockfile', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaExtensions = Symbol.for('kitcn:OrmSchemaExtensions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaExtensions, {
          value: [
            {
              key: 'ratelimit',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
            },
            {
              key: 'resend',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
            },
          ],
          enumerable: false,
        });

        export const tables = {};
        export default schema;
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const lockfilePath = path.join(dir, 'convex', 'plugins.lock.json');
      expect(fs.existsSync(lockfilePath)).toBe(false);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta leaves existing plugin lockfile untouched', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'plugins.lock.json'),
        JSON.stringify(
          {
            version: 1,
            installedPlugins: ['resend'],
          },
          null,
          2
        )
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaExtensions = Symbol.for('kitcn:OrmSchemaExtensions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaExtensions, {
          value: [
            {
              key: 'resend',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
            },
          ],
          enumerable: false,
        });

        export const tables = {};
        export default schema;
        `.trim()
      );

      const lockfilePath = path.join(dir, 'convex', 'plugins.lock.json');
      const before = fs.readFileSync(lockfilePath, 'utf8');
      await generateMeta(undefined, { silent: true });
      const after = fs.readFileSync(lockfilePath, 'utf8');
      expect(after).toBe(before);
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta emits plugin-runtime-agnostic generated/server contract', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaExtensions = Symbol.for('kitcn:OrmSchemaExtensions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaExtensions, {
          value: [
            {
              key: 'resend',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
            },
            {
              key: 'ratelimit',
              schema: {
                tableNames: [],
                inject: (value) => value,
              },
            },
          ],
          enumerable: false,
        });

        export const tables = {};
        export default schema;
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const generatedServerFile = path.join(
        dir,
        'convex',
        'generated',
        'server.ts'
      );
      const serverSource = fs.readFileSync(generatedServerFile, 'utf8');
      expect(serverSource).not.toContain('InstalledPluginKey');
      expect(serverSource).not.toContain('AnyPluginApiToken');
      expect(serverSource).not.toContain('PluginApiCtx');
      expect(serverSource).not.toContain('withPluginApi');
      expect(serverSource).not.toContain('options?: PluginOptions<TToken>');
      expect(serverSource).not.toContain('createPluginApiContext,');
      expect(serverSource).not.toContain("from 'kitcn/plugins';");
      const crpcSource = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf8'
      );
      expect(crpcSource).toContain('action: (ctx) => ctx,');
      expect(serverSource).not.toContain('kitcn/plugins/resend');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta treats defineSchema() output as ORM-backed without a relations export', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');

        const schema = {};
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });

        export const tables = {};
        export default schema;
        `.trim()
      );

      await generateMeta(undefined, { silent: true });

      const serverSource = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf8'
      );
      expect(serverSource).toContain('import {\n  createOrm,');
      expect(serverSource).toContain(
        'export type QueryCtx = OrmCtx<ServerQueryCtx>;'
      );
      expect(serverSource).toContain('query: (ctx) => withOrm(ctx),');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta loads cyclic revision-pointer schemas as ORM-backed', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeRealOrmFixture(dir);
      writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: 'issue-218-repro',
          private: true,
          type: 'module',
        })
      );
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        import { convexTable, defineSchema, id, integer, text } from "kitcn/orm";

        export const pageLocales = convexTable("pageLocales", {
          title: text().notNull(),
          currentRevisionId: id("pageLocaleRevisions").references(
            () => pageLocaleRevisions.id
          ),
          publishedRevisionId: id("pageLocaleRevisions").references(
            () => pageLocaleRevisions.id
          ),
        });

        export const pageLocaleRevisions = convexTable("pageLocaleRevisions", {
          pageLocaleId: id("pageLocales")
            .references(() => pageLocales.id, { onDelete: "cascade" })
            .notNull(),
          revisionNumber: integer().notNull(),
          title: text().notNull(),
        });

        export const tables = { pageLocales, pageLocaleRevisions };
        export default defineSchema(tables);
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).resolves.toBe(
        undefined
      );

      const serverSource = fs.readFileSync(
        path.join(dir, 'convex', 'generated', 'server.ts'),
        'utf8'
      );
      expect(serverSource).toContain('import {\n  createOrm,');
      expect(serverSource).toContain('query: (ctx) => withOrm(ctx),');
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('generateMeta rejects explicit relations export even when schema metadata exists', async () => {
    const dir = mkTempDir();
    const oldCwd = process.cwd();

    process.chdir(dir);
    try {
      writeScopedFixture(dir);
      writeFile(
        path.join(dir, 'convex', 'schema.ts'),
        `
        const OrmSchemaOptions = Symbol.for('kitcn:OrmSchemaOptions');
        const OrmSchemaRelations = Symbol.for('kitcn:OrmSchemaRelations');

        export const tables = {
          todos: { table: 'todos' },
          users: { table: 'users' },
        };
        export const relations = {
          todos: {
            table: tables.todos,
            relations: {
              owner: { table: tables.users },
            },
          },
          users: {
            table: tables.users,
            relations: {
              todos: { table: tables.todos },
            },
          },
        };

        const schema = { tables };
        Object.defineProperty(schema, OrmSchemaOptions, {
          value: { strict: true },
          enumerable: false,
        });
        Object.defineProperty(schema, OrmSchemaRelations, {
          value: {
            todos: { table: tables.todos },
          },
          enumerable: false,
        });

        export default schema;
        `.trim()
      );

      await expect(generateMeta(undefined, { silent: true })).rejects.toThrow(
        'Codegen error: do not export `relations` from schema.ts. Chain relations on the default schema export with `defineSchema(...).relations(...)`.'
      );
    } finally {
      process.chdir(oldCwd);
    }
  });

  test('codegen no longer contains plugin codegen/lockfile reconciliation paths', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'packages/kitcn/src/cli/codegen.ts'),
      'utf8'
    );
    expect(source).not.toContain('resolvePluginCodegenManifest(');
    expect(source).not.toContain('resolvePluginGeneratedModules(');
    expect(source).not.toContain('resolvePluginRuntimeProcedureEntries(');
    expect(source).not.toContain('reconcilePluginLockfile(');
  });
});
