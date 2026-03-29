import { describe, expect, test } from 'vitest';
import { createAggregate } from './aggregate';

describe('createAggregate', () => {
  test('trigger() preserves ctx-first handler behavior', async () => {
    const calls: Array<{ change: string; ctx: string }> = [];

    const aggregate = createAggregate({
      trigger:
        () => async (ctx: { requestId: string }, change: { id: string }) => {
          calls.push({ change: change.id, ctx: ctx.requestId });
        },
    });

    const handler = aggregate.trigger();
    await handler({ requestId: 'ctx-1' }, { id: 'change-1' });

    expect(calls).toEqual([{ change: 'change-1', ctx: 'ctx-1' }]);
  });

  test('trigger(change, ctx) swaps args for ORM change handlers', async () => {
    const calls: Array<{ change: string; ctx: string }> = [];

    const aggregate = createAggregate({
      trigger:
        () => async (ctx: { requestId: string }, change: { id: string }) => {
          calls.push({ change: change.id, ctx: ctx.requestId });
        },
    });

    await aggregate.trigger({ id: 'change-2' }, { requestId: 'ctx-2' });

    expect(calls).toEqual([{ change: 'change-2', ctx: 'ctx-2' }]);
  });

  test('invalid trigger invocation throws clear error', () => {
    const aggregate = createAggregate({
      trigger: () => async () => {},
    });

    expect(() =>
      (aggregate.trigger as (...args: unknown[]) => unknown)({})
    ).toThrow(
      'Invalid aggregate.trigger invocation. Use trigger() or trigger(change, ctx).'
    );
  });

  test('double wrap is idempotent', async () => {
    const calls: Array<{ change: string; ctx: string }> = [];
    const source = {
      trigger:
        () => async (ctx: { requestId: string }, change: { id: string }) => {
          calls.push({ change: change.id, ctx: ctx.requestId });
        },
    };

    const wrappedOnce = createAggregate(source);
    const wrappedTwice = createAggregate(
      wrappedOnce as unknown as {
        trigger: () => (
          ctx: { requestId: string },
          change: { id: string }
        ) => Promise<void>;
      }
    );

    expect(wrappedTwice).toBe(wrappedOnce);
    const handler = wrappedTwice.trigger();
    await handler({ requestId: 'ctx-3' }, { id: 'change-3' });

    expect(calls).toEqual([{ change: 'change-3', ctx: 'ctx-3' }]);
  });
});
