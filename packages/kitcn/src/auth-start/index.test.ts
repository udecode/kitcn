import * as authStart from './index';

describe('auth/start public exports', () => {
  test('re-exports the react-start helper surface', () => {
    expect(typeof authStart.convexBetterAuthReactStart).toBe('function');
  });
});
