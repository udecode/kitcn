import { describe, expect, test } from 'vitest';
import * as solidExports from './index';

describe('solid public exports', () => {
  test('re-exports stable public API entrypoints', () => {
    expect(typeof solidExports.createCRPCContext).toBe('function');
    expect(typeof solidExports.createCRPCOptionsProxy).toBe('function');
    expect(typeof solidExports.createVanillaCRPCProxy).toBe('function');
    expect(typeof solidExports.ConvexQueryClient).toBe('function');
    expect(typeof solidExports.getQueryClientSingleton).toBe('function');
    expect(typeof solidExports.getConvexQueryClientSingleton).toBe('function');
    expect(typeof solidExports.useConvexAuth).toBe('function');
    expect(typeof solidExports.useSafeConvexAuth).toBe('function');
    expect(typeof solidExports.createHttpProxy).toBe('function');
  });
});
