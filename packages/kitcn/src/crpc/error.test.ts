import {
  CRPCClientError,
  defaultIsUnauthorized,
  isCRPCClientError,
  isCRPCError,
  isCRPCErrorCode,
} from './error';

describe('CRPCClientError', () => {
  test('sets default message and metadata fields', () => {
    const error = new CRPCClientError({
      code: 'UNAUTHORIZED',
      functionName: 'todos:list',
    });

    expect(error.name).toBe('CRPCClientError');
    expect(error.message).toBe('UNAUTHORIZED: todos:list');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.functionName).toBe('todos:list');
  });

  test('supports custom message override', () => {
    const error = new CRPCClientError({
      code: 'FORBIDDEN',
      functionName: 'todos:create',
      message: 'Access denied',
    });

    expect(error.message).toBe('Access denied');
  });
});

describe('CRPC error guards', () => {
  test('isCRPCClientError narrows CRPCClientError instances', () => {
    const error = new CRPCClientError({
      code: 'NOT_FOUND',
      functionName: 'todos:get',
    });

    expect(isCRPCClientError(error)).toBe(true);
    expect(isCRPCClientError(new Error('x'))).toBe(false);
    expect(isCRPCClientError(null)).toBe(false);
  });

  test('isCRPCError detects deterministic CRPC and 4xx HttpClientError-like values', () => {
    const crpcError = new CRPCClientError({
      code: 'BAD_REQUEST',
      functionName: 'todos:list',
    });
    expect(isCRPCError(crpcError)).toBe(true);

    const httpClientError = Object.assign(new Error('Not found'), {
      name: 'HttpClientError',
      status: 404,
    });
    expect(isCRPCError(httpClientError)).toBe(true);

    const httpServerError = Object.assign(new Error('Down'), {
      name: 'HttpClientError',
      status: 503,
    });
    expect(isCRPCError(httpServerError)).toBe(false);
  });

  test('isCRPCErrorCode matches only the requested error code', () => {
    const unauthorized = new CRPCClientError({
      code: 'UNAUTHORIZED',
      functionName: 'todos:list',
    });

    expect(isCRPCErrorCode(unauthorized, 'UNAUTHORIZED')).toBe(true);
    expect(isCRPCErrorCode(unauthorized, 'FORBIDDEN')).toBe(false);
    expect(isCRPCErrorCode(new Error('x'), 'UNAUTHORIZED')).toBe(false);
  });
});

describe('defaultIsUnauthorized', () => {
  test('detects unauthorized from both data.code and direct code shapes', () => {
    expect(defaultIsUnauthorized({ data: { code: 'UNAUTHORIZED' } })).toBe(
      true
    );
    expect(defaultIsUnauthorized({ code: 'UNAUTHORIZED' })).toBe(true);
  });

  test('returns false for non-unauthorized or invalid values', () => {
    expect(defaultIsUnauthorized({ data: { code: 'FORBIDDEN' } })).toBe(false);
    expect(defaultIsUnauthorized({ code: 'FORBIDDEN' })).toBe(false);
    expect(defaultIsUnauthorized(null)).toBe(false);
    expect(defaultIsUnauthorized('UNAUTHORIZED')).toBe(false);
  });
});
