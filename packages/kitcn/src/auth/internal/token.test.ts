import { isTokenExpired, resolveConvexTokenPath } from './token-utils';

describe('auth/internal/token', () => {
  test('builds the token endpoint from the configured basePath', async () => {
    expect(resolveConvexTokenPath()).toBe('/api/auth/convex/token');
    expect(resolveConvexTokenPath('/custom-auth')).toBe(
      '/custom-auth/convex/token'
    );
    expect(resolveConvexTokenPath('/custom-auth/')).toBe(
      '/custom-auth/convex/token'
    );
  });

  test('treats tokens inside the tolerance window as expired', async () => {
    expect(isTokenExpired(130, 60, 100)).toBe(true);
    expect(isTokenExpired(161, 60, 100)).toBe(false);
    expect(isTokenExpired(undefined, 60, 100)).toBe(true);
  });
});
