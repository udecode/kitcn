/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { makeFunctionReference } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as metaUtils from '../shared/meta-utils';
import { createCRPCOptionsProxy } from './proxy';
import * as queryOptionsModule from './use-query-options';

describe('proxy (solid)', () => {
  let getFuncRefSpy: ReturnType<typeof vi.spyOn>;
  let getFunctionTypeSpy: ReturnType<typeof vi.spyOn>;
  let useConvexQueryOptionsSpy: ReturnType<typeof vi.spyOn>;
  let useConvexActionQueryOptionsSpy: ReturnType<typeof vi.spyOn>;
  let useConvexMutationOptionsSpy: ReturnType<typeof vi.spyOn>;
  let useConvexActionOptionsSpy: ReturnType<typeof vi.spyOn>;

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

  beforeEach(() => {
    getFuncRefSpy = vi.spyOn(metaUtils, 'getFuncRef');
    getFunctionTypeSpy = vi.spyOn(metaUtils, 'getFunctionType');

    useConvexQueryOptionsSpy = vi
      .spyOn(queryOptionsModule, 'useConvexQueryOptions')
      .mockReturnValue({ queryKey: ['convexQuery', 'todos:list', {}] } as any);
    useConvexActionQueryOptionsSpy = vi
      .spyOn(queryOptionsModule, 'useConvexActionQueryOptions')
      .mockReturnValue({
        queryKey: ['convexAction', 'ai:generate', {}],
      } as any);
    useConvexMutationOptionsSpy = vi
      .spyOn(queryOptionsModule, 'useConvexMutationOptions')
      .mockReturnValue({ mutationFn: vi.fn() } as any);
    useConvexActionOptionsSpy = vi
      .spyOn(queryOptionsModule, 'useConvexActionOptions')
      .mockReturnValue({ mutationFn: vi.fn() } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createCRPCOptionsProxy returns a proxy object', () => {
    const proxy = createCRPCOptionsProxy({} as any, meta);
    expect(proxy).toBeDefined();
    expect(typeof proxy).toBe('function');
  });

  test('.queryOptions() calls useConvexQueryOptions for queries', () => {
    getFuncRefSpy.mockReturnValue(queryRef);
    getFunctionTypeSpy.mockReturnValue('query');

    const proxy = createCRPCOptionsProxy(
      { todos: { list: queryRef } } as any,
      meta
    );
    (proxy as any).todos.list.queryOptions({ status: 'open' });

    expect(useConvexQueryOptionsSpy).toHaveBeenCalledTimes(1);
    expect(useConvexQueryOptionsSpy.mock.calls[0]?.[0]).toBe(queryRef);
  });

  test('.queryOptions() calls useConvexActionQueryOptions for actions', () => {
    getFuncRefSpy.mockReturnValue(actionRef);
    getFunctionTypeSpy.mockReturnValue('action');

    const proxy = createCRPCOptionsProxy(
      { ai: { generate: actionRef } } as any,
      meta
    );
    (proxy as any).ai.generate.queryOptions({ prompt: 'hi' });

    expect(useConvexActionQueryOptionsSpy).toHaveBeenCalledTimes(1);
    expect(useConvexActionQueryOptionsSpy.mock.calls[0]?.[0]).toBe(actionRef);
  });

  test('.mutationOptions() calls useConvexMutationOptions for mutations', () => {
    getFuncRefSpy.mockReturnValue(mutationRef);
    getFunctionTypeSpy.mockReturnValue('mutation');

    const proxy = createCRPCOptionsProxy(
      { todos: { create: mutationRef } } as any,
      meta
    );
    (proxy as any).todos.create.mutationOptions();

    expect(useConvexMutationOptionsSpy).toHaveBeenCalledTimes(1);
    expect(useConvexMutationOptionsSpy.mock.calls[0]?.[0]).toBe(mutationRef);
  });

  test('.mutationOptions() calls useConvexActionOptions for actions', () => {
    getFuncRefSpy.mockReturnValue(actionRef);
    getFunctionTypeSpy.mockReturnValue('action');

    const proxy = createCRPCOptionsProxy(
      { ai: { generate: actionRef } } as any,
      meta
    );
    (proxy as any).ai.generate.mutationOptions();

    expect(useConvexActionOptionsSpy).toHaveBeenCalledTimes(1);
    expect(useConvexActionOptionsSpy.mock.calls[0]?.[0]).toBe(actionRef);
  });

  test('.queryKey() returns correct key format', () => {
    getFuncRefSpy.mockReturnValue(queryRef);
    getFunctionTypeSpy.mockReturnValue('query');

    const proxy = createCRPCOptionsProxy(
      { todos: { list: queryRef } } as any,
      meta
    );
    const key = (proxy as any).todos.list.queryKey({ status: 'open' });

    expect(key).toEqual(['convexQuery', 'todos:list', { status: 'open' }]);
  });

  test('.mutationKey() returns correct key format', () => {
    getFuncRefSpy.mockReturnValue(mutationRef);
    getFunctionTypeSpy.mockReturnValue('mutation');

    const proxy = createCRPCOptionsProxy(
      { todos: { create: mutationRef } } as any,
      meta
    );
    const key = (proxy as any).todos.create.mutationKey();

    expect(key).toEqual(['convexMutation', 'todos:create']);
  });
});
