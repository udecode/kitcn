import * as authHttp from './index';

describe('auth/http public exports', () => {
  test('exports expected auth HTTP surfaces', () => {
    expect(typeof authHttp.authMiddleware).toBe('function');
    expect(typeof authHttp.registerRoutes).toBe('function');
    expect(typeof authHttp.installAuthHttpPolyfills).toBe('function');
  });
});
