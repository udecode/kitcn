import {
  checkUniqueFields,
  hasUniqueFields,
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
