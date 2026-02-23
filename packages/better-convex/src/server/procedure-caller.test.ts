import { z } from 'zod';
import { initCRPC } from './builder';
import {
  createGenericCallerFactory,
  createGenericHandlerFactory,
  createProcedureCallerFactory,
  createProcedureHandlerFactory,
  defineProcedure,
  typedProcedureResolver,
} from './procedure-caller';

type QueryCtx = {
  db: {
    kind: 'query';
  };
};

type MutationCtx = {
  db: {
    kind: 'mutation';
  };
  runMutation: () => Promise<void>;
  scheduler?: {
    runAfter?: (
      delayMs: number,
      fn: unknown,
      args: unknown
    ) => Promise<unknown>;
    runAt?: (
      timestamp: number | Date,
      fn: unknown,
      args: unknown
    ) => Promise<unknown>;
    cancel?: (id: unknown) => Promise<void>;
  };
};

type ActionCtx = {
  runAction?: (fn: unknown, args: unknown) => Promise<unknown>;
  runQuery: (fn: unknown, args: unknown) => Promise<unknown>;
  runMutation: (fn: unknown, args: unknown) => Promise<unknown>;
  scheduler?: {
    runAfter?: (
      delayMs: number,
      fn: unknown,
      args: unknown
    ) => Promise<unknown>;
    runAt?: (
      timestamp: number | Date,
      fn: unknown,
      args: unknown
    ) => Promise<unknown>;
    cancel?: (id: unknown) => Promise<void>;
  };
};

const queryCtx: QueryCtx = { db: { kind: 'query' } };
const mutationCtx: MutationCtx = {
  db: { kind: 'mutation' },
  runMutation: async () => {},
};
const actionCtx: ActionCtx = {
  runQuery: async () => {},
  runMutation: async () => {},
};

describe('server/procedure-caller', () => {
  const queryProcedure = {
    _crpcMeta: { type: 'query' as const },
    _handler: mock(
      async (ctx: QueryCtx | MutationCtx, input: { id: string }) => {
        return { id: input.id, ctxKind: ctx.db.kind };
      }
    ),
  };

  const mutationProcedure = {
    _crpcMeta: { type: 'mutation' as const },
    _handler: mock(async (_ctx: MutationCtx, input: { name: string }) => {
      return { ok: true, name: input.name };
    }),
  };

  const actionProcedure = {
    _crpcMeta: { type: 'action' as const },
    _handler: mock(async () => ({ ok: true })),
  };

  const nonProcedureLeaf = { nope: true };

  const api = {
    posts: {
      list: defineProcedure<'query', typeof queryProcedure>('query'),
      create: defineProcedure<'mutation', typeof mutationProcedure>('mutation'),
    },
    jobs: {
      reindex: defineProcedure<'action', typeof actionProcedure>('action'),
    },
    utils: {
      broken: defineProcedure<'query', typeof nonProcedureLeaf>('query'),
    },
  } as const;

  const resolverMap = {
    'posts.list': async () => queryProcedure,
    'posts.create': async () => mutationProcedure,
    'jobs.reindex': async () => actionProcedure,
    'utils.broken': async () => nonProcedureLeaf,
  } as const;

  const createCaller = createProcedureCallerFactory({
    api,
    resolver: async (path) => {
      const key = path.join('.') as keyof typeof resolverMap;
      const resolver = resolverMap[key];
      if (!resolver) return;
      return resolver();
    },
  });

  test('query ctx can call query procedures', async () => {
    const caller = createCaller(queryCtx);
    await expect(caller.posts.list({ id: 'p_1' })).resolves.toEqual({
      id: 'p_1',
      ctxKind: 'query',
    });
  });

  test('query ctx calling mutation throws deterministic matrix error', async () => {
    const caller = createCaller(queryCtx);
    await expect(caller.posts.create({ name: 'x' })).rejects.toThrow(
      /cannot call mutation procedures from query context/i
    );
  });

  test('mutation ctx can call query and mutation procedures', async () => {
    const caller = createCaller(mutationCtx);

    await expect(caller.posts.list({ id: 'p_2' })).resolves.toEqual({
      id: 'p_2',
      ctxKind: 'mutation',
    });
    await expect(caller.posts.create({ name: 'demo' })).resolves.toEqual({
      ok: true,
      name: 'demo',
    });
  });

  test('action ctx is unsupported for createCaller', async () => {
    const caller = createCaller(actionCtx as any);
    await expect(caller.posts.list({ id: 'p_3' })).rejects.toThrow(
      /action context is not supported/i
    );
  });

  test('throws deterministic invalid-path and non-procedure-leaf errors', async () => {
    const caller = createCaller(queryCtx);
    await expect((caller as any).missing.path({})).rejects.toThrow(
      /invalid procedure path/i
    );
    await expect((caller as any).posts({})).rejects.toThrow(
      /does not resolve to a procedure/i
    );
  });

  test('throws when resolver returns a non-procedure export', async () => {
    const caller = createCaller(queryCtx);
    await expect(caller.utils.broken({} as any)).rejects.toThrow(
      /resolved value is not a cRPC procedure/i
    );
  });

  test('invokes underlying _handler so validation/middleware/output still execute', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .input(z.object({ x: z.number() }))
      .output(z.object({ value: z.number() }))
      .use(async ({ input, next, ctx }) => {
        return next({ ctx, input: { x: input.x + 1 } });
      })
      .query(async ({ input }) => {
        return { value: input.x };
      });

    const createDirectCaller = createProcedureCallerFactory({
      api: {
        math: {
          bump: defineProcedure<'query', typeof procedure>('query'),
        },
      } as const,
      resolver: async () => procedure,
    });

    const caller = createDirectCaller(queryCtx);
    await expect(caller.math.bump({ x: 1 })).resolves.toEqual({ value: 2 });
    await expect(caller.math.bump({ x: 'bad' } as any)).rejects.toBeTruthy();
  });

  test('decodes wire-serialized Date output for direct procedure caller', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .output(z.object({ createdAt: z.date() }))
      .query(async () => ({ createdAt: new Date('2026-01-01T00:00:00.000Z') }));

    const createDirectCaller = createProcedureCallerFactory({
      api: {
        dates: {
          now: defineProcedure<'query', typeof procedure>('query'),
        },
      } as const,
      resolver: async () => procedure,
    });

    const caller = createDirectCaller(queryCtx);
    const result = await caller.dates.now();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  test('decodes wire-serialized Date output for generated registry caller', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .output(z.object({ createdAt: z.date() }))
      .query(async () => ({ createdAt: new Date('2026-01-02T00:00:00.000Z') }));

    const procedureRegistry = {
      'dates.now': ['query', async () => procedure],
    } as const;

    const createRegistryCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof procedureRegistry
    >(procedureRegistry);

    const caller = createRegistryCaller(queryCtx);
    const result = await caller.dates.now();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  test('generated caller on action ctx dispatches query via runQuery', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .input(z.object({ id: z.string() }))
      .output(z.object({ id: z.string() }))
      .query(async ({ input }) => ({ id: input.id }));

    const queryRef = { path: 'posts.list' } as any;
    const runQuery = mock(async (fn: unknown, args: unknown) => {
      expect(fn).toBe(queryRef);
      return (procedure as any)._handler(queryCtx as any, args as any);
    });
    const runMutation = mock(async () => ({ ok: true }));

    const registry = {
      'posts.list': [
        'query',
        typedProcedureResolver(queryRef, async () => procedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runMutation,
      runQuery,
    } as ActionCtx);
    await expect(caller.posts.list({ id: 'p_9' })).resolves.toEqual({
      id: 'p_9',
    });
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(runMutation).toHaveBeenCalledTimes(0);
  });

  test('generated caller on action ctx dispatches mutation via runMutation', async () => {
    const c = initCRPC.create();
    const procedure = c.mutation
      .input(z.object({ name: z.string() }))
      .output(z.object({ ok: z.boolean(), name: z.string() }))
      .mutation(async ({ input }) => ({ ok: true, name: input.name }));

    const mutationRef = { path: 'posts.create' } as any;
    const runQuery = mock(async () => null);
    const runMutation = mock(async (fn: unknown, args: unknown) => {
      expect(fn).toBe(mutationRef);
      return (procedure as any)._handler(mutationCtx as any, args as any);
    });

    const registry = {
      'posts.create': [
        'mutation',
        typedProcedureResolver(mutationRef, async () => procedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runMutation,
      runQuery,
    } as ActionCtx);
    await expect(caller.posts.create({ name: 'demo' })).resolves.toEqual({
      ok: true,
      name: 'demo',
    });
    expect(runMutation).toHaveBeenCalledTimes(1);
    expect(runQuery).toHaveBeenCalledTimes(0);
  });

  test('generated caller on action ctx rejects action procedures', async () => {
    const c = initCRPC.create();
    const procedure = c.action
      .input(z.object({ force: z.boolean() }))
      .output(z.object({ started: z.boolean() }))
      .action(async () => ({ started: true }));

    const actionRef = { path: 'jobs.reindex' } as any;
    const runQuery = mock(async () => null);
    const runMutation = mock(async () => null);

    const registry = {
      'jobs.reindex': [
        'action',
        typedProcedureResolver(actionRef, async () => procedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runMutation,
      runQuery,
    } as ActionCtx) as any;
    await expect(caller.jobs.reindex({ force: true })).rejects.toThrow(
      /cannot call action procedures from action context/i
    );
  });

  test('generated caller on action ctx dispatches action procedures via actions namespace', async () => {
    const c = initCRPC.create();
    const procedure = c.action
      .input(z.object({ force: z.boolean() }))
      .output(z.object({ started: z.boolean() }))
      .action(async ({ input }) => ({ started: input.force }));

    const actionRef = { path: 'jobs.reindex' } as any;
    const runQuery = mock(async () => null);
    const runMutation = mock(async () => null);
    const runAction = mock(async (fn: unknown, args: unknown) => {
      expect(fn).toBe(actionRef);
      return (procedure as any)._handler({} as any, args as any);
    });

    const registry = {
      'jobs.reindex': [
        'action',
        typedProcedureResolver(actionRef, async () => procedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runAction,
      runMutation,
      runQuery,
    } as ActionCtx);
    await expect(caller.actions.jobs.reindex({ force: true })).resolves.toEqual(
      { started: true }
    );
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  test('generated caller scheduling with now/after/at routes through scheduler', async () => {
    const c = initCRPC.create();
    const mutationProcedure = c.mutation
      .input(z.object({ name: z.string() }))
      .output(z.object({ ok: z.boolean() }))
      .mutation(async () => ({ ok: true }));
    const actionProcedure = c.action
      .input(z.object({ force: z.boolean() }))
      .output(z.object({ started: z.boolean() }))
      .action(async () => ({ started: true }));

    const mutationRef = { path: 'posts.create' } as any;
    const actionRef = { path: 'jobs.reindex' } as any;
    const runAfter = mock(async () => 'sched_after');
    const runAt = mock(async () => 'sched_at');
    const cancel = mock(async () => {});

    const registry = {
      'posts.create': [
        'mutation',
        typedProcedureResolver(mutationRef, async () => mutationProcedure),
      ],
      'jobs.reindex': [
        'action',
        typedProcedureResolver(actionRef, async () => actionProcedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<MutationCtx>({
      ...mutationCtx,
      scheduler: {
        runAfter,
        runAt,
        cancel,
      },
    } as MutationCtx);

    await expect(
      caller.schedule.now.posts.create({ name: 'alpha' })
    ).resolves.toBe('sched_after');
    await expect(
      caller.schedule.after(50).jobs.reindex({ force: true })
    ).resolves.toBe('sched_after');
    const date = new Date('2026-01-01T00:00:00.000Z');
    await expect(
      caller.schedule.at(date).jobs.reindex({ force: true })
    ).resolves.toBe('sched_at');
    await caller.schedule.cancel('scheduled_id' as any);

    expect(runAfter).toHaveBeenCalledTimes(2);
    expect(runAfter).toHaveBeenNthCalledWith(
      1,
      0,
      mutationRef,
      expect.anything()
    );
    expect(runAfter).toHaveBeenNthCalledWith(
      2,
      50,
      actionRef,
      expect.anything()
    );
    expect(runAt).toHaveBeenCalledWith(date, actionRef, expect.anything());
    expect(cancel).toHaveBeenCalledWith('scheduled_id');
  });

  test('generated caller schedule excludes query procedures', async () => {
    const c = initCRPC.create();
    const queryProcedure = c.query
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => ({ id: input.id }));
    const queryRef = { path: 'posts.list' } as any;
    const runAfter = mock(async () => 'scheduled');

    const registry = {
      'posts.list': [
        'query',
        typedProcedureResolver(queryRef, async () => queryProcedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<MutationCtx>({
      ...mutationCtx,
      scheduler: {
        runAfter,
      },
    } as MutationCtx) as any;

    await expect(caller.schedule.now.posts.list({ id: 'p_1' })).rejects.toThrow(
      /cannot schedule query procedures/i
    );
  });

  test('generated caller schedule throws when scheduler is missing', async () => {
    const c = initCRPC.create();
    const mutationProcedure = c.mutation
      .input(z.object({ name: z.string() }))
      .mutation(async () => ({ ok: true }));
    const mutationRef = { path: 'posts.create' } as any;

    const registry = {
      'posts.create': [
        'mutation',
        typedProcedureResolver(mutationRef, async () => mutationProcedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller(mutationCtx);
    await expect(
      caller.schedule.now.posts.create({ name: 'demo' })
    ).rejects.toThrow(/missing ctx.scheduler/i);
  });

  test('generated caller on action ctx throws without typed resolver metadata', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .output(z.object({ ok: z.boolean() }))
      .query(async () => ({ ok: true }));

    const runQuery = mock(async () => null);
    const runMutation = mock(async () => null);

    const registry = {
      'health.check': ['query', async () => procedure],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runMutation,
      runQuery,
    } as ActionCtx);
    await expect(caller.health.check()).rejects.toThrow(
      /missing function reference metadata/i
    );
  });

  test('generated caller on action ctx decodes wire-serialized Date output', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .output(z.object({ createdAt: z.date() }))
      .query(async () => ({ createdAt: new Date('2026-01-03T00:00:00.000Z') }));

    const queryRef = { path: 'dates.now' } as any;
    const runQuery = mock(async (_fn: unknown, args: unknown) => {
      return (procedure as any)._handler(queryCtx as any, args as any);
    });
    const runMutation = mock(async () => null);

    const registry = {
      'dates.now': [
        'query',
        typedProcedureResolver(queryRef, async () => procedure),
      ],
    } as const;

    const createCaller = createGenericCallerFactory<
      QueryCtx,
      MutationCtx,
      typeof registry,
      ActionCtx
    >(registry);

    const caller = createCaller<ActionCtx>({
      runMutation,
      runQuery,
    } as ActionCtx);
    const result = await caller.dates.now();
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  test('handler caller bypasses input validation, middleware, and output validation', async () => {
    const c = initCRPC.create();
    const procedure = c.query
      .input(z.object({ x: z.number() }))
      .output(z.object({ value: z.number() }))
      .use(async () => {
        throw new Error('middleware should run only in createCaller');
      })
      .query(async ({ input }) => {
        return { value: input.x as any };
      });

    const createStrictCaller = createProcedureCallerFactory({
      api: {
        math: {
          passthrough: defineProcedure<'query', typeof procedure>('query'),
        },
      } as const,
      resolver: async () => procedure,
    });

    const createHandler = createProcedureHandlerFactory({
      api: {
        math: {
          passthrough: defineProcedure<'query', typeof procedure>('query'),
        },
      } as const,
      resolver: async () => procedure,
    });

    const strictCaller = createStrictCaller(queryCtx);
    await expect(strictCaller.math.passthrough({ x: 1 })).rejects.toThrow(
      /middleware should run only in createCaller/i
    );

    const handler = createHandler(queryCtx);
    await expect(handler.math.passthrough({ x: '1' } as any)).resolves.toEqual({
      value: '1',
    } as any);
  });

  test('generated handler factory keeps query/mutation matrix and bypasses pipeline', async () => {
    const c = initCRPC.create();
    const queryProcedure = c.query
      .input(z.object({ x: z.number() }))
      .output(z.object({ value: z.number() }))
      .query(async ({ input }) => ({ value: input.x as any }));
    const mutationProcedure = c.mutation
      .input(z.object({ name: z.string() }))
      .output(z.object({ ok: z.boolean() }))
      .mutation(async () => ({ ok: true }));

    const procedureRegistry = {
      'math.query': ['query', async () => queryProcedure],
      'math.mutate': ['mutation', async () => mutationProcedure],
    } as const;

    const createHandler = createGenericHandlerFactory<
      QueryCtx,
      MutationCtx,
      typeof procedureRegistry
    >(procedureRegistry);

    const queryHandler = createHandler(queryCtx);
    await expect(queryHandler.math.query({ x: '1' } as any)).resolves.toEqual({
      value: '1',
    } as any);
    await expect(
      (queryHandler as any).math.mutate({ name: 'x' })
    ).rejects.toThrow(/cannot call mutation procedures from query context/i);

    const mutationHandler = createHandler(mutationCtx);
    await expect(
      mutationHandler.math.query({ x: '2' } as any)
    ).resolves.toEqual({ value: '2' } as any);
    await expect(mutationHandler.math.mutate({ name: 'ok' })).resolves.toEqual({
      ok: true,
    });

    const actionHandler = createHandler(actionCtx as any);
    await expect(actionHandler.math.query({ x: 1 })).rejects.toThrow(
      /action context is not supported/i
    );
  });

  test('generated handler can call internal-style procedures from generated namespace', async () => {
    const beforeCreateProcedure = {
      _crpcMeta: { type: 'mutation' as const, internal: true },
      _handler: mock(
        async (
          _ctx: MutationCtx,
          input: { data: { email: string }; model: string }
        ) => ({
          ...input.data,
          model: input.model,
          tagged: true,
        })
      ),
    };

    const procedureRegistry = {
      'generated.beforeCreate': ['mutation', async () => beforeCreateProcedure],
    } as const;

    const createHandler = createGenericHandlerFactory<
      QueryCtx,
      MutationCtx,
      typeof procedureRegistry
    >(procedureRegistry);

    const mutationHandler = createHandler(mutationCtx);
    await expect(
      mutationHandler.generated.beforeCreate({
        data: { email: 'a@b.com' },
        model: 'user',
      })
    ).resolves.toEqual({
      email: 'a@b.com',
      model: 'user',
      tagged: true,
    });

    const queryHandler = createHandler(queryCtx) as any;
    await expect(
      queryHandler.generated.beforeCreate({
        data: { email: 'a@b.com' },
        model: 'user',
      })
    ).rejects.toThrow(/cannot call mutation procedures from query context/i);
  });
});
