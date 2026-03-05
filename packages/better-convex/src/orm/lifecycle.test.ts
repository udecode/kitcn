import type { GenericDatabaseWriter } from 'convex/server';
import { describe, expect, test } from 'vitest';
import { createAggregate } from './aggregate';
import { text } from './builders/text';
import { createOrm } from './create-orm';
import { defineSchema } from './schema';
import { convexTable } from './table';
import { defineTriggers, TriggerCancelledError } from './triggers';

const createWriter = () => {
  const docs = new Map<string, Record<string, unknown>>();
  let counter = 0;

  return {
    docs,
    writer: {
      delete: async (_table: string, id: string) => {
        docs.delete(id);
      },
      get: async (_table: string, id: string) => docs.get(id) ?? null,
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}:${++counter}`;
        docs.set(id, {
          ...value,
          _creationTime: Date.now(),
          _id: id,
        });
        return id;
      },
      normalizeId: (tableName: string, id: string) =>
        id.startsWith(`${tableName}:`) ? id : null,
      patch: async (
        _table: string,
        id: string,
        value: Record<string, unknown>
      ) => {
        const current = docs.get(id);
        if (!current) {
          return;
        }
        docs.set(id, { ...current, ...value });
      },
      query: () => {
        throw new Error('query() is not implemented in this unit test');
      },
      replace: async (
        _table: string,
        id: string,
        value: Record<string, unknown>
      ) => {
        const current = docs.get(id);
        if (!current) {
          return;
        }
        docs.set(id, {
          _creationTime: current._creationTime,
          _id: id,
          ...value,
        });
      },
      system: {},
    },
  };
};

const createUsersSchema = (
  tableName: string,
  columns: Record<string, unknown>,
  hooks: Record<string, unknown>
) => {
  const users = convexTable(tableName, columns as any);
  const triggerConfig = {
    users: hooks as any,
  };
  const schema = defineSchema(
    { users },
    {
      triggers: (relations) => defineTriggers(relations, triggerConfig as any),
    }
  );
  return { users, schema };
};

describe('orm lifecycle hooks', () => {
  test('orm.with(ctx) wraps raw db writes and dispatches operation hooks', async () => {
    const events: string[] = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_test',
      { name: text().notNull() },
      {
        create: {
          after: async (doc: { name: string }) => {
            events.push(`create:${doc.name}`);
          },
        },
        update: {
          after: async (doc: { name: string }) => {
            events.push(`update:${doc.name}`);
          },
        },
        delete: {
          after: async (doc: { name: string }) => {
            events.push(`delete:${doc.name}`);
          },
        },
        change: async (change: { operation: string }) => {
          events.push(`change:${change.operation}`);
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_test', id as any);

    expect(events).toEqual([
      'create:Ada',
      'change:insert',
      'update:Grace',
      'change:update',
      'delete:Grace',
      'change:delete',
    ]);
  });

  test('orm.withoutTriggers bypasses trigger hooks for scoped writes', async () => {
    const events: string[] = [];
    const { users, schema } = createUsersSchema(
      'users_lifecycle_without_triggers_test',
      { name: text().notNull() },
      {
        create: {
          after: async (doc: { name: string }) => {
            events.push(`create:${doc.name}`);
          },
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await ctx.orm.insert(users).values({ name: 'with-triggers' }).returning();
    expect(events).toEqual(['create:with-triggers']);

    await ctx.orm.withoutTriggers(async (ormNoTriggers: typeof ctx.orm) => {
      await ormNoTriggers
        .insert(users)
        .values({ name: 'without-triggers' })
        .returning();
    });

    expect(events).toEqual(['create:with-triggers']);
  });

  test('hook docs include public id alias when storage only exposes _id', async () => {
    const events: Array<{ hook: string; id: unknown; _id: unknown }> = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_public_id_alias_test',
      { name: text().notNull() },
      {
        create: {
          after: async (doc: { id?: string; _id?: string }) => {
            events.push({ hook: 'create', id: doc.id, _id: doc._id });
          },
        },
        update: {
          after: async (doc: { id?: string; _id?: string }) => {
            events.push({ hook: 'update', id: doc.id, _id: doc._id });
          },
        },
        delete: {
          after: async (doc: { id?: string; _id?: string }) => {
            events.push({ hook: 'delete', id: doc.id, _id: doc._id });
          },
        },
        change: async (change: {
          operation: 'insert' | 'update' | 'delete';
          oldDoc: { id?: string; _id?: string } | null;
          newDoc: { id?: string; _id?: string } | null;
        }) => {
          if (change.operation === 'delete') {
            events.push({
              hook: 'change:delete',
              id: change.oldDoc?.id,
              _id: change.oldDoc?._id,
            });
            return;
          }
          events.push({
            hook: `change:${change.operation}`,
            id: change.newDoc?.id,
            _id: change.newDoc?._id,
          });
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_public_id_alias_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_public_id_alias_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_public_id_alias_test', id as any);

    expect(events).toEqual([
      { hook: 'create', id, _id: id },
      { hook: 'change:insert', id, _id: id },
      { hook: 'update', id, _id: id },
      { hook: 'change:update', id, _id: id },
      { hook: 'delete', id, _id: id },
      { hook: 'change:delete', id, _id: id },
    ]);
  });

  test('orm.db(ctx) runs hooks for ORM writes and forwards ctx.orm', async () => {
    let seenOrm = false;
    const events: string[] = [];

    const { users, schema } = createUsersSchema(
      'users_lifecycle_orm_write_test',
      { name: text().notNull() },
      {
        create: {
          after: async (
            doc: { name: string },
            ctx: Record<string, unknown>
          ) => {
            seenOrm = !!ctx.orm;
            events.push(`create:${doc.name}`);
          },
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const db = orm.db(writer as unknown as GenericDatabaseWriter<any>);

    await db
      .insert(users)
      .values({ name: 'Ada' } as any)
      .execute();

    expect(events).toEqual(['create:Ada']);
    expect(seenOrm).toBe(true);
  });

  test('ctx.orm writes inside hooks do not deadlock', async () => {
    const events: string[] = [];

    const { users, schema } = createUsersSchema(
      'users_lifecycle_ctx_orm_nested_write_test',
      { name: text().notNull() },
      {
        create: {
          after: async (
            doc: { id: string; name: string },
            ctx: Record<string, unknown>
          ) => {
            events.push(`create:${doc.name}`);
            if (doc.name !== 'Ada') {
              return;
            }
            await (ctx.orm as any).insert(users).values({
              name: 'Grace',
            });
          },
        },
      }
    );

    const orm = createOrm({ schema });
    const { docs, writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await ctx.db.insert('users_lifecycle_ctx_orm_nested_write_test', {
      name: 'Ada',
    } as any);

    expect(events).toEqual(['create:Ada', 'create:Grace']);
    expect(docs.size).toBe(2);
  });

  test('create.before can merge insert payload', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_before_create_merge_test',
      {
        name: text().notNull(),
        email: text(),
      },
      {
        create: {
          before: async (data: { name: string; email?: string }) => ({
            data: {
              name: data.name.trim(),
              email: 'trimmed@example.com',
            },
          }),
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_before_create_merge_test', {
      name: '  Ada  ',
    } as any);
    const inserted = await writer.get(
      'users_lifecycle_before_create_merge_test',
      id as any
    );

    expect(inserted).toMatchObject({
      _id: id,
      name: 'Ada',
      email: 'trimmed@example.com',
    });
  });

  test('update.before can merge patch payload', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_before_update_merge_test',
      {
        name: text().notNull(),
        touched: text(),
      },
      {
        update: {
          before: async (data: { name?: string; touched?: string }) => ({
            data: {
              name: data.name?.toUpperCase(),
              touched: 'yes',
            },
          }),
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_before_update_merge_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_before_update_merge_test',
      id as any,
      { name: 'grace' } as any
    );
    const updated = await writer.get(
      'users_lifecycle_before_update_merge_test',
      id as any
    );

    expect(updated).toMatchObject({
      _id: id,
      name: 'GRACE',
      touched: 'yes',
    });
  });

  test('create.before can cancel writes by returning false', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_before_create_cancel_test',
      { name: text().notNull() },
      {
        create: {
          before: async () => false,
        },
      }
    );

    const orm = createOrm({ schema });
    const { docs, writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await expect(
      ctx.db.insert('users_lifecycle_before_create_cancel_test', {
        name: 'Ada',
      } as any)
    ).rejects.toBeInstanceOf(TriggerCancelledError);
    expect(docs.size).toBe(0);
  });

  test('update.before can cancel writes by returning false', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_before_update_cancel_test',
      { name: text().notNull() },
      {
        update: {
          before: async () => false,
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert(
      'users_lifecycle_before_update_cancel_test',
      {
        name: 'Ada',
      } as any
    );

    await expect(
      ctx.db.patch(
        'users_lifecycle_before_update_cancel_test',
        id as any,
        { name: 'Grace' } as any
      )
    ).rejects.toBeInstanceOf(TriggerCancelledError);

    const doc = await writer.get(
      'users_lifecycle_before_update_cancel_test',
      id as any
    );
    expect(doc).toMatchObject({ _id: id, name: 'Ada' });
  });

  test('delete.before can cancel writes by returning false', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_before_delete_cancel_test',
      { name: text().notNull() },
      {
        delete: {
          before: async () => false,
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert(
      'users_lifecycle_before_delete_cancel_test',
      {
        name: 'Ada',
      } as any
    );
    await expect(
      ctx.db.delete('users_lifecycle_before_delete_cancel_test', id as any)
    ).rejects.toBeInstanceOf(TriggerCancelledError);

    const doc = await writer.get(
      'users_lifecycle_before_delete_cancel_test',
      id as any
    );
    expect(doc).toMatchObject({ _id: id, name: 'Ada' });
  });

  test('change receives operation-aware payload shape and stable id', async () => {
    const changes: Array<{
      id: unknown;
      operation: 'insert' | 'update' | 'delete';
      oldDoc: any;
      newDoc: any;
    }> = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_change_shape_test',
      { name: text().notNull() },
      {
        change: async (change: any) => {
          changes.push(change);
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_change_shape_test', {
      name: 'Ada',
    } as any);
    await ctx.db.patch(
      'users_lifecycle_change_shape_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete('users_lifecycle_change_shape_test', id as any);

    expect(changes).toHaveLength(3);
    expect(changes[0]).toMatchObject({
      id,
      operation: 'insert',
      oldDoc: null,
      newDoc: { _id: id, name: 'Ada' },
    });
    expect(changes[1]).toMatchObject({
      id,
      operation: 'update',
      oldDoc: { _id: id, name: 'Ada' },
      newDoc: { _id: id, name: 'Grace' },
    });
    expect(changes[2]).toMatchObject({
      id,
      operation: 'delete',
      oldDoc: { _id: id, name: 'Grace' },
      newDoc: null,
    });
  });

  test('wrapped aggregate trigger can be used directly as change hook', async () => {
    const events: string[] = [];

    const aggregate = createAggregate({
      trigger:
        () =>
        async (
          _ctx: { db: unknown },
          change: { operation: 'insert' | 'update' | 'delete' }
        ) => {
          events.push(`aggregate:${change.operation}`);
        },
    });

    const { schema } = createUsersSchema(
      'users_lifecycle_wrapped_aggregate_trigger_test',
      { name: text().notNull() },
      {
        change: aggregate.trigger,
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert(
      'users_lifecycle_wrapped_aggregate_trigger_test',
      {
        name: 'Ada',
      } as any
    );
    await ctx.db.patch(
      'users_lifecycle_wrapped_aggregate_trigger_test',
      id as any,
      { name: 'Grace' } as any
    );
    await ctx.db.delete(
      'users_lifecycle_wrapped_aggregate_trigger_test',
      id as any
    );

    expect(events).toEqual([
      'aggregate:insert',
      'aggregate:update',
      'aggregate:delete',
    ]);
  });

  test('forwards scheduler and custom context fields to hooks', async () => {
    const runAfterCalls: Array<{ delayMs: number; payload: unknown }> = [];
    const scheduler = {
      runAfter: async (
        delayMs: number,
        _functionRef: unknown,
        payload: unknown
      ) => {
        runAfterCalls.push({ delayMs, payload });
      },
    };

    const { schema } = createUsersSchema(
      'users_lifecycle_scheduler_test',
      {
        name: text().notNull(),
      },
      {
        create: {
          after: async (doc: { _id: string }, ctx: Record<string, unknown>) => {
            expect(ctx.requestId).toBe('req-1');
            await (ctx.scheduler as any).runAfter(
              0,
              'internal.user.sendWelcomeEmail',
              {
                userId: doc._id,
              }
            );
          },
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer, requestId: 'req-1', scheduler } as any);

    const id = await ctx.db.insert('users_lifecycle_scheduler_test', {
      name: 'Ada',
    } as any);

    expect(runAfterCalls).toEqual([
      {
        delayMs: 0,
        payload: { userId: id },
      },
    ]);
  });

  test('raw db writes do not run hooks without orm.with(ctx)', async () => {
    const events: string[] = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_unwrapped_test',
      {
        name: text().notNull(),
      },
      {
        create: {
          after: async (doc: { name: string }) => {
            events.push(`create:${doc.name}`);
          },
        },
      }
    );

    createOrm({ schema });
    const { writer } = createWriter();
    await writer.insert('users_lifecycle_unwrapped_test', {
      name: 'Ada',
    } as any);

    expect(events).toEqual([]);
  });

  test('hook errors propagate to caller', async () => {
    const { schema } = createUsersSchema(
      'users_lifecycle_validation_test',
      {
        email: text().notNull(),
      },
      {
        create: {
          before: async (data: { email: string }) => {
            if (!data.email.includes('@')) {
              throw new Error(`Invalid email: ${data.email}`);
            }
          },
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await expect(
      ctx.db.insert('users_lifecycle_validation_test', {
        email: 'invalid-email',
      } as any)
    ).rejects.toThrow('Invalid email: invalid-email');
  });

  test('innerDb is available for direct writes without recursive hook dispatch', async () => {
    const events: string[] = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_innerdb_test',
      {
        name: text().notNull(),
        touched: text(),
      },
      {
        create: {
          after: async (doc: { _id: string }, ctx: Record<string, unknown>) => {
            events.push('create');
            await (ctx.innerDb as any).patch(
              'users_lifecycle_innerdb_test',
              doc._id,
              {
                touched: 'yes',
              }
            );
          },
        },
        update: {
          after: async () => {
            events.push('update');
          },
        },
        change: async (change: { operation: string }) => {
          events.push(`change:${change.operation}`);
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    const id = await ctx.db.insert('users_lifecycle_innerdb_test', {
      name: 'Ada',
    } as any);
    const doc = await writer.get('users_lifecycle_innerdb_test', id as any);

    expect(doc).toMatchObject({ _id: id, name: 'Ada', touched: 'yes' });
    expect(events).toEqual(['create', 'change:insert']);
  });

  test('hooks can enqueue recursive writes with stable queue order', async () => {
    const events: string[] = [];

    const { schema } = createUsersSchema(
      'users_lifecycle_recursive_test',
      {
        name: text().notNull(),
      },
      {
        create: {
          after: async (
            doc: { _id: string; name: string },
            ctx: Record<string, unknown>
          ) => {
            events.push(`create:${doc.name}`);
            await (ctx.db as any).patch(
              'users_lifecycle_recursive_test',
              doc._id,
              {
                name: 'Grace',
              }
            );
          },
        },
        update: {
          after: async (doc: { name: string }) => {
            events.push(`update:${doc.name}`);
          },
        },
        change: async (change: any) => {
          events.push(`change:${change.operation}`);
        },
      }
    );

    const orm = createOrm({ schema });
    const { writer } = createWriter();
    const ctx = orm.with({ db: writer } as any);

    await ctx.db.insert('users_lifecycle_recursive_test', {
      name: 'Ada',
    } as any);

    expect(events).toEqual([
      'create:Ada',
      'change:insert',
      'update:Grace',
      'change:update',
    ]);
  });
});
