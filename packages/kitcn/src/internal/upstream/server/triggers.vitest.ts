import { describe, expect, test } from 'vitest';
import { Triggers, writerWithTriggers } from './triggers';

describe('Triggers (vendored)', () => {
  test('register + writerWithTriggers runs triggers on insert', async () => {
    const docs = new Map<string, Record<string, unknown>>();
    let counter = 0;

    const innerDb = {
      delete: async (_table: string, id: string) => {
        docs.delete(id);
      },
      get: async (_table: string, id: string) => docs.get(id) ?? null,
      insert: async (_table: string, value: Record<string, unknown>) => {
        const id = `users:${++counter}`;
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
    };

    const triggers = new Triggers<any>();
    triggers.register('users', async (ctx, change) => {
      if (change.operation !== 'insert') {
        return;
      }

      await ctx.db.patch('users', change.id, {
        fullName: `${change.newDoc.firstName} ${change.newDoc.lastName}`,
      });
    });

    const wrapped = writerWithTriggers(
      { db: innerDb } as any,
      innerDb as any,
      triggers as any
    );

    const insertedId = await wrapped.insert(
      'users' as any,
      {
        firstName: 'Ada',
        lastName: 'Lovelace',
        fullName: '',
      } as any
    );
    const created = docs.get(insertedId as string);

    expect(created?.fullName).toBe('Ada Lovelace');
  });
});
