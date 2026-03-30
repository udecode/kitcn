import { internalMutationGeneric } from 'convex/server';
import { v } from 'convex/values';
import { unsetToken } from '../orm';
import { createApi } from './create-api';

const schema = {
  tables: {
    session: {
      _id: { config: { name: '_id' } },
      export: () => ({ indexes: [] }),
      validator: {
        fields: {
          token: v.string(),
        },
      },
    },
    user: {
      _id: { config: { name: '_id' } },
      export: () => ({ indexes: [] }),
      validator: {
        fields: {
          email: v.string(),
          name: v.optional(v.string()),
        },
      },
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
        api: {
          getLatestJwks: () => 'jwks',
          rotateKeys: () => 'rotated',
        },
        options: {
          // Override built-in unique fields so checkUniqueFields returns early.
          plugins: [
            {
              schema: {
                session: { fields: { token: { unique: false } } },
                user: {
                  fields: { email: { unique: false }, name: { unique: false } },
                },
              },
            },
          ],
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
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
      options: {
        // Override built-in unique fields so checkUniqueFields returns early.
        plugins: [
          {
            schema: {
              session: { fields: { token: { unique: false } } },
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
            },
          },
        ],
      },
    });

    const api = createApi(schema, getAuth as any, {
      triggers: {
        user: {
          create: {
            before: async (data: Record<string, unknown>) => ({
              data: { ...data, name: 'created' },
            }),
          },
          delete: {
            before: async (doc: Record<string, unknown>) => ({
              data: { ...doc, name: 'deleted' },
            }),
          },
          update: {
            before: async (update: Record<string, unknown>) => ({
              data: { ...update, name: 'updated' },
            }),
          },
        },
      } as any,
    });

    const store = new Map<string, any>([
      ['user-1', { _id: 'user-1', email: 'a@site.com', name: 'alice' }],
      ['user-2', { _id: 'user-2', email: 'b@site.com', name: 'bob' }],
    ]);

    const ctx = {
      db: {
        delete: async (id: string) => {
          store.delete(id);
        },
        get: async (id: string) => store.get(id) ?? null,
        insert: async (_model: string, data: Record<string, unknown>) => {
          const id = `user-${store.size + 1}`;
          store.set(id, { _id: id, ...data });
          return id;
        },
        patch: async (id: string, update: Record<string, unknown>) => {
          const existing = store.get(id);
          if (!existing) return;
          store.set(id, { ...existing, ...update });
        },
      },
    };

    await expect(
      (api.create as any)._handler(ctx, {
        input: { data: { email: 'c@site.com', name: 'c' }, model: 'user' },
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
        input: {
          model: 'user',
          update: { name: 'ignored' },
          where: [{ field: '_id', operator: 'eq', value: 'user-1' }],
        },
      })
    ).resolves.toMatchObject({ _id: 'user-1', name: 'updated' });

    await expect(
      (api.updateMany as any)._handler(ctx, {
        input: {
          model: 'user',
          update: { name: 'ignored' },
          where: [
            { field: '_id', operator: 'in', value: ['user-1', 'user-2'] },
          ],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).resolves.toMatchObject({ count: expect.any(Number), isDone: true });

    await expect(
      (api.deleteOne as any)._handler(ctx, {
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'eq', value: 'user-2' }],
        },
      })
    ).resolves.toMatchObject({ _id: 'user-2', name: 'deleted' });

    await expect(
      (api.deleteMany as any)._handler(ctx, {
        input: {
          model: 'user',
          where: [{ field: '_id', operator: 'in', value: ['user-1'] }],
        },
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).resolves.toMatchObject({ count: expect.any(Number), isDone: true });
  });

  test('validateInput toggles exported arg schema shape', async () => {
    const getAuth = (_ctx: any) => ({
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
      options: {
        plugins: [
          {
            schema: {
              session: { fields: { token: { unique: false } } },
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
            },
          },
        ],
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
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
      options: {
        plugins: [
          {
            schema: {
              session: { fields: { token: { unique: false } } },
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
            },
          },
        ],
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
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
      options: {
        plugins: [
          {
            schema: {
              session: { fields: { token: { unique: false } } },
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
            },
          },
        ],
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
        get: async (id: string) => store.get(id) ?? null,
        insert: async (_model: string, data: Record<string, unknown>) => {
          const id = `user-${store.size + 1}`;
          store.set(id, { _id: id, ...data });
          return id;
        },
      },
      runMutation: mock(async () => undefined),
    };

    await (api.create as any)._handler(ctx, {
      input: {
        data: { email: 'a@site.com', name: 'alice' },
        model: 'user',
      },
    });

    expect(order).toEqual(['context']);
  });

  describe('ORM-first writes', () => {
    const getAuth = (_ctx: any) => ({
      api: {
        getLatestJwks: () => 'jwks',
        rotateKeys: () => 'rotated',
      },
      options: {
        plugins: [
          {
            schema: {
              session: { fields: { token: { unique: false } } },
              user: {
                fields: { email: { unique: false }, name: { unique: false } },
              },
            },
          },
        ],
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
          if (!(id && current)) {
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
          returning: () => ({ where }),
          where,
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
        ctx: {
          db: {
            delete: dbDelete,
            get: async (id: string) => store.get(id) ?? null,
            insert: dbInsert,
            patch: dbPatch,
          },
          orm: {
            delete: ormDelete,
            insert: ormInsert,
            update: ormUpdate,
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
        store,
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
              if (!(id && current)) {
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
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
          get: async (id: string) => store.get(id) ?? null,
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
        },
        orm: {
          delete: mock(() => ({
            where: async () => undefined,
          })),
          insert: mock(() => ({
            values: () => ({
              returning: async () => [],
            }),
          })),
          update: ormUpdate,
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
              { email: 'a@site.com', id: 'user-1', name: 'updated' },
            ],
          }),
        }),
      }));

      const ctx = {
        db: {
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
          get: async (id: string) => store.get(id) ?? null,
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
        },
        orm: {
          delete: mock(() => ({
            where: async () => undefined,
          })),
          insert: mock(() => ({
            values: () => ({
              returning: async () => [],
            }),
          })),
          update: ormUpdate,
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
          data: {
            createdAt,
            email: 'c@site.com',
            expiresAt,
            name: 'carol',
            updatedAt,
          },
          model: 'user',
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

    test('create defaults createdAt and updatedAt when omitted on ORM inserts', async () => {
      const now = 1_772_802_853_052;
      using nowSpy = spyOn(Date, 'now').mockReturnValue(now);
      const api = createApi(schema, getAuth as any);
      const { ctx, spies, store } = createOrmCtx({});

      const created = await (api.create as any)._handler(ctx, {
        input: {
          data: {
            email: 'c@site.com',
            name: 'carol',
          },
          model: 'user',
        },
      });

      expect(nowSpy).toHaveBeenCalledTimes(1);
      expect(spies.ormInsert).toHaveBeenCalledTimes(1);
      expect(created).toMatchObject({
        createdAt: now,
        email: 'c@site.com',
        name: 'carol',
        updatedAt: now,
      });
      expect(Array.from(store.values())[0]).toMatchObject({
        createdAt: now,
        email: 'c@site.com',
        name: 'carol',
        updatedAt: now,
      });
    });

    test('create keeps ORM-created createdAt values when the table defaults them', async () => {
      const api = createApi(schema, getAuth as any);
      const ormCreatedAt = new Date('2026-03-06T18:42:31.000Z');
      const ormUpdatedAt = new Date('2026-03-06T18:42:31.500Z');
      const store = new Map<string, any>();
      const ormInsert = mock((_table: any) => ({
        values: (_data: Record<string, unknown>) => ({
          returning: async () => {
            const id = `user-${store.size + 1}`;
            const doc = {
              _creationTime: ormCreatedAt.getTime() + 17,
              _id: id,
              createdAt: ormCreatedAt,
              email: 'd@site.com',
              name: 'dave',
              updatedAt: ormUpdatedAt,
            };
            store.set(id, doc);
            return [doc];
          },
        }),
      }));

      const ctx = {
        db: {
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
          get: async (id: string) => store.get(id) ?? null,
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
        },
        orm: {
          delete: mock(() => ({
            where: async () => undefined,
          })),
          insert: ormInsert,
          update: mock(() => ({
            set: () => ({
              where: async () => [],
            }),
          })),
        },
        runMutation: mock(async () => undefined),
      };

      const created = await (api.create as any)._handler(ctx, {
        input: {
          data: {
            email: 'd@site.com',
            name: 'dave',
          },
          model: 'user',
        },
      });

      expect(ormInsert).toHaveBeenCalledTimes(1);
      expect(created).toMatchObject({
        createdAt: ormCreatedAt.getTime(),
        email: 'd@site.com',
        name: 'dave',
        updatedAt: ormUpdatedAt.getTime(),
      });
      expect(Array.from(store.values())[0]).toMatchObject({
        createdAt: ormCreatedAt,
        email: 'd@site.com',
        name: 'dave',
        updatedAt: ormUpdatedAt,
      });
    });

    test('create normalizes ORM docs for create.after hooks and serializes Date values', async () => {
      const after = mock(async () => undefined);
      const change = mock(async () => undefined);
      const api = createApi(schema, getAuth as any, {
        triggers: {
          user: {
            change,
            create: {
              after,
            },
          },
        } as any,
      });
      const createdAt = new Date('2026-02-14T12:36:05.293Z');
      const updatedAt = new Date('2026-02-14T12:36:05.168Z');
      const expiresAt = new Date('2026-02-14T12:46:05.168Z');

      const ctx = {
        db: {
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
          get: async () => null,
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
        },
        orm: {
          delete: mock(() => ({
            where: async () => undefined,
          })),
          insert: mock(() => ({
            values: () => ({
              returning: async () => [
                {
                  createdAt,
                  email: 'c@site.com',
                  expiresAt,
                  id: 'user-1',
                  name: 'carol',
                  updatedAt,
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
        },
      };

      await (api.create as any)._handler(ctx, {
        input: {
          data: { email: 'c@site.com', name: 'carol' },
          model: 'user',
        },
      });

      expect(after).toHaveBeenCalledWith(
        {
          _id: 'user-1',
          createdAt: createdAt.getTime(),
          email: 'c@site.com',
          expiresAt: expiresAt.getTime(),
          id: 'user-1',
          name: 'carol',
          updatedAt: updatedAt.getTime(),
        },
        ctx
      );
      expect(change).toHaveBeenCalledWith(
        {
          id: 'user-1',
          newDoc: {
            _id: 'user-1',
            createdAt: createdAt.getTime(),
            email: 'c@site.com',
            expiresAt: expiresAt.getTime(),
            id: 'user-1',
            name: 'carol',
            updatedAt: updatedAt.getTime(),
          },
          oldDoc: null,
          operation: 'insert',
        },
        ctx
      );
    });

    test('create returns normalized ORM docs with _id when ORM returns only id', async () => {
      const api = createApi(schema, getAuth as any);
      const ctx = {
        db: {
          delete: mock(async () => {
            throw new Error('db.delete should not be called when orm exists');
          }),
          get: async () => null,
          insert: mock(async () => {
            throw new Error('db.insert should not be called when orm exists');
          }),
          patch: mock(async () => {
            throw new Error('db.patch should not be called when orm exists');
          }),
        },
        orm: {
          delete: mock(() => ({
            where: async () => undefined,
          })),
          insert: mock(() => ({
            values: () => ({
              returning: async () => [
                { email: 'c@site.com', id: 'user-1', name: 'carol' },
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
        },
        runMutation: mock(async () => undefined),
      };

      const created = await (api.create as any)._handler(ctx, {
        input: {
          data: { email: 'c@site.com', name: 'carol' },
          model: 'user',
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
          delete: dbDelete,
          get: async (id: string) => store.get(id) ?? null,
          insert: dbInsert,
          patch: dbPatch,
        },
        runMutation: mock(async () => undefined),
      };

      await (api.create as any)._handler(ctx, {
        input: { data: { email: 'b@site.com', name: 'bob' }, model: 'user' },
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

    test('create normalizes non-ORM docs for create.after hooks', async () => {
      const after = mock(async () => undefined);
      const change = mock(async () => undefined);
      const api = createApi(schema, getAuth as any, {
        triggers: {
          user: {
            change,
            create: {
              after,
            },
          },
        } as any,
      });

      const ctx = {
        db: {
          delete: mock(async () => undefined),
          get: async (id: string) => ({
            _id: id,
            email: 'c@site.com',
            name: 'carol',
          }),
          insert: mock(async () => 'user-1'),
          patch: mock(async () => undefined),
        },
      };

      await (api.create as any)._handler(ctx, {
        input: {
          data: { email: 'c@site.com', name: 'carol' },
          model: 'user',
        },
      });

      expect(after).toHaveBeenCalledWith(
        {
          _id: 'user-1',
          email: 'c@site.com',
          id: 'user-1',
          name: 'carol',
        },
        ctx
      );
      expect(change).toHaveBeenCalledWith(
        {
          id: 'user-1',
          newDoc: {
            _id: 'user-1',
            email: 'c@site.com',
            id: 'user-1',
            name: 'carol',
          },
          oldDoc: null,
          operation: 'insert',
        },
        ctx
      );
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
