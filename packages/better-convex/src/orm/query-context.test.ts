import { getByIdWithOrmQueryFallback } from './query-context';

describe('getByIdWithOrmQueryFallback', () => {
  test('uses orm query when available', async () => {
    const ormFindFirst = mock(async (_args: unknown) => ({
      _id: 'orm-doc',
      token: 'orm-token',
    }));
    const dbGet = mock(async (_id: string) => ({
      _id: 'db-doc',
      token: 'db-token',
    }));

    const ctx = {
      db: {
        get: dbGet,
      },
      orm: {
        query: {
          session: {
            findFirst: ormFindFirst,
          },
        },
      },
    };

    const doc = await getByIdWithOrmQueryFallback(
      ctx as any,
      'session',
      'session-id' as any
    );

    expect(doc).toEqual({
      _id: 'orm-doc',
      token: 'orm-token',
    });
    expect(ormFindFirst).toHaveBeenCalledWith({
      where: { id: 'session-id' },
    });
    expect(dbGet).not.toHaveBeenCalled();
  });

  test('falls back to db.get when orm query is unavailable', async () => {
    const dbGet = mock(async (id: string) => ({
      _id: id,
      token: 'db-token',
    }));

    const ctx = {
      db: {
        get: dbGet,
      },
    };

    const doc = await getByIdWithOrmQueryFallback(
      ctx as any,
      'session',
      'session-id' as any
    );

    expect(doc).toEqual({
      _id: 'session-id',
      token: 'db-token',
    });
    expect(dbGet).toHaveBeenCalledWith('session-id');
  });

  test('preserves orm query method this binding', async () => {
    const dbGet = mock(async (_id: string) => {
      throw new Error('db fallback should not be called');
    });

    const sessionQuery = {
      createQuery: () => ({
        _id: 'orm-doc',
        token: 'orm-token',
      }),
      async findFirst(this: { createQuery: () => unknown }, _args: unknown) {
        return this.createQuery();
      },
    };

    const ctx = {
      db: {
        get: dbGet,
      },
      orm: {
        query: {
          session: sessionQuery,
        },
      },
    };

    const doc = await getByIdWithOrmQueryFallback(
      ctx as any,
      'session',
      'session-id' as any
    );

    expect(doc).toEqual({
      _id: 'orm-doc',
      token: 'orm-token',
    });
    expect(dbGet).not.toHaveBeenCalled();
  });
});
