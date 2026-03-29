import { useSafeConvexAuth } from './auth-store';
import * as reactExports from './index';

describe('react public exports', () => {
  test('re-exports stable public API entrypoints', () => {
    expect(typeof reactExports.createCRPCContext).toBe('function');
    expect(typeof reactExports.createCRPCOptionsProxy).toBe('function');
    expect(typeof reactExports.createVanillaCRPCProxy).toBe('function');
    expect(typeof reactExports.ConvexQueryClient).toBe('function');
    expect(typeof reactExports.getQueryClientSingleton).toBe('function');
    expect(typeof reactExports.getConvexQueryClientSingleton).toBe('function');
    expect(reactExports.useConvexAuth).toBe(useSafeConvexAuth);
  });
});
