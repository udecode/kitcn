import type { GenericId } from 'convex/values';
import type { FilterOperators, GetColumnData } from 'kitcn/orm';
import { bigint, boolean, id, integer, text } from 'kitcn/orm';

import { type Equal, Expect, IsAny, Not } from './utils';

// ============================================================================
// Helper type to test GetColumnData with 'raw' mode
// (FilterOperators use 'raw' mode for value parameters)
// ============================================================================

// Test 1: GetColumnData in raw mode with notNull text
{
  const name = text().notNull();
  type ValueType = GetColumnData<typeof name, 'raw'>;

  Expect<Equal<ValueType, string>>;
}

// Test 2: GetColumnData in raw mode with nullable text (strips null)
{
  const bio = text(); // nullable
  type ValueType = GetColumnData<typeof bio, 'raw'>;

  // raw mode strips null union
  Expect<Equal<ValueType, string>>;
}

// Test 3: GetColumnData in raw mode with notNull integer
{
  const age = integer().notNull();
  type ValueType = GetColumnData<typeof age, 'raw'>;

  Expect<Equal<ValueType, number>>;
}

// Test 4: GetColumnData in raw mode with nullable integer (strips null)
{
  const score = integer(); // nullable
  type ValueType = GetColumnData<typeof score, 'raw'>;

  Expect<Equal<ValueType, number>>;
}

// Test 5: GetColumnData in raw mode with notNull boolean
{
  const isActive = boolean().notNull();
  type ValueType = GetColumnData<typeof isActive, 'raw'>;

  Expect<Equal<ValueType, boolean>>;
}

// Test 6: GetColumnData in raw mode with nullable boolean (strips null)
{
  const isVerified = boolean(); // nullable
  type ValueType = GetColumnData<typeof isVerified, 'raw'>;

  Expect<Equal<ValueType, boolean>>;
}

// Test 7: GetColumnData in raw mode with notNull bigint
{
  const timestamp = bigint().notNull();
  type ValueType = GetColumnData<typeof timestamp, 'raw'>;

  Expect<Equal<ValueType, bigint>>;
}

// Test 8: GetColumnData in raw mode with nullable bigint (strips null)
{
  const balance = bigint(); // nullable
  type ValueType = GetColumnData<typeof balance, 'raw'>;

  Expect<Equal<ValueType, bigint>>;
}

// Test 9: GetColumnData in raw mode with notNull id
{
  const userId = id('users').notNull();
  type ValueType = GetColumnData<typeof userId, 'raw'>;

  Expect<Equal<ValueType, GenericId<'users'>>>;
}

// Test 10: GetColumnData in raw mode with nullable id (strips null)
{
  const parentId = id('posts'); // nullable
  type ValueType = GetColumnData<typeof parentId, 'raw'>;

  Expect<Equal<ValueType, GenericId<'posts'>>>;
}

// ============================================================================
// Array types for inArray operator
// ============================================================================

// Test 11: inArray with notNull text produces readonly string[]
{
  const name = text().notNull();
  type ArrayType = readonly GetColumnData<typeof name, 'raw'>[];

  Expect<Equal<ArrayType, readonly string[]>>;
}

// Test 12: inArray with nullable text produces readonly string[] (raw mode)
{
  const bio = text(); // nullable
  type ArrayType = readonly GetColumnData<typeof bio, 'raw'>[];

  Expect<Equal<ArrayType, readonly string[]>>;
}

// Test 13: inArray with notNull integer produces readonly number[]
{
  const age = integer().notNull();
  type ArrayType = readonly GetColumnData<typeof age, 'raw'>[];

  Expect<Equal<ArrayType, readonly number[]>>;
}

// Test 14: inArray with nullable id produces readonly GenericId[] (raw mode)
{
  const parentId = id('posts'); // nullable
  type ArrayType = readonly GetColumnData<typeof parentId, 'raw'>[];

  Expect<Equal<ArrayType, readonly GenericId<'posts'>[]>>;
}

// ============================================================================
// Verify FilterOperators are properly typed (interface check)
// ============================================================================

// Test 15: Verify FilterOperators methods use GetColumnData<TBuilder, 'raw'>
// This is a structural test - if the types compile correctly in the actual
// usage (like in select.ts where clause), then the FilterOperators interface
// is correctly using GetColumnData with 'raw' mode.
//
// The above tests verify that GetColumnData<T, 'raw'> produces the correct
// types for each column builder type, which is what FilterOperators rely on.

// ============================================================================
// FilterOperators TYPE SAFETY (Convex-backend inspired)
// ============================================================================

declare const ops: FilterOperators;

// eq must use matching types
{
  const name = text().notNull();
  ops.eq(name, 'Alice');
  // @ts-expect-error - value must match column type
  ops.eq(name, 123);
}

// gt must use matching types
{
  const age = integer().notNull();
  ops.gt(age, 123);
  // @ts-expect-error - value must match column type
  ops.gt(age, 'nope');
}

// between / notBetween must use matching min/max types
{
  const age = integer().notNull();
  ops.between(age, 18, 65);
  ops.notBetween(age, 18, 65);
  // @ts-expect-error - min value must match column type
  ops.between(age, '18', 65);
  // @ts-expect-error - max value must match column type
  ops.notBetween(age, 18, '65');
}

// isNull should reject notNull fields
{
  const nullableName = text();
  ops.isNull(nullableName);
  // @ts-expect-error - isNull is invalid for notNull fields
  ops.isNull(text().notNull());
}

// inArray must use array of correct types
{
  const cityId = id('cities').notNull();
  ops.inArray(cityId, [] as GenericId<'cities'>[]);
  // @ts-expect-error - inArray expects correct element type
  ops.inArray(cityId, ['not-an-id']);
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// FilterOperators should not return any
{
  type EqReturn = ReturnType<FilterOperators['eq']>;
  type InArrayReturn = ReturnType<FilterOperators['inArray']>;
  type BetweenReturn = ReturnType<FilterOperators['between']>;
  type NotBetweenReturn = ReturnType<FilterOperators['notBetween']>;

  Expect<Not<IsAny<EqReturn>>>;
  Expect<Not<IsAny<InArrayReturn>>>;
  Expect<Not<IsAny<BetweenReturn>>>;
  Expect<Not<IsAny<NotBetweenReturn>>>;
}

export {};
