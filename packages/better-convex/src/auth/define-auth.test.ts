import type { GenericDataModel, SchemaDefinition } from 'convex/server';
import { defineAuth, type GenericAuthTriggers } from './define-auth';
import { createDisabledAuthRuntime } from './generated-contract';

type ExpectTrue<T extends true> = T;
type ExpectFalse<T extends false> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

type TestDataModel = GenericDataModel & {
  tables: {
    session: {
      document: {
        _creationTime: number;
        _id: string;
        activeOrganizationId?: string | null;
        userId: string;
      };
    };
    user: {
      document: {
        _creationTime: number;
        _id: string;
        email: string;
        role?: string;
      };
    };
  };
};

type TestSchema = SchemaDefinition<any, true> & {
  tables: {
    session: unknown;
    user: unknown;
  };
};

type TestTriggers = GenericAuthTriggers<TestDataModel, TestSchema>;
type _HasUserTrigger = ExpectTrue<
  'user' extends keyof TestTriggers ? true : false
>;
type _HasSessionTrigger = ExpectTrue<
  'session' extends keyof TestTriggers ? true : false
>;
type _BeforeCreateArgNotAny = ExpectFalse<
  IsAny<
    Parameters<
      NonNullable<NonNullable<TestTriggers['user']>['beforeCreate']>
    >[0]
  >
>;
type _BeforeUpdateArgNotAny = ExpectFalse<
  IsAny<
    Parameters<
      NonNullable<NonNullable<TestTriggers['user']>['beforeUpdate']>
    >[1]
  >
>;
type _OnCreateArgNotAny = ExpectFalse<
  IsAny<
    Parameters<NonNullable<NonNullable<TestTriggers['user']>['onCreate']>>[0]
  >
>;

const defaultCtxAuth = defineAuth((ctx) => ({
  baseURL: 'http://localhost:3000',
}));
type DefaultCtx = Parameters<typeof defaultCtxAuth>[0];
type _DefineAuthDefaultCtxNotAny = ExpectFalse<IsAny<DefaultCtx>>;

describe('defineAuth', () => {
  test('returns auth definition with doc-first triggers', async () => {
    const auth = defineAuth((_ctx: unknown) => ({
      baseURL: 'http://localhost:3000',
      triggers: {
        user: {
          beforeCreate: async (data) => ({
            ...data,
            normalized: true,
          }),
        },
      },
    }));

    const resolved = auth({});
    const result = await resolved.triggers?.user?.beforeCreate?.({
      email: 'x@y.z',
    });

    expect(result).toMatchObject({ normalized: true });
  });
});

describe('createDisabledAuthRuntime', () => {
  test('returns disabled auth contract that throws with setup guidance', () => {
    const runtime = createDisabledAuthRuntime({
      reason: 'custom disabled auth message',
    });

    expect(runtime.authEnabled).toBe(false);
    expect(() => runtime.getAuth({} as any)).toThrow(
      /custom disabled auth message/
    );
  });
});
