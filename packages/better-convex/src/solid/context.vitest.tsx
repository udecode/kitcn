/** @jsxImportSource solid-js */
/** biome-ignore-all lint/suspicious/noExplicitAny: testing */

import { renderHook } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as metaUtilsModule from '../shared/meta-utils';
import { createCRPCContext } from './context';
import * as proxyModule from './proxy';
import * as vanillaClientModule from './vanilla-client';

describe('context (solid)', () => {
  let _buildMetaIndexSpy: ReturnType<typeof vi.spyOn>;
  let _createCRPCOptionsProxySpy: ReturnType<typeof vi.spyOn>;
  let _createVanillaCRPCProxySpy: ReturnType<typeof vi.spyOn>;

  const mockProxy = { user: { get: { queryOptions: vi.fn() } } };
  const mockVanillaClient = { user: { get: { query: vi.fn() } } };
  const mockMeta = { users: { get: { type: 'query' } } };

  beforeEach(() => {
    _buildMetaIndexSpy = vi
      .spyOn(metaUtilsModule, 'buildMetaIndex')
      .mockReturnValue(mockMeta as any);
    _createCRPCOptionsProxySpy = vi
      .spyOn(proxyModule, 'createCRPCOptionsProxy')
      .mockReturnValue(mockProxy as any);
    _createVanillaCRPCProxySpy = vi
      .spyOn(vanillaClientModule, 'createVanillaCRPCProxy')
      .mockReturnValue(mockVanillaClient as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('createCRPCContext returns CRPCProvider, useCRPC, useCRPCClient', () => {
    const result = createCRPCContext({ api: {} as any });
    expect(result).toHaveProperty('CRPCProvider');
    expect(result).toHaveProperty('useCRPC');
    expect(result).toHaveProperty('useCRPCClient');
    expect(typeof result.CRPCProvider).toBe('function');
    expect(typeof result.useCRPC).toBe('function');
    expect(typeof result.useCRPCClient).toBe('function');
  });

  test('useCRPC throws outside provider', () => {
    const { useCRPC } = createCRPCContext({ api: {} as any });

    expect(() => {
      renderHook(() => useCRPC());
    }).toThrow('useCRPC must be used within CRPCProvider');
  });

  test('useCRPCClient throws outside provider', () => {
    const { useCRPCClient } = createCRPCContext({ api: {} as any });

    expect(() => {
      renderHook(() => useCRPCClient());
    }).toThrow('useCRPCClient must be used within CRPCProvider');
  });

  test('useCRPC returns proxy inside provider', () => {
    const { CRPCProvider, useCRPC } = createCRPCContext({ api: {} as any });

    const mockConvexClient = {} as any;
    const mockConvexQueryClient = {} as any;

    const { result } = renderHook(() => useCRPC(), {
      wrapper: (props: any) => (
        <CRPCProvider
          convexClient={mockConvexClient}
          convexQueryClient={mockConvexQueryClient}
        >
          {props.children}
        </CRPCProvider>
      ),
    });

    expect(result).toBe(mockProxy);
  });

  test('useCRPCClient returns vanilla client inside provider', () => {
    const { CRPCProvider, useCRPCClient } = createCRPCContext({
      api: {} as any,
    });

    const mockConvexClient = {} as any;
    const mockConvexQueryClient = {} as any;

    const { result } = renderHook(() => useCRPCClient(), {
      wrapper: (props: any) => (
        <CRPCProvider
          convexClient={mockConvexClient}
          convexQueryClient={mockConvexQueryClient}
        >
          {props.children}
        </CRPCProvider>
      ),
    });

    expect(result).toBe(mockVanillaClient);
  });
});
