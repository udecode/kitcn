import {
  CRPCError,
  getCRPCErrorFromUnknown,
  getHTTPStatusCodeFromError,
  isCRPCError,
  toCRPCError,
} from './error';

describe('server/error', () => {
  test('CRPCError sets code/data/message and preserves cause when provided', () => {
    const cause = new Error('original');
    const err = new CRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid input',
      cause,
    });

    expect(err.name).toBe('CRPCError');
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.data).toEqual({ code: 'BAD_REQUEST', message: 'Invalid input' });
    expect(err.message).toBe('Invalid input');
    expect(err.cause).toBe(cause);
  });

  test('CRPCError falls back to cause.message when message is omitted', () => {
    const err = new CRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      cause: new Error('boom'),
    });

    expect(err.data.message).toBe('boom');
    expect(err.message).toBe('boom');
  });

  test('CRPCError falls back to code when message and cause are missing', () => {
    const err = new CRPCError({ code: 'UNAUTHORIZED' });
    expect(err.data.message).toBe('UNAUTHORIZED');
    expect(err.message).toBe('UNAUTHORIZED');
  });

  test('getCRPCErrorFromUnknown wraps unknowns and preserves stack when possible', () => {
    const cause = new Error('nope');
    cause.stack = 'STACK';
    const err = getCRPCErrorFromUnknown(cause);

    expect(err).toBeInstanceOf(CRPCError);
    expect(err.code).toBe('INTERNAL_SERVER_ERROR');
    expect(err.cause?.message).toBe('nope');
    expect(err.stack).toBe('STACK');
  });

  test('toCRPCError maps OrmNotFoundError-like errors to NOT_FOUND', () => {
    const cause = new Error('User not found');
    cause.name = 'OrmNotFoundError';
    const err = toCRPCError(cause);

    expect(err).toBeInstanceOf(CRPCError);
    expect(err?.code).toBe('NOT_FOUND');
    expect(err?.message).toBe('User not found');
  });

  test('toCRPCError maps APIError-like errors to CRPCError', () => {
    class FakeAPIError extends Error {
      status = 'UNAUTHORIZED';
      statusCode = 401;
      body = { message: 'Nope' };
      constructor() {
        super('Nope');
        this.name = 'APIError';
      }
    }

    const err = toCRPCError(new FakeAPIError());

    expect(err).toBeInstanceOf(CRPCError);
    expect(err?.code).toBe('UNAUTHORIZED');
    expect(err?.message).toBe('Nope');
  });

  test('toCRPCError returns null for unhandled errors', () => {
    expect(toCRPCError(new Error('x'))).toBeNull();
  });

  test('getHTTPStatusCodeFromError maps codes to HTTP status', () => {
    expect(
      getHTTPStatusCodeFromError(new CRPCError({ code: 'NOT_FOUND' }))
    ).toBe(404);
    expect(
      getHTTPStatusCodeFromError(new CRPCError({ code: 'TOO_MANY_REQUESTS' }))
    ).toBe(429);
    expect(
      getHTTPStatusCodeFromError(
        new CRPCError({ code: 'INTERNAL_SERVER_ERROR' })
      )
    ).toBe(500);
  });

  test('isCRPCError is a narrow instance check', () => {
    expect(isCRPCError(new CRPCError({ code: 'BAD_REQUEST' }))).toBe(true);
    expect(isCRPCError(new Error('x'))).toBe(false);
    expect(isCRPCError({ code: 'BAD_REQUEST' })).toBe(false);
  });
});
