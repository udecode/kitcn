import { HttpClientError, isHttpClientError } from './http-types';

describe('HttpClientError', () => {
  test('builds default message from code and procedure name', () => {
    const error = new HttpClientError({
      code: 'NOT_FOUND',
      status: 404,
      procedureName: 'todos.get',
    });

    expect(error.name).toBe('HttpClientError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
    expect(error.procedureName).toBe('todos.get');
    expect(error.message).toBe('NOT_FOUND: todos.get');
  });

  test('supports a custom message', () => {
    const error = new HttpClientError({
      code: 'UNAUTHORIZED',
      status: 401,
      procedureName: 'todos.list',
      message: 'Please sign in',
    });

    expect(error.message).toBe('Please sign in');
  });
});

describe('isHttpClientError', () => {
  test('narrowly detects HttpClientError instances', () => {
    const error = new HttpClientError({
      code: 'BAD_REQUEST',
      status: 400,
      procedureName: 'todos.create',
    });

    expect(isHttpClientError(error)).toBe(true);
    expect(isHttpClientError(new Error('x'))).toBe(false);
    expect(isHttpClientError(undefined)).toBe(false);
  });
});
