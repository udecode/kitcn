import { internalMutationGeneric } from 'convex/server';
import { v } from 'convex/values';
import { unsetToken } from '../orm';
import { createApi } from './create-api';

const schema = {
  tables: {
    user: {
      _id: { config: { name: '_id' } },
      validator: {
        fields: {
          email: v.string(),
          name: v.optional(v.string()),
        },
      },
      export: () => ({ indexes: [] }),
    },
    session: {
      _id: { config: { name: '_id' } },
      validator: {
        fields: {
          token: v.string(),
        },
      },
      export: () => ({ indexes: [] }),
    },
  },
} as any;

describe('auth/create-api createApi()', () => {
  afterEach(() => {
    mock.restore();
  });

  test('builds typed validators and internal actions', async () => {
    const authCalls: any[] = [];
    const getAuth = (ctx: any) => {
      authCalls.push(ctx);
      return {
        options: {
          // Override built-in unique fields so checkUniqueFields returns early.
          plugins: [
            {
              schema: {
                user: {
                  fields: { email: { unique: false }, name: { unique: false } },
                },
                session: { fields: { token: { unique: false } } },
              },
            },
          ],
        },
        api: {
          getLatestJwks: () => 'jwks',
          rotateKeys: () => 'rotated',
        },
      };
    };

    const api = createApi(schema, getAuth as any);

    expect(api).toHaveProperty('create');
    expect(api).toHaveProperty('findOne');
    expect(api).toHaveProperty('findMany');
    expect(api).toHaveProperty('updateOne');
    expect(api).toHaveProperty('updateMany');
    expect(api).toHaveProperty('deleteOne');
    expect(api).toHaveProperty('deleteMany');
    expect(api).toHaveProperty('getLatestJwks');
    expect(api).toHaveProperty('rotateKeys');

    await expect(
      (api.getLatestJwks as any)._handler({ id: 'ctx1' }, {})
    ).resolves.toBe('jwks');
    await expect(
      (api.rotateKeys as any)._handler({ id: 'ctx2' }, {})
    ).resolves.toBe('rotated');

    // createApi() now resolves auth lazily, so only action handlers call getAuth(ctx).
    expect(authCalls).toEqual([{ id: 'ctx1' }, { id: 'ctx2' }]);
  });

  test('generated functions execute their handler closures (coverage smoke)', async () => {
    const getAuth = (_ctx: any) => ({
      options: {
        // Override built-in unique fields so checkUniqueFields returns early.
        plugins: [
          {
            schema: {
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
              session: { fields: { token: { unique: false } } },
            },
          },
        ],
      },
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
    });

    const api = createApi(schema, getAuth as any);

    const store = new Map<string, any>([
      ['user-1', { _id: 'user-1', email: 'a@site.com', name: 'alice' }],
      ['user-2', { _id: 'user-2', email: 'b@site.com', name: 'bob' }],
    ]);

    const runMutation = mock(async (handle: string, args: any) => {
      if (handle === 'before-create') return { ...args.data, name: 'created' };
      if (handle === 'before-update')
        return { ...args.update, name: 'updated' };
      if (handle === 'before-delete') return { ...args.doc, name: 'deleted' };
    });

    const ctx = {
      db: {
        insert: async (_model: string, data: Record<string, unknown>) => {
          const id = `user-${store.size + 1}`;
          store.set(id, { _id: id, ...data });
          return id;
        },
        get: async (id: string) => store.get(id) ?? null,
        patch: async (id: string, update: Record<string, unknown>) => {
          const existing = store.get(id);
          if (!existing) return;
          store.set(id, { ...existing, ...update });
        },
        delete: async (id: string) => {
          store.delete(id);
        },
      },
      runMutation,
    };

    await expect(
      (api.create as any)._handler(ctx, {
        beforeCreateHandle: 'before-create',
        onCreateHandle: 'on-create',
        input: { model: 'user', data: { email: 'c@site.com', name: 'c' } },
        select: ['email'],
      })
    ).resolves.toEqual({ email: 'c@site.com' });

    await expect(
      (api.findOne as any)._handler(ctx, {
        model: 'user',
        where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
      })
    ).resolves.toMatchObject({ _id: 'user-1' });

    await expect(
      (api.findMany as any)._handler(ctx, {
        model: 'user',
        paginationOpts: { cursor: null, numItems: 10 },
        where: [{ field: '_id', operator: 'in', value: ['user-1', 'user-2'] }],
      })
    ).resolves.toMatchObject({ isDone: true });

    await expect(
      (api.updateOne as any)._handler(ctx, {
        beforeUpdateHandle: 'before-update',
        onUpdateHandle: 'on-update',
        input: {
          model: 'user',
          update: { name: 'ignored' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      })
    ).resolves.toMatchObject({ _id: 'user-1', name: 'updated' });

    await expect(
      (api.updateMany as any)._handler(ctx, {
        beforeUpdateHandle: 'before-update',
        onUpdateHandle: 'on-update',
        input: {
          model: 'user',
          update: { name: 'ignored' },
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).resolves.toMatchObject({ isDone: true, count: expect.any(Number) });

    await expect(
      (api.deleteOne as any)._handler(ctx, {
        beforeDeleteHandle: 'before-delete',
        onDeleteHandle: 'on-delete',
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'eq', value: 'user-2' }],
        },
      })
    ).resolves.toMatchObject({ _id: 'user-2', name: 'deleted' });

    await expect(
      (api.deleteMany as any)._handler(ctx, {
        beforeDeleteHandle: 'before-delete',
        onDeleteHandle: 'on-delete',
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'in', value: ['user-1'] }],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).resolves.toMatchObject({ isDone: true, count: expect.any(Number) });

    expect(runMutation).toHaveBeenCalled();
  });

  test('validateInput toggles exported arg schema shape', async () => {
    const getAuth = (_ctx: any) => ({
      options: {
        plugins: [
          {
            schema: {
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
              session: { fields: { token: { unique: false } } },
            },
          },
        ],
      },
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
    });

    const loose = createApi(schema, getAuth as any);
    const strict = createApi(schema, getAuth as any, {
      validateInput: true,
    });

    const looseFindOneArgs = JSON.parse((loose.findOne as any).exportArgs());
    const strictFindOneArgs = JSON.parse((strict.findOne as any).exportArgs());

    expect(looseFindOneArgs.value.model.fieldType.type).toBe('string');
    expect(strictFindOneArgs.value.model.fieldType.type).toBe('union');
  });

  test('options.internalMutation overrides internalMutationGeneric', async () => {
    const getAuth = (_ctx: any) => ({
      options: {
        plugins: [
          {
            schema: {
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
              session: { fields: { token: { unique: false } } },
            },
          },
        ],
      },
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
    });

    const calls: any[] = [];
    const internalMutation = (cfg: any) => {
      calls.push(cfg);
      return internalMutationGeneric(cfg);
    };

    createApi(schema, getAuth as any, {
      internalMutation: internalMutation as any,
    });

    // create/deleteMany/deleteOne/updateMany/updateOne all use mutationBuilder
    expect(calls.length).toBe(5);
  });

  test('context runs for CRUD mutations', async () => {
    const getAuth = (_ctx: any) => ({
      options: {
        plugins: [
          {
            schema: {
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
              session: { fields: { token: { unique: false } } },
            },
          },
        ],
      },
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
    });

    const order: string[] = [];
    const api = createApi(schema, getAuth as any, {
      context: async (ctx: any) => {
        order.push('context');
        return { ...ctx, mutationWrapped: true };
      },
    });

    const store = new Map<string, any>();
    const ctx = {
      db: {
        insert: async (_model: string, data: Record<string, unknown>) => {
          const id = `user-${store.size + 1}`;
          store.set(id, { _id: id, ...data });
          return id;
        },
        get: async (id: string) => store.get(id) ?? null,
      },
      runMutation: mock(async () => undefined),
    };

    await (api.create as any)._handler(ctx, {
      input: {
        model: 'user',
        data: { email: 'a@site.com', name: 'alice' },
      },
    });

    expect(order).toEqual(['context']);
  });

  describe('ORM-first writes', () => {
    const getAuth = (_ctx: any) => ({
      options: {
        plugins: [
          {
            schema: {
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
              session: { fields: { token: { unique: false } } },
            },
          },
        ],
      },
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
    });

    const createOrmCtx = (docsById: Record<string, any>) => {
      const store = new Map<string, any>(Object.entries(docsById));
      const dbInsert = mock(async (_model: string, _data: any) => {
        throw new Error('db.insert should not be called when orm is available');
      });
      const dbPatch = mock(async (_id: string, _update: any) => {
        throw new Error('db.patch should not be called when orm is available');
      });
      const dbDelete = mock(async (_id: string) => {
        throw new Error('db.delete should not be called when orm is available');
      });

      const ormInsert = mock((_table: any) => ({
        values: (data: Record<string, unknown>) => ({
          returning: async () => {
            const id = `user-${store.size + 1}`;
            const doc = { _id: id, ...data };
            store.set(id, doc);
            return [doc];
          },
        }),
      }));

      const ormSet = mock((update: Record<string, unknown>) => {
        const where = async (expr: any) => {
          const id = expr?.operands?.[1] as string | undefined;
          const current = id ? store.get(id) : undefined;
          if (!id || !current) {
            return [];
          }
          const nextDoc = { ...current };
          for (const [key, value] of Object.entries(update)) {
            if (value === unsetToken || value === undefined) {
              delete (nextDoc as Record<string, unknown>)[key];
              continue;
            }
            (nextDoc as Record<string, unknown>)[key] = value;
          }
          store.set(id, nextDoc);
          return [nextDoc];
        };

        return {
          where,
          returning: () => ({ where }),
        };
      });

      const ormUpdate = mock((_table: any) => ({
        set: ormSet,
      }));

      const ormDeleteWhere = mock(async (expr: any) => {
        const id = expr?.operands?.[1] as string | undefined;
        if (id) {
          store.delete(id);
        }
      });

      const ormDelete = mock((_table: any) => ({
        where: ormDeleteWhere,
      }));

      return {
        store,
        ctx: {
          db: {
            insert: dbInsert,
            get: async (id: string) => store.get(id) ?? null,
            patch: dbPatch,
            delete: dbDelete,
          },
          orm: {
            insert: ormInsert,
            update: ormUpdate,
            delete: ormDelete,
          },
          runMutation: mock(async () => undefined),
        },
        spies: {
          dbDelete,
          dbInsert,
          dbPatch,
          ormDeleteWhere,
          ormInsert,
          ormSet,
        },
      };
    };

    test('deleteOne uses ORM delete path when ctx.orm exists', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({
        'user-1': { _id: 'user-1', email: 'a@site.com', name: 'alice' },
      });

      await (api.deleteOne as any)._handler(ctx, {
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(spies.ormDeleteWhere).toHaveBeenCalledTimes(1);
      expect(spies.dbDelete).not.toHaveBeenCalled();
      expect(store.get('user-1')).toBeUndefined();
    });

    test('deleteMany uses ORM delete path per document when ctx.orm exists', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({
        'user-1': { _id: 'user-1', email: 'a@site.com', name: 'alice' },
        'user-2': { _id: 'user-2', email: 'b@site.com', name: 'bob' },
      });

      await (api.deleteMany as any)._handler(ctx, {
        input: {
          model: 'user',
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      });

      expect(spies.ormDeleteWhere).toHaveBeenCalledTimes(2);
      expect(spies.dbDelete).not.toHaveBeenCalled();
      expect(store.size).toBe(0);
    });

    test('updateOne uses ORM update path when ctx.orm exists', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({
        'user-1': { _id: 'user-1', email: 'a@site.com', name: 'alice' },
      });

      const result = await (api.updateOne as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'updated' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(spies.ormSet).toHaveBeenCalledWith({ name: 'updated' });
      expect(spies.dbPatch).not.toHaveBeenCalled();
      expect(result).toMatchObject({ _id: 'user-1', name: 'updated' });
      expect(store.get('user-1')?.name).toBe('updated');
    });

    test('updateOne supports ORM update builders that require returning()', async () => {
      const api = createApi(schema, getAuth as any);
      const store = new Map<string, any>([
        ['user-1', { _id: 'user-1', email: 'a@site.com', name: 'alice' }],
      ]);

      const ormUpdate = mock((_table: any) => ({
        set: (update: Record<string, unknown>) => ({
          returning: () => ({
            where: async (expr: any) => {
              const id = expr?.operands?.[1] as string | undefined;
              const current = id ? store.get(id) : undefined;
              if (!id || !current) {
                return [];
              }
              const nextDoc = { ...current, ...update };
              store.set(id, nextDoc);
              return [nextDoc];
            },
          }),
        }),
      }));

      const ctx = {
        db: {
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          get: async (id: string) => store.get(id) ?? null,
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
        },
        orm: {
          insert: mock(() => ({
            values: () => ({
              returning: async () => [],
            }),
          })),
          update: ormUpdate,
          delete: mock(() => ({
            where: async () => undefined,
          })),
        },
        runMutation: mock(async () => undefined),
      };

      const result = await (api.updateOne as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'updated' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(ormUpdate).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ _id: 'user-1', name: 'updated' });
      expect(store.get('user-1')?.name).toBe('updated');
    });

    test('updateOne returns normalized ORM docs with _id when ORM returns only id', async () => {
      const api = createApi(schema, getAuth as any);
      const store = new Map<string, any>([
        ['user-1', { _id: 'user-1', email: 'a@site.com', name: 'alice' }],
      ]);
      const ormUpdate = mock((_table: any) => ({
        set: () => ({
          returning: () => ({
            where: async () => [
              { id: 'user-1', email: 'a@site.com', name: 'updated' },
            ],
          }),
        }),
      }));

      const ctx = {
        db: {
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          get: async (id: string) => store.get(id) ?? null,
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
        },
        orm: {
          insert: mock(() => ({
            values: () => ({
              returning: async () => [],
            }),
          })),
          update: ormUpdate,
          delete: mock(() => ({
            where: async () => undefined,
          })),
        },
        runMutation: mock(async () => undefined),
      };

      const result = await (api.updateOne as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'updated' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(ormUpdate).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        _id: 'user-1',
        email: 'a@site.com',
        id: 'user-1',
        name: 'updated',
      });
    });

    test('updateMany uses ORM update path per document when ctx.orm exists', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({
        'user-1': { _id: 'user-1', email: 'a@site.com', name: 'alice' },
        'user-2': { _id: 'user-2', email: 'b@site.com', name: 'bob' },
      });

      await (api.updateMany as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'updated' },
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      });

      expect(spies.ormSet).toHaveBeenCalledTimes(2);
      expect(spies.dbPatch).not.toHaveBeenCalled();
      expect(store.get('user-1')?.name).toBe('updated');
      expect(store.get('user-2')?.name).toBe('updated');
    });

    test('create uses ORM insert path when ctx.orm exists', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({});
      const createdAt = new Date('2026-02-14T13:01:46.173Z');
      const updatedAt = new Date('2026-02-14T13:01:46.168Z');
      const expiresAt = new Date('2026-02-14T13:11:46.168Z');

      const created = await (api.create as any)._handler(ctx, {
        input: {
          model: 'user',
          data: {
            email: 'c@site.com',
            name: 'carol',
            createdAt,
            updatedAt,
            expiresAt,
          },
        },
      });

      expect(spies.ormInsert).toHaveBeenCalledTimes(1);
      expect(spies.dbInsert).not.toHaveBeenCalled();
      expect(created).toMatchObject({ email: 'c@site.com', name: 'carol' });
      expect(created.createdAt).toBe(createdAt.getTime());
      expect(created.updatedAt).toBe(updatedAt.getTime());
      expect(created.expiresAt).toBe(expiresAt.getTime());
      expect(store.size).toBe(1);
    });

    test('create normalizes ORM docs for onCreate hooks and serializes Date values', async () => {
      const api = createApi(schema, getAuth as any);
      const runMutation = mock(async () => undefined);
      const createdAt = new Date('2026-02-14T12:36:05.293Z');
      const updatedAt = new Date('2026-02-14T12:36:05.168Z');
      const expiresAt = new Date('2026-02-14T12:46:05.168Z');

      const ctx = {
        db: {
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          get: async () => null,
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
        },
        orm: {
          insert: mock(() => ({
            values: () => ({
              returning: async () => [
                {
                  id: 'user-1',
                  email: 'c@site.com',
                  name: 'carol',
                  createdAt,
                  updatedAt,
                  expiresAt,
                },
              ],
            }),
          })),
          update: mock(() => ({
            set: () => ({
              returning: () => ({
                where: async () => [],
              }),
            }),
          })),
          delete: mock(() => ({
            where: async () => undefined,
          })),
        },
        runMutation,
      };

      await (api.create as any)._handler(ctx, {
        input: {
          model: 'user',
          data: { email: 'c@site.com', name: 'carol' },
        },
        onCreateHandle: 'on-create',
      });

      expect(runMutation).toHaveBeenCalledWith('on-create', {
        doc: {
          _id: 'user-1',
          createdAt: createdAt.getTime(),
          updatedAt: updatedAt.getTime(),
          expiresAt: expiresAt.getTime(),
          email: 'c@site.com',
          id: 'user-1',
          name: 'carol',
        },
        model: 'user',
      });
    });

    test('create returns normalized ORM docs with _id when ORM returns only id', async () => {
      const api = createApi(schema, getAuth as any);
      const ctx = {
        db: {
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          get: async () => null,
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
        },
        orm: {
          insert: mock(() => ({
            values: () => ({
              returning: async () => [
                { id: 'user-1', email: 'c@site.com', name: 'carol' },
              ],
            }),
          })),
          update: mock(() => ({
            set: () => ({
              returning: () => ({
                where: async () => [],
              }),
            }),
          })),
          delete: mock(() => ({
            where: async () => undefined,
          })),
        },
        runMutation: mock(async () => undefined),
      };

      const created = await (api.create as any)._handler(ctx, {
        input: {
          model: 'user',
          data: { email: 'c@site.com', name: 'carol' },
        },
      });

      expect(created).toMatchObject({
        _id: 'user-1',
        email: 'c@site.com',
        id: 'user-1',
        name: 'carol',
      });
    });

    test('falls back to ctx.db writes when ctx.orm is absent', async () => {
      const api = createApi(schema, getAuth as any);
      const store = new Map<string, any>([
        ['user-1', { _id: 'user-1', email: 'a@site.com', name: 'alice' }],
      ]);
      const dbInsert = mock(async (_model: string, data: any) => {
        const id = `user-${store.size + 1}`;
        store.set(id, { _id: id, ...data });
        return id;
      });
      const dbPatch = mock(async (id: string, patch: any) => {
        const current = store.get(id);
        if (!current) return;
        store.set(id, { ...current, ...patch });
      });
      const dbDelete = mock(async (id: string) => {
        store.delete(id);
      });

      const ctx = {
        db: {
          insert: dbInsert,
          get: async (id: string) => store.get(id) ?? null,
          patch: dbPatch,
          delete: dbDelete,
        },
        runMutation: mock(async () => undefined),
      };

      await (api.create as any)._handler(ctx, {
        input: { model: 'user', data: { email: 'b@site.com', name: 'bob' } },
      });
      await (api.updateOne as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'updated' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });
      await (api.deleteOne as any)._handler(ctx, {
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(dbInsert).toHaveBeenCalledTimes(1);
      expect(dbPatch).toHaveBeenCalledTimes(1);
      expect(dbDelete).toHaveBeenCalledTimes(1);
    });

    test('ORM update maps undefined fields to unsetToken', async () => {
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({
        'user-1': { _id: 'user-1', email: 'a@site.com', name: 'alice' },
      });

      const updated = await (api.updateOne as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { email: 'next@site.com', name: undefined },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      });

      expect(spies.ormSet).toHaveBeenCalledWith({
        email: 'next@site.com',
        name: unsetToken,
      });
      expect(updated).toMatchObject({ _id: 'user-1', email: 'next@site.com' });
      expect(store.get('user-1')).toEqual({
        _id: 'user-1',
        email: 'next@site.com',
      });
    });
  });
});
