import * as auth from './index';

describe('auth public exports', () => {
  test('exports expected auth module surfaces', () => {
    expect(typeof auth.createClient).toBe('function');
    expect(typeof auth.getAuthUserIdentity).toBe('function');
    expect(typeof auth.getAuthUserId).toBe('function');
    expect(typeof auth.getSession).toBe('function');
    expect(typeof auth.getHeaders).toBe('function');
    expect(typeof auth.dbAdapter).toBe('function');
    expect(typeof auth.httpAdapter).toBe('function');
    expect(typeof auth.convex).toBe('function');
    expect(typeof auth.defineAuth).toBe('function');
    expect(typeof auth.createAuthRuntime).toBe('function');
    expect(typeof auth.createDisabledAuthRuntime).toBe('function');
  });
});
