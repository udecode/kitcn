import {
  checkUniqueFields,
  hasUniqueFields,
  paginate,
  selectFields,
} from './adapter-utils';

const betterAuthSchema = {
  user: {
    fields: {
      email: { unique: true },
      name: { unique: false },
    },
    modelName: 'users',
  },
} as any;

describe('hasUniqueFields', () => {
  test('detects unique fields using modelName mapping', () => {
    expect(
      hasUniqueFields(betterAuthSchema, 'users', { email: 'a@b.com' })
    ).toBe(true);
    expect(hasUniqueFields(betterAuthSchema, 'users', { name: 'alice' })).toBe(
      false
    );
  });
});

describe('selectFields', () => {
  test('returns null for null docs', async () => {
    expect(await selectFields(null, ['email'])).toBeNull();
  });

  test('returns full document when select is missing', async () => {
    const doc = { _id: 'u1', email: 'a@b.com', name: 'alice' };
    expect(await selectFields(doc as any)).toEqual(doc);
  });

  test('returns selected subset when select is provided', async () => {
    const doc = { _id: 'u1', email: 'a@b.com', name: 'alice' };
    expect(await selectFields(doc as any, ['email'])).toEqual({
      email: 'a@b.com',
    });
  });

  test('keeps _id when Better Auth requests id', async () => {
    const doc = { _id: 'u1', email: 'a@b.com', name: 'alice' };
    expect(await selectFields(doc as any, ['id'])).toEqual({
      _id: 'u1',
    });
  });
});

describe('paginate', () => {
  test('reapplies insensitive equality filters after index selection', async () => {
    const queryBuilder = {
      eq: () => queryBuilder,
    };
    const db = {
      query: () => ({
        withIndex: (
          _indexName: string,
          applyRange?: (q: typeof queryBuilder) => unknown
        ) => {
          applyRange?.(queryBuilder);

          return {
            order: () => ({
              async *[Symbol.asyncIterator]() {
                yield {
                  _creationTime: 1,
                  _id: 'account-1',
                  email: 'ALICE@example.com',
                  providerId: 'github',
                };
                yield {
                  _creationTime: 2,
                  _id: 'account-2',
                  email: 'bob@example.com',
                  providerId: 'github',
                };
              },
            }),
          };
        },
      }),
    };

    const result = await paginate(
      { db } as any,
      {
        tables: {
          account: {
            indexes: [
              {
                fields: ['providerId'],
                indexDescriptor: 'by_provider',
              },
            ],
            export: () => ({
              indexes: [
                {
                  fields: ['providerId'],
                  indexDescriptor: 'by_provider',
                },
              ],
            }),
          },
        },
      } as any,
      {} as any,
      {
        model: 'account',
        paginationOpts: { cursor: null, numItems: 10 },
        where: [
          {
            field: 'providerId',
            operator: 'eq',
            value: 'github',
          },
          {
            field: 'email',
            mode: 'insensitive',
            operator: 'eq',
            value: 'alice@example.com',
          },
        ],
      }
    );

    expect(result.page).toEqual([
      {
        _creationTime: 1,
        _id: 'account-1',
        email: 'ALICE@example.com',
        providerId: 'github',
      },
    ]);
  });

  test('matches insensitive range boundaries with different casing', async () => {
    const db = {
      query: () => ({
        withIndex: () => ({
          order: () => ({
            async *[Symbol.asyncIterator]() {
              yield {
                _creationTime: 1,
                _id: 'account-1',
                email: 'ABC@example.com',
              };
              yield {
                _creationTime: 2,
                _id: 'account-2',
                email: 'abd@example.com',
              };
            },
          }),
        }),
      }),
    };

    const result = await paginate(
      { db } as any,
      {
        tables: {
          account: {
            indexes: [],
            export: () => ({
              indexes: [],
            }),
          },
        },
      } as any,
      {} as any,
      {
        model: 'account',
        paginationOpts: { cursor: null, numItems: 10 },
        where: [
          {
            field: 'email',
            mode: 'insensitive',
            operator: 'gte',
            value: 'abc@example.com',
          },
          {
            field: 'email',
            mode: 'insensitive',
            operator: 'lte',
            value: 'abc@example.com',
          },
        ],
      }
    );

    expect(result.page).toEqual([
      {
        _creationTime: 1,
        _id: 'account-1',
        email: 'ABC@example.com',
      },
    ]);
  });

  test('uses composite indexes with real field names for eq plus sortBy', async () => {
    const indexCalls: Array<{ indexName: string }> = [];
    const rangeCalls: Array<{ field: string; value: unknown }> = [];
    const queryBuilder = {
      eq: (field: string, value: unknown) => {
        rangeCalls.push({ field, value });
        return queryBuilder;
      },
    };
    const db = {
      query: () => ({
        withIndex: (
          indexName: string,
          applyRange?: (q: typeof queryBuilder) => unknown
        ) => {
          indexCalls.push({ indexName });
          applyRange?.(queryBuilder);

          return {
            order: () => ({
              async *[Symbol.asyncIterator]() {
                yield {
                  _creationTime: 1,
                  _id: 'account-1',
                  accountId: 'acct_1',
                  providerId: 'github',
                };
              },
            }),
          };
        },
      }),
    };
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await paginate(
        { db } as any,
        {
          tables: {
            account: {
              indexes: [
                {
                  fields: ['providerId', 'accountId'],
                  indexDescriptor: 'by_provider_account',
                },
              ],
              export: () => ({
                indexes: [
                  {
                    fields: ['providerId', 'accountId'],
                    indexDescriptor: 'by_provider_account',
                  },
                ],
              }),
            },
          },
        } as any,
        {} as any,
        {
          model: 'account',
          paginationOpts: { cursor: null, numItems: 10 },
          sortBy: { direction: 'asc', field: 'accountId' },
          where: [
            {
              field: 'providerId',
              operator: 'eq',
              value: 'github',
            },
          ],
        }
      );

      expect(indexCalls[0]?.indexName).toBe('by_provider_account');
      expect(rangeCalls).toEqual([{ field: 'providerId', value: 'github' }]);
      expect(warnSpy).not.toHaveBeenCalled();
      expect(result.page).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('checkUniqueFields', () => {
  test('returns early when no unique fields are present in input', async () => {
    const querySpy = spyOn(
      {
        query: () => ({
          withIndex: () => ({
            unique: async () => null,
          }),
        }),
      },
      'query'
    );

    const ctx = {
      db: {
        query: querySpy,
      },
    };

    await checkUniqueFields(
      ctx as any,
      { tables: { users: { export: () => ({ indexes: [] }) } } } as any,
      betterAuthSchema,
      'users',
      { name: 'alice' }
    );

    expect(querySpy).not.toHaveBeenCalled();
  });

  test('throws when unique field has no usable index', async () => {
    await expect(
      checkUniqueFields(
        {
          db: {
            query: () => ({
              withIndex: () => ({
                unique: async () => null,
              }),
            }),
          },
        } as any,
        { tables: { users: { export: () => ({ indexes: [] }) } } } as any,
        betterAuthSchema,
        'users',
        { email: 'a@b.com' }
      )
    ).rejects.toThrow('No index found for usersemail');
  });

  test('throws when another document already has the same unique value', async () => {
    await expect(
      checkUniqueFields(
        {
          db: {
            query: () => ({
              withIndex: (_name: string, build: (q: any) => any) => {
                build({
                  eq: () => ({}),
                });
                return {
                  unique: async () => ({ _id: 'other-user' }),
                };
              },
            }),
          },
        } as any,
        {
          tables: {
            users: {
              export: () => ({
                indexes: [
                  {
                    fields: ['email'],
                    indexDescriptor: 'by_email',
                  },
                ],
              }),
            },
          },
        } as any,
        betterAuthSchema,
        'users',
        { email: 'a@b.com' },
        { _id: 'current-user' }
      )
    ).rejects.toThrow('users email already exists');
  });
});
