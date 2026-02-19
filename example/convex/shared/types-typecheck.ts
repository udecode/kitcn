/* biome-ignore-all lint: compile-time type assertions only */

import type { InferInsertModel, InferSelectModel } from 'better-convex/orm';
import type { Doc } from '../functions/_generated/dataModel';
import type { todosTable, userTable } from '../functions/schema';
import type { ApiInputs, ApiOutputs, Insert, Select, TableName } from './api';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;

type _TableNameHasUser = Expect<
  Equal<'user' extends TableName ? true : false, true>
>;
type _TableNameHasTodos = Expect<
  Equal<'todos' extends TableName ? true : false, true>
>;

type _SelectUserMatches = Expect<
  Equal<Select<'user'>, InferSelectModel<typeof userTable>>
>;
type _InsertUserMatches = Expect<
  Equal<Insert<'user'>, InferInsertModel<typeof userTable>>
>;

type _SelectTodosMatches = Expect<
  Equal<Select<'todos'>, InferSelectModel<typeof todosTable>>
>;
type _InsertTodosMatches = Expect<
  Equal<Insert<'todos'>, InferInsertModel<typeof todosTable>>
>;

// @ts-expect-error invalid table name must be rejected
type _InvalidTableSelect = Select<'invalid_table_name'>;

type _SessionExpiresAtIsDate = Expect<
  Equal<Select<'session'>['expiresAt'], Date>
>;
type _SessionUpdatedAtIsDate = Expect<
  Equal<Select<'session'>['updatedAt'], Date>
>;
type _AccountAccessTokenExpiresAtIsDate = Expect<
  Equal<Select<'account'>['accessTokenExpiresAt'], Date | null>
>;
type _AccountRefreshTokenExpiresAtIsDate = Expect<
  Equal<Select<'account'>['refreshTokenExpiresAt'], Date | null>
>;
type _AccountUpdatedAtIsDate = Expect<
  Equal<Select<'account'>['updatedAt'], Date>
>;
type _VerificationExpiresAtIsDate = Expect<
  Equal<Select<'verification'>['expiresAt'], Date>
>;
type _VerificationUpdatedAtIsDate = Expect<
  Equal<Select<'verification'>['updatedAt'], Date>
>;
type _InvitationExpiresAtIsDate = Expect<
  Equal<Select<'invitation'>['expiresAt'], Date>
>;
type _UserUpdatedAtIsDate = Expect<Equal<Select<'user'>['updatedAt'], Date>>;
type _UserBanExpiresIsDate = Expect<
  Equal<Select<'user'>['banExpires'], Date | null>
>;
type _UserDeletedAtIsDate = Expect<
  Equal<Select<'user'>['deletedAt'], Date | null>
>;
type _TodoDueDateIsDate = Expect<
  Equal<Select<'todos'>['dueDate'], Date | null>
>;
type _TodoDeletionTimeIsDate = Expect<
  Equal<Select<'todos'>['deletionTime'], Date | null>
>;

// Date-hint-enhanced API types should NOT be `any`.
type _CreateTodoDueDateInputNotAny = Expect<
  Equal<IsAny<ApiInputs['todos']['create']['dueDate']>, false>
>;
type _UpdateTodoDueDateInputNotAny = Expect<
  Equal<IsAny<ApiInputs['todos']['update']['dueDate']>, false>
>;
type _TodoCreatedAtOutputNotAny = Expect<
  Equal<IsAny<ApiOutputs['todos']['list']['page'][number]['createdAt']>, false>
>;
type _TodoCreatedAtOutputIsDate = Expect<
  Equal<ApiOutputs['todos']['list']['page'][number]['createdAt'], Date>
>;
type _OrganizationMemberCreatedAtOutputNotAny = Expect<
  Equal<
    IsAny<
      ApiOutputs['organization']['listMembers']['members'][number]['createdAt']
    >,
    false
  >
>;
type _OrganizationMemberCreatedAtOutputIsDate = Expect<
  Equal<
    ApiOutputs['organization']['listMembers']['members'][number]['createdAt'],
    Date
  >
>;

type _SessionExpiresAtDocIsNumber = Expect<
  Equal<Doc<'session'>['expiresAt'], number>
>;
type _SessionUpdatedAtDocIsNumber = Expect<
  Equal<Doc<'session'>['updatedAt'], number>
>;
type _AccountAccessTokenExpiresAtDocIsNumber = Expect<
  Equal<Doc<'account'>['accessTokenExpiresAt'], number | null | undefined>
>;
type _AccountRefreshTokenExpiresAtDocIsNumber = Expect<
  Equal<Doc<'account'>['refreshTokenExpiresAt'], number | null | undefined>
>;
type _AccountUpdatedAtDocIsNumber = Expect<
  Equal<Doc<'account'>['updatedAt'], number>
>;
type _VerificationExpiresAtDocIsNumber = Expect<
  Equal<Doc<'verification'>['expiresAt'], number>
>;
type _VerificationUpdatedAtDocIsNumber = Expect<
  Equal<Doc<'verification'>['updatedAt'], number>
>;
type _InvitationExpiresAtDocIsNumber = Expect<
  Equal<Doc<'invitation'>['expiresAt'], number>
>;
type _UserUpdatedAtDocIsNumber = Expect<
  Equal<Doc<'user'>['updatedAt'], number>
>;
type _UserBanExpiresDocIsNumber = Expect<
  Equal<Doc<'user'>['banExpires'], number | null | undefined>
>;
type _UserDeletedAtDocIsNumber = Expect<
  Equal<Doc<'user'>['deletedAt'], number | null | undefined>
>;
type _TodoDueDateDocIsNumber = Expect<
  Equal<Doc<'todos'>['dueDate'], number | null | undefined>
>;
type _TodoDeletionTimeDocIsNumber = Expect<
  Equal<Doc<'todos'>['deletionTime'], number | null | undefined>
>;

const _validDateCreateDueDate: ApiInputs['todos']['create'] = {
  title: 'x',
  dueDate: new Date(),
};

const _validDateUpdateDueDate: ApiInputs['todos']['update'] = {
  id: 'x' as any,
  dueDate: new Date(),
};

const _invalidNumericCreateDueDate: ApiInputs['todos']['create'] = {
  title: 'x',
  // @ts-expect-error Date-hint input should reject numeric timestamp
  dueDate: 1700000000000,
};

const _invalidNumericUpdateDueDate: ApiInputs['todos']['update'] = {
  id: 'x' as any,
  // @ts-expect-error Date-hint input should reject numeric timestamp
  dueDate: 1700000000000,
};
