/* biome-ignore-all lint: compile-time type assertions with intentional errors */

import {
  type FunctionReference,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  makeFunctionReference,
} from 'convex/server';
import { z } from 'zod';
import type { GenericOrmCtx } from '../orm';
import { createCRPCContext } from '../react/context';
import type { CRPCClient } from '../react/crpc-types';
import { createServerCRPCProxy } from '../rsc/proxy-server';
import { createApiLeaf } from '../server/api-entry';
import type { ServerCaller } from '../server/caller';
import type { CRPCHttpRouter } from '../server/http-router';
import type { HttpProcedure } from '../server/http-types';
import type { inferApiInputs, inferApiOutputs } from '../server/infer';
import {
  createGenericCallerFactory,
  createProcedureCallerFactory,
  createProcedureHandlerFactory,
  defineProcedure,
  typedProcedureResolver,
} from '../server/procedure-caller';
import type { UnsetMarker } from '../server/types';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type OrgGetRef = FunctionReference<
  'query',
  'public',
  { slug: string },
  { id: string; name: string; slug: string }
>;

type OrgListRef = FunctionReference<
  'query',
  'public',
  {},
  Array<{ id: string; name: string }>
>;

type OrgMembersRef = FunctionReference<
  'query',
  'public',
  { cursor: string | null; limit?: number; organizationId: string },
  {
    continueCursor: string | null;
    isDone: boolean;
    page: Array<{ id: string; role: string }>;
  }
>;

type OrgUpdateRef = FunctionReference<
  'mutation',
  'public',
  { id: string; name: string },
  { ok: true }
>;

type ReindexRef = FunctionReference<
  'action',
  'public',
  { force: boolean },
  { started: boolean }
>;

type BaseApi = {
  organization: {
    get: OrgGetRef;
    list: OrgListRef;
    listMembers: OrgMembersRef;
    update: OrgUpdateRef;
  };
  jobs: {
    reindex: ReindexRef;
  };
};

const healthOutputSchema = z.object({
  status: z.string(),
  timestamp: z.number(),
});
const todoOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
});
const todoListOutputSchema = z.array(todoOutputSchema);
const todosListQuerySchema = z.object({
  limit: z.coerce.number().optional(),
});
const todosCreateInputSchema = z.object({
  title: z.string(),
});

type HealthHttpProcedure = HttpProcedure<
  UnsetMarker,
  typeof healthOutputSchema,
  UnsetMarker,
  UnsetMarker,
  'GET',
  UnsetMarker
>;

type TodosListHttpProcedure = HttpProcedure<
  UnsetMarker,
  typeof todoListOutputSchema,
  UnsetMarker,
  typeof todosListQuerySchema,
  'GET',
  UnsetMarker
>;

type TodosCreateHttpProcedure = HttpProcedure<
  typeof todosCreateInputSchema,
  typeof todoOutputSchema,
  UnsetMarker,
  UnsetMarker,
  'POST',
  UnsetMarker
>;

type HttpRouter = CRPCHttpRouter<{
  health: HealthHttpProcedure;
  todos: CRPCHttpRouter<{
    list: TodosListHttpProcedure;
    create: TodosCreateHttpProcedure;
  }>;
}>;

type ApiWithHttp = BaseApi & {
  http?: HttpRouter;
};

const apiWithHttp = {} as ApiWithHttp;
const crpcWithHttpContext = createCRPCContext({
  api: apiWithHttp,
  convexSiteUrl: 'https://demo.convex.site',
});
const serverCrpcWithHttp = createServerCRPCProxy({ api: apiWithHttp });

type CRPCWithHttp = ReturnType<typeof crpcWithHttpContext.useCRPC>;
type VanillaWithHttp = ReturnType<typeof crpcWithHttpContext.useCRPCClient>;

declare const crpc: CRPCWithHttp;
declare const vanilla: VanillaWithHttp;

// ============================================================================
// Query typing (positive + negative)
// ============================================================================

crpc.organization.get.queryOptions({ slug: 'acme' });
// @ts-expect-error required args missing
crpc.organization.get.queryOptions();
// @ts-expect-error wrong arg key
crpc.organization.get.queryOptions({ id: 'acme' });
// @ts-expect-error wrong arg type
crpc.organization.get.queryOptions({ slug: 123 });

crpc.organization.list.queryOptions();
// @ts-expect-error query has no args
crpc.organization.list.queryOptions({ unexpected: 'x' });

// ============================================================================
// Mutation typing (negative variables coverage)
// ============================================================================

const updateMutation = crpc.organization.update.mutationOptions();
updateMutation.mutationFn?.({ id: 'org_1', name: 'New Name' }, {} as any);
// @ts-expect-error missing required field
updateMutation.mutationFn?.({ id: 'org_1' }, {} as any);
// @ts-expect-error wrong field type
updateMutation.mutationFn?.({ id: 1, name: 'x' }, {} as any);

// ============================================================================
// Action typing (query + mutation paths)
// ============================================================================

crpc.jobs.reindex.queryOptions({ force: true });
// @ts-expect-error action args required
crpc.jobs.reindex.queryOptions();
const reindexMutation = crpc.jobs.reindex.mutationOptions();
reindexMutation.mutationFn?.({ force: true }, {} as any);
// @ts-expect-error action mutation vars type mismatch
reindexMutation.mutationFn?.({ force: 'yes' }, {} as any);

// ============================================================================
// Infinite query typing (paginated queries only)
// ============================================================================

crpc.organization.listMembers.infiniteQueryOptions({ organizationId: 'org_1' });
// @ts-expect-error missing required non-pagination arg
crpc.organization.listMembers.infiniteQueryOptions();
crpc.organization.listMembers.infiniteQueryOptions({
  // @ts-expect-error cursor is managed by infinite query internals
  cursor: null,
  organizationId: 'org_1',
});
// @ts-expect-error non-paginated query should not expose infinite API
crpc.organization.get.infiniteQueryOptions({ slug: 'acme' });

// ============================================================================
// HTTP typing via useCRPC
// ============================================================================

crpc.http.health.queryOptions();
crpc.http.todos.list.queryOptions({ searchParams: { limit: '20' } });
serverCrpcWithHttp.http.health.queryOptions();
// @ts-expect-error unknown query key
crpc.http.todos.list.queryOptions({ searchParams: { nope: '1' } });
// @ts-expect-error query params are URL strings on client input
crpc.http.todos.list.queryOptions({ searchParams: { limit: 20 } });

const createTodoMutation = crpc.http.todos.create.mutationOptions();
createTodoMutation.mutationFn?.({ title: 'Ship' }, {} as any);
// @ts-expect-error wrong HTTP mutation body type
createTodoMutation.mutationFn?.({ title: 1 }, {} as any);
// @ts-expect-error queryOptions not available on POST endpoints
crpc.http.todos.create.queryOptions({ title: 'x' });

// ============================================================================
// HTTP typing via useCRPCClient
// ============================================================================

async function assertVanillaTypes(client: VanillaWithHttp) {
  const org = await client.organization.get.query({ slug: 'acme' });
  org.name;
  // @ts-expect-error unknown output property
  org.nope;

  await client.organization.update.mutate({ id: 'org_1', name: 'Renamed' });
  // @ts-expect-error required mutation field missing
  await client.organization.update.mutate({ id: 'org_1' });

  await client.jobs.reindex.query({ force: true });
  // @ts-expect-error action args type mismatch
  await client.jobs.reindex.query({ force: 'y' });

  await client.http.todos.create.mutate({ title: 'New Todo' });
  // @ts-expect-error POST body field type mismatch
  await client.http.todos.create.mutate({ title: 999 });
}

void assertVanillaTypes;
void vanilla;

// ============================================================================
// Any-regression guards
// ============================================================================

type OrgGetOutput = Awaited<
  ReturnType<VanillaWithHttp['organization']['get']['query']>
>;
type _orgGetOutputNotAny = Expect<Equal<false, IsAny<OrgGetOutput>>>;

type HttpListOutput = Awaited<
  ReturnType<VanillaWithHttp['http']['todos']['list']['query']>
>;
type _httpListOutputNotAny = Expect<Equal<false, IsAny<HttpListOutput>>>;

// ============================================================================
// No-HTTP API should not expose http namespace
// ============================================================================

const crpcNoHttpContext = createCRPCContext<BaseApi>({
  api: {} as BaseApi,
});

type CRPCNoHttp = ReturnType<typeof crpcNoHttpContext.useCRPC>;
declare const crpcNoHttp: CRPCNoHttp;
// @ts-expect-error http namespace should not exist without HTTP router types
crpcNoHttp.http;

declare const callerWithHttpApi: ServerCaller<ApiWithHttp>;
// @ts-expect-error server caller should not expose http namespace
callerWithHttpApi.http;

// ============================================================================
// Generated-leaf style coverage (createApiLeaf + inferApiInputs/Outputs)
// ============================================================================

const todosCreateRef = makeFunctionReference<
  'mutation',
  { title: string; dueDate: Date | null | undefined },
  { id: string; createdAt: Date }
>('todos:create');

const todosGetRef = makeFunctionReference<
  'query',
  { id: string },
  { id: string; dueDate: Date | null; createdAt: Date }
>('todos:get');

const generatedLikeApi = {
  todos: {
    create: createApiLeaf<'mutation', typeof todosCreateRef>(todosCreateRef, {
      type: 'mutation',
      auth: 'required',
      rateLimit: 'todo/create',
    }),
    get: createApiLeaf<'query', typeof todosGetRef>(todosGetRef, {
      type: 'query',
      auth: 'optional',
    }),
  },
  _http: {
    health: { path: '/api/health', method: 'GET' },
  },
} as const;

type GeneratedLikeApi = typeof generatedLikeApi;
type GeneratedInputs = inferApiInputs<GeneratedLikeApi>;
type GeneratedOutputs = inferApiOutputs<GeneratedLikeApi>;

type _generatedCreateInputDueDate = Expect<
  Equal<GeneratedInputs['todos']['create']['dueDate'], Date | null | undefined>
>;
type _generatedCreateOutputCreatedAt = Expect<
  Equal<GeneratedOutputs['todos']['create']['createdAt'], Date>
>;
type _generatedGetOutputDueDate = Expect<
  Equal<GeneratedOutputs['todos']['get']['dueDate'], Date | null>
>;

type _generatedInputNotAny = Expect<
  Equal<false, IsAny<GeneratedInputs['todos']['create']['dueDate']>>
>;
type _generatedOutputNotAny = Expect<
  Equal<false, IsAny<GeneratedOutputs['todos']['create']['createdAt']>>
>;

type _generatedFunctionRefType = Expect<
  Equal<
    typeof generatedLikeApi.todos.create.functionRef,
    FunctionReference<
      'mutation',
      'public',
      { title: string; dueDate: Date | null | undefined },
      { id: string; createdAt: Date }
    >
  >
>;

// ============================================================================
// Generated api.ts context alias coverage
// ============================================================================

type GeneratedGenericCtx =
  | GenericQueryCtx<any>
  | GenericMutationCtx<any>
  | GenericActionCtx<any>;

type GeneratedOrmCtx<
  Ctx extends
    | GenericQueryCtx<any>
    | GenericMutationCtx<any> = GenericQueryCtx<any>,
> = GenericOrmCtx<Ctx, any>;

type GeneratedOrmQueryCtx = GeneratedOrmCtx<GenericQueryCtx<any>>;
type GeneratedOrmMutationCtx = GeneratedOrmCtx<GenericMutationCtx<any>>;

type _generatedGenericCtxIncludesAction = Expect<
  Equal<
    Extract<GeneratedGenericCtx, GenericActionCtx<any>> extends never
      ? false
      : true,
    true
  >
>;
type _generatedOrmQueryCtxHasOrm = Expect<
  Equal<'orm' extends keyof GeneratedOrmQueryCtx ? true : false, true>
>;
type _generatedOrmMutationCtxHasOrm = Expect<
  Equal<'orm' extends keyof GeneratedOrmMutationCtx ? true : false, true>
>;
type _generatedOrmMutationCtxHasScheduler = Expect<
  Equal<'scheduler' extends keyof GeneratedOrmMutationCtx ? true : false, true>
>;

type _underscoreMetaExcludedFromClient = Expect<
  Equal<
    '_http' extends keyof CRPCClient<GeneratedLikeApi> ? true : false,
    false
  >
>;

declare const runMutation: <T extends FunctionReference<'mutation'>>(
  fn: T,
  args: T['_args']
) => void;
runMutation(generatedLikeApi.todos.create, {
  title: 'x',
  dueDate: new Date(),
});
runMutation(generatedLikeApi.todos.create.functionRef, {
  title: 'x',
  dueDate: null,
});
// @ts-expect-error dueDate keeps Date/null/undefined typing
runMutation(generatedLikeApi.todos.create, { title: 'x', dueDate: 123 });

const generatedRscProxy = createServerCRPCProxy({ api: generatedLikeApi });
generatedRscProxy.todos.get.queryOptions({ id: 'todo_1' });

// ============================================================================
// In-process createCaller(ctx) typing (query/mutation matrix)
// ============================================================================

type GeneratedCallerQueryCtx = {
  db: unknown;
};

type GeneratedCallerMutationCtx = {
  db: unknown;
  runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
};

type GeneratedCallerActionCtx = {
  runQuery: (ref: unknown, args: unknown) => Promise<unknown>;
  runMutation: (ref: unknown, args: unknown) => Promise<unknown>;
};

const generatedCallerProcedures = {
  organization: {
    get: defineProcedure<
      'query',
      {
        _handler: (
          ctx: GeneratedCallerQueryCtx | GeneratedCallerMutationCtx,
          input: { slug: string }
        ) => Promise<{ id: string; slug: string }>;
      }
    >('query'),
    list: defineProcedure<
      'query',
      {
        _handler: (
          ctx: GeneratedCallerQueryCtx | GeneratedCallerMutationCtx,
          input: Record<string, never>
        ) => Promise<Array<{ id: string }>>;
      }
    >('query'),
    update: defineProcedure<
      'mutation',
      {
        _handler: (
          ctx: GeneratedCallerMutationCtx,
          input: { id: string; name: string }
        ) => Promise<{ ok: true }>;
      }
    >('mutation'),
  },
  jobs: {
    reindex: defineProcedure<
      'action',
      {
        _handler: (
          ctx: GeneratedCallerMutationCtx,
          input: { force: boolean }
        ) => Promise<{ started: boolean }>;
      }
    >('action'),
  },
} as const;

const generatedCallerRuntimeMap = {
  'organization.get': {
    _crpcMeta: { type: 'query' as const },
    _handler: async (
      _ctx: GeneratedCallerQueryCtx | GeneratedCallerMutationCtx,
      input: { slug: string }
    ) => ({ id: 'org_1', slug: input.slug }),
  },
  'organization.list': {
    _crpcMeta: { type: 'query' as const },
    _handler: async () => [{ id: 'org_1' }],
  },
  'organization.update': {
    _crpcMeta: { type: 'mutation' as const },
    _handler: async (_ctx: GeneratedCallerMutationCtx) => ({
      ok: true as const,
    }),
  },
  'jobs.reindex': {
    _crpcMeta: { type: 'action' as const },
    _handler: async () => ({ started: true }),
  },
} as const;

const createGeneratedCaller = createProcedureCallerFactory<
  GeneratedCallerQueryCtx,
  GeneratedCallerMutationCtx,
  typeof generatedCallerProcedures
>({
  api: generatedCallerProcedures,
  resolver: (path) =>
    generatedCallerRuntimeMap[
      path.join('.') as keyof typeof generatedCallerRuntimeMap
    ],
});

declare const generatedQueryCtx: GeneratedCallerQueryCtx;
declare const generatedMutationCtx: GeneratedCallerMutationCtx;
declare const generatedActionCtx: GeneratedCallerActionCtx;

const generatedQueryCaller = createGeneratedCaller(generatedQueryCtx);
generatedQueryCaller.organization.get({ slug: 'acme' });
generatedQueryCaller.organization.list();
generatedQueryCaller.organization.list({});
// @ts-expect-error query caller excludes mutation procedures
generatedQueryCaller.organization.update({ id: 'org_1', name: 'Renamed' });
// @ts-expect-error query caller excludes action procedures
generatedQueryCaller.jobs.reindex({ force: true });

const generatedMutationCaller = createGeneratedCaller(generatedMutationCtx);
generatedMutationCaller.organization.get({ slug: 'acme' });
generatedMutationCaller.organization.update({ id: 'org_1', name: 'Renamed' });
// @ts-expect-error mutation caller excludes action procedures
generatedMutationCaller.jobs.reindex({ force: true });

// @ts-expect-error createProcedureCallerFactory remains query/mutation only
createGeneratedCaller(generatedActionCtx);

const createGeneratedHandler = createProcedureHandlerFactory<
  GeneratedCallerQueryCtx,
  GeneratedCallerMutationCtx,
  typeof generatedCallerProcedures
>({
  api: generatedCallerProcedures,
  resolver: (path) =>
    generatedCallerRuntimeMap[
      path.join('.') as keyof typeof generatedCallerRuntimeMap
    ],
});

const generatedQueryHandler = createGeneratedHandler(generatedQueryCtx);
generatedQueryHandler.organization.get({ slug: 'acme' });
generatedQueryHandler.organization.list();
generatedQueryHandler.organization.list({});
// @ts-expect-error query handler excludes mutation procedures
generatedQueryHandler.organization.update({ id: 'org_1', name: 'Renamed' });
// @ts-expect-error query handler excludes action procedures
generatedQueryHandler.jobs.reindex({ force: true });

const generatedMutationHandler = createGeneratedHandler(generatedMutationCtx);
generatedMutationHandler.organization.get({ slug: 'acme' });
generatedMutationHandler.organization.update({ id: 'org_1', name: 'Renamed' });
// @ts-expect-error mutation handler excludes action procedures
generatedMutationHandler.jobs.reindex({ force: true });

type GeneratedQueryCallerGetOutput = Awaited<
  ReturnType<typeof generatedQueryCaller.organization.get>
>;
type _generatedQueryCallerGetOutput = Expect<
  Equal<GeneratedQueryCallerGetOutput, { id: string; slug: string }>
>;

type GeneratedMutationCallerUpdateOutput = Awaited<
  ReturnType<typeof generatedMutationCaller.organization.update>
>;
type _generatedMutationCallerUpdateOutput = Expect<
  Equal<GeneratedMutationCallerUpdateOutput, { ok: true }>
>;

const generatedRegistryQueryRef = makeFunctionReference<
  'query',
  { slug: string },
  { id: string; slug: string }
>('organization:get');
const generatedRegistryMutationRef = makeFunctionReference<
  'mutation',
  { id: string; name: string },
  { ok: true }
>('organization:update');
const generatedRegistryActionRef = makeFunctionReference<
  'action',
  { force: boolean },
  { started: boolean }
>('jobs:reindex');

const generatedRegistry = {
  'organization.get': [
    'query',
    typedProcedureResolver(
      generatedRegistryQueryRef,
      async () => generatedCallerRuntimeMap['organization.get']
    ),
  ],
  'organization.update': [
    'mutation',
    typedProcedureResolver(
      generatedRegistryMutationRef,
      async () => generatedCallerRuntimeMap['organization.update']
    ),
  ],
  'jobs.reindex': [
    'action',
    typedProcedureResolver(
      generatedRegistryActionRef,
      async () => generatedCallerRuntimeMap['jobs.reindex']
    ),
  ],
} as const;

const createGeneratedRegistryCaller = createGenericCallerFactory<
  GeneratedCallerQueryCtx,
  GeneratedCallerMutationCtx,
  typeof generatedRegistry,
  GeneratedCallerActionCtx
>(generatedRegistry);

const generatedActionCaller = createGeneratedRegistryCaller(generatedActionCtx);
generatedActionCaller.organization.get({ slug: 'acme' });
generatedActionCaller.organization.update({ id: 'org_1', name: 'Renamed' });
generatedActionCaller.actions.jobs.reindex({ force: true });
generatedActionCaller.schedule.now.organization.update({
  id: 'org_1',
  name: 'Renamed',
});
generatedActionCaller.schedule.now.jobs.reindex({ force: true });
// @ts-expect-error schedule caller excludes query procedures
generatedActionCaller.schedule.now.organization.get({ slug: 'acme' });
// @ts-expect-error action caller excludes action procedures on root
generatedActionCaller.jobs.reindex({ force: true });
