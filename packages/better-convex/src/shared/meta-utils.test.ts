import type { FunctionReference } from 'convex/server';
import {
  buildMetaIndex,
  getFuncRef,
  getFunctionMeta,
  getFunctionType,
  getHttpRoutes,
  isValidConvexFile,
} from './meta-utils';

const asRef = (
  value: Record<string, unknown>
): FunctionReference<'query' | 'mutation' | 'action'> =>
  value as unknown as FunctionReference<'query' | 'mutation' | 'action'>;

describe('buildMetaIndex', () => {
  it('indexes merged api leaves and http routes', () => {
    const listRef = asRef({ ref: 'todos:list' });
    const createRef = asRef({ ref: 'todos:create' });

    const api = {
      todos: {
        list: Object.assign(listRef, {
          type: 'query',
          auth: 'optional',
          functionRef: listRef,
        }),
        create: Object.assign(createRef, {
          type: 'mutation',
          auth: 'required',
          role: 'admin',
          functionRef: createRef,
        }),
      },
      _http: {
        'todos.list': { path: '/api/todos', method: 'GET' },
      },
    } as const;

    const meta = buildMetaIndex(api as unknown as Record<string, unknown>);

    expect(meta.todos?.list).toEqual({
      type: 'query',
      auth: 'optional',
    });
    expect(meta.todos?.create).toEqual({
      type: 'mutation',
      auth: 'required',
      role: 'admin',
    });
    expect(meta._http).toEqual({
      'todos.list': { path: '/api/todos', method: 'GET' },
    });
  });
});

describe('getFunctionType/getFunctionMeta', () => {
  const api = {
    items: {
      queries: {
        list: { type: 'query', auth: 'optional' },
      },
    },
    todos: {
      create: { type: 'mutation', auth: 'required' },
    },
  } as const;

  it('resolves function type from merged api object', () => {
    expect(getFunctionType(['items', 'queries', 'list'], api as any)).toBe(
      'query'
    );
    expect(getFunctionType(['todos', 'create'], api as any)).toBe('mutation');
  });

  it('resolves function metadata from merged api object', () => {
    expect(getFunctionMeta(['items', 'queries', 'list'], api as any)).toEqual({
      type: 'query',
      auth: 'optional',
    });
  });

  it('returns query/defaults for unknown paths', () => {
    expect(getFunctionType(['missing', 'fn'], api as any)).toBe('query');
    expect(getFunctionMeta(['missing', 'fn'], api as any)).toBeUndefined();
  });
});

describe('getFuncRef', () => {
  it('returns functionRef when present on merged leaf', () => {
    const functionRef = asRef({ ref: 'posts:list' });
    const api = {
      posts: {
        list: {
          type: 'query',
          functionRef,
        },
      },
    };

    expect(getFuncRef(api as any, ['posts', 'list'])).toBe(functionRef);
  });

  it('falls back to raw function reference leaf', () => {
    const functionRef = asRef({ ref: 'posts:get' });
    const api = {
      posts: {
        get: functionRef,
      },
    };

    expect(getFuncRef(api as any, ['posts', 'get'])).toBe(functionRef);
  });
});

describe('getHttpRoutes', () => {
  it('reads normalized route map from api._http', () => {
    const api = {
      _http: {
        health: { path: '/api/health', method: 'GET' },
      },
    };
    expect(getHttpRoutes(api)).toEqual({
      health: { path: '/api/health', method: 'GET' },
    });
  });
});

describe('isValidConvexFile', () => {
  it('rejects test and typecheck files from codegen scans', () => {
    expect(isValidConvexFile('todos.ts')).toBe(true);
    expect(isValidConvexFile('todos.test.ts')).toBe(false);
    expect(isValidConvexFile('todos.spec.ts')).toBe(false);
    expect(isValidConvexFile('todos.testing.ts')).toBe(false);
    expect(isValidConvexFile('todos.typecheck.ts')).toBe(false);
    expect(isValidConvexFile('nested/users.test.ts')).toBe(false);
  });
});
