import type { GenericId } from 'convex/values';
import type { GetColumnData } from 'kitcn/orm';
import { bigint, boolean, id, integer, text } from 'kitcn/orm';
import { type Equal, Expect } from './utils';

// ============================================================================
// GetColumnData 'query' mode tests (default)
// ============================================================================

// Test 1: notNull text field in query mode
{
  const name = text().notNull();
  type NameQuery = GetColumnData<typeof name, 'query'>;

  Expect<Equal<NameQuery, string>>;
}

// Test 2: nullable text field in query mode
{
  const bio = text(); // nullable
  type BioQuery = GetColumnData<typeof bio, 'query'>;

  Expect<Equal<BioQuery, string | null>>;
}

// Test 3: notNull integer field in query mode
{
  const age = integer().notNull();
  type AgeQuery = GetColumnData<typeof age, 'query'>;

  Expect<Equal<AgeQuery, number>>;
}

// Test 4: nullable integer field in query mode
{
  const score = integer(); // nullable
  type ScoreQuery = GetColumnData<typeof score, 'query'>;

  Expect<Equal<ScoreQuery, number | null>>;
}

// Test 5: notNull boolean field in query mode
{
  const isActive = boolean().notNull();
  type IsActiveQuery = GetColumnData<typeof isActive, 'query'>;

  Expect<Equal<IsActiveQuery, boolean>>;
}

// Test 6: nullable boolean field in query mode
{
  const isVerified = boolean(); // nullable
  type IsVerifiedQuery = GetColumnData<typeof isVerified, 'query'>;

  Expect<Equal<IsVerifiedQuery, boolean | null>>;
}

// Test 7: notNull bigint field in query mode
{
  const timestamp = bigint().notNull();
  type TimestampQuery = GetColumnData<typeof timestamp, 'query'>;

  Expect<Equal<TimestampQuery, bigint>>;
}

// Test 8: nullable bigint field in query mode
{
  const balance = bigint(); // nullable
  type BalanceQuery = GetColumnData<typeof balance, 'query'>;

  Expect<Equal<BalanceQuery, bigint | null>>;
}

// Test 9: notNull id field in query mode
{
  const userId = id('users').notNull();
  type UserIdQuery = GetColumnData<typeof userId, 'query'>;

  Expect<Equal<UserIdQuery, GenericId<'users'>>>;
}

// Test 10: nullable id field in query mode
{
  const parentId = id('posts'); // nullable
  type ParentIdQuery = GetColumnData<typeof parentId, 'query'>;

  Expect<Equal<ParentIdQuery, GenericId<'posts'> | null>>;
}

// ============================================================================
// GetColumnData 'raw' mode tests
// ============================================================================

// Test 11: notNull text field in raw mode
{
  const name = text().notNull();
  type NameRaw = GetColumnData<typeof name, 'raw'>;

  Expect<Equal<NameRaw, string>>;
}

// Test 12: nullable text field in raw mode (no null union)
{
  const bio = text(); // nullable
  type BioRaw = GetColumnData<typeof bio, 'raw'>;

  Expect<Equal<BioRaw, string>>;
}

// Test 13: notNull integer field in raw mode
{
  const age = integer().notNull();
  type AgeRaw = GetColumnData<typeof age, 'raw'>;

  Expect<Equal<AgeRaw, number>>;
}

// Test 14: nullable integer field in raw mode (no null union)
{
  const score = integer(); // nullable
  type ScoreRaw = GetColumnData<typeof score, 'raw'>;

  Expect<Equal<ScoreRaw, number>>;
}

// Test 15: notNull boolean field in raw mode
{
  const isActive = boolean().notNull();
  type IsActiveRaw = GetColumnData<typeof isActive, 'raw'>;

  Expect<Equal<IsActiveRaw, boolean>>;
}

// Test 16: nullable boolean field in raw mode (no null union)
{
  const isVerified = boolean(); // nullable
  type IsVerifiedRaw = GetColumnData<typeof isVerified, 'raw'>;

  Expect<Equal<IsVerifiedRaw, boolean>>;
}

// Test 17: notNull bigint field in raw mode
{
  const timestamp = bigint().notNull();
  type TimestampRaw = GetColumnData<typeof timestamp, 'raw'>;

  Expect<Equal<TimestampRaw, bigint>>;
}

// Test 18: nullable bigint field in raw mode (no null union)
{
  const balance = bigint(); // nullable
  type BalanceRaw = GetColumnData<typeof balance, 'raw'>;

  Expect<Equal<BalanceRaw, bigint>>;
}

// Test 19: notNull id field in raw mode
{
  const userId = id('users').notNull();
  type UserIdRaw = GetColumnData<typeof userId, 'raw'>;

  Expect<Equal<UserIdRaw, GenericId<'users'>>>;
}

// Test 20: nullable id field in raw mode (no null union)
{
  const parentId = id('posts'); // nullable
  type ParentIdRaw = GetColumnData<typeof parentId, 'raw'>;

  Expect<Equal<ParentIdRaw, GenericId<'posts'>>>;
}

// ============================================================================
// GetColumnData default mode (should be 'query')
// ============================================================================

// Test 21: default mode behaves like 'query' mode
{
  const name = text().notNull();
  type NameDefault = GetColumnData<typeof name>;

  Expect<Equal<NameDefault, string>>;
}

// Test 22: default mode with nullable field includes null
{
  const bio = text(); // nullable
  type BioDefault = GetColumnData<typeof bio>;

  Expect<Equal<BioDefault, string | null>>;
}
