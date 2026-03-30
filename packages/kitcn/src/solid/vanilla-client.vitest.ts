/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { makeFunctionReference } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as metaUtils from '../shared/meta-utils';
import { createVanillaCRPCProxy } from './vanilla-client';

describe('vanilla-client (solid)', () => {
  let getFuncRefSpy: ReturnType<typeof vi.spyOn>;
  let getFunctionTypeSpy: ReturnType<typeof vi.spyOn>;

  const queryRef = makeFunctionReference<'query'>('todos:list');
  const mutationRef = makeFunctionReference<'mutation'>('todos:create');
  const actionRef = makeFunctionReference<'action'>('ai:generate');

  const meta = {
    todos: {
      list: { type: 'query', auth: 'optional' },
      create: { type: 'mutation', auth: 'required' },
    },
    ai: {
      generate: { type: 'action', auth: 'optional' },
    },
  } as any;

  let mockClient: any;

  beforeEach(() => {
    getFuncRefSpy = vi.spyOn(metaUtils, 'getFuncRef');
    getFunctionTypeSpy = vi.spyOn(metaUtils, 'getFunctionType');

    mockClient = {
      query: vi.fn(async () => ({ items: [] })),
      mutation: vi.fn(async () => ({ ok: true })),
      action: vi.fn(async () => ({ result: 'done' })),
      onUpdate: vi.fn(() => ({
        unsubscribe: vi.fn(),
        getCurrentValue: vi.fn(),
      })),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('.query() calls convexClient.query() for queries', async () => {
    getFuncRefSpy.mockReturnValue(queryRef);
    getFunctionTypeSpy.mockReturnValue('query');

    const client = createVanillaCRPCProxy(
      { todos: { list: queryRef } } as any,
      meta,
      mockClient
    );

    await (client as any).todos.list.query({ status: 'open' });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.query.mock.calls[0]?.[0]).toBe(queryRef);
  });

  test('.query() calls convexClient.action() for actions', async () => {
    getFuncRefSpy.mockReturnValue(actionRef);
    getFunctionTypeSpy.mockReturnValue('action');

    const client = createVanillaCRPCProxy(
      { ai: { generate: actionRef } } as any,
      meta,
      mockClient
    );

    await (client as any).ai.generate.query({ prompt: 'hi' });

    expect(mockClient.action).toHaveBeenCalledTimes(1);
    expect(mockClient.action.mock.calls[0]?.[0]).toBe(actionRef);
  });

  test('.mutate() calls convexClient.mutation() for mutations', async () => {
    getFuncRefSpy.mockReturnValue(mutationRef);
    getFunctionTypeSpy.mockReturnValue('mutation');

    const client = createVanillaCRPCProxy(
      { todos: { create: mutationRef } } as any,
      meta,
      mockClient
    );

    await (client as any).todos.create.mutate({ title: 'test' });

    expect(mockClient.mutation).toHaveBeenCalledTimes(1);
    expect(mockClient.mutation.mock.calls[0]?.[0]).toBe(mutationRef);
  });

  test('.mutate() calls convexClient.action() for actions', async () => {
    getFuncRefSpy.mockReturnValue(actionRef);
    getFunctionTypeSpy.mockReturnValue('action');

    const client = createVanillaCRPCProxy(
      { ai: { generate: actionRef } } as any,
      meta,
      mockClient
    );

    await (client as any).ai.generate.mutate({ prompt: 'hi' });

    expect(mockClient.action).toHaveBeenCalledTimes(1);
    expect(mockClient.action.mock.calls[0]?.[0]).toBe(actionRef);
  });

  test('.onUpdate() calls convexClient.onUpdate() with callback', () => {
    getFuncRefSpy.mockReturnValue(queryRef);
    getFunctionTypeSpy.mockReturnValue('query');

    const client = createVanillaCRPCProxy(
      { todos: { list: queryRef } } as any,
      meta,
      mockClient
    );

    const callback = vi.fn();
    (client as any).todos.list.onUpdate({}, callback);

    expect(mockClient.onUpdate).toHaveBeenCalledTimes(1);
    expect(mockClient.onUpdate.mock.calls[0]?.[0]).toBe(queryRef);
  });

  test('transformer serializes args and deserializes results', async () => {
    getFuncRefSpy.mockReturnValue(queryRef);
    getFunctionTypeSpy.mockReturnValue('query');

    const transformer = {
      input: { serialize: vi.fn((v: any) => ({ ...v, _serialized: true })) },
      output: {
        deserialize: vi.fn((v: any) => ({ ...v, _deserialized: true })),
      },
    };

    const client = createVanillaCRPCProxy(
      { todos: { list: queryRef } } as any,
      meta,
      mockClient,
      transformer as any
    );

    const result = await (client as any).todos.list.query({ status: 'open' });

    expect(transformer.input.serialize).toHaveBeenCalledWith({
      status: 'open',
    });
    expect(mockClient.query.mock.calls[0]?.[1]).toEqual({
      status: 'open',
      _serialized: true,
    });
    expect(result).toEqual({ items: [], _deserialized: true });
  });
});
