import { describe, expect, test } from 'vitest';
import { createAggregate } from './index';

describe('aggregate entrypoint', () => {
  test('createAggregate(component, options) creates an ORM-compatible table aggregate', async () => {
    const runMutationCalls: unknown[][] = [];

    const aggregate = createAggregate(
      {
        btree: {},
        public: {
          clear: Symbol('clear'),
          delete_: Symbol('delete'),
          deleteIfExists: Symbol('deleteIfExists'),
          insert: Symbol('insert'),
          insertIfDoesNotExist: Symbol('insertIfDoesNotExist'),
          makeRootLazy: Symbol('makeRootLazy'),
          replace: Symbol('replace'),
          replaceOrInsert: Symbol('replaceOrInsert'),
        },
      } as any,
      { sortKey: () => null } as any
    );

    const handler = aggregate.trigger();
    await handler(
      {
        runMutation: async (...args: unknown[]) => {
          runMutationCalls.push(args);
        },
      } as any,
      {
        id: 'user_1',
        newDoc: { _id: 'user_1' },
        oldDoc: null,
        operation: 'insert',
      } as any
    );

    expect(runMutationCalls).toHaveLength(1);
    expect(runMutationCalls[0][0]).toBeDefined();
  });

  test('createAggregate(aggregate) keeps trigger overload behavior', async () => {
    const seen: string[] = [];

    const aggregate = createAggregate({
      trigger: () => async (_ctx: { tag: string }, _change: { id: string }) => {
        seen.push('called');
      },
    });

    await aggregate.trigger({ id: 'a' }, { tag: 'ctx' });

    expect(seen).toEqual(['called']);
  });
});
