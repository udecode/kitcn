# Type Testing Research: Drizzle ORM & TypeScript Best Practices

## Executive Summary

This research explores Drizzle ORM's type testing approach and TypeScript testing tools to inform our Convex ORM type testing strategy.

**Key Findings:**
1. Drizzle uses a **simple compile-time testing approach** with `tsc` (not vitest's type testing)
2. They built **custom utilities** (`Expect<Equal<...>>`) rather than using external libraries
3. They combine **positive assertions** with **negative tests** (@ts-expect-error) and **custom error types** (DrizzleTypeError)
4. Tests are **comprehensive** (4,891 lines across pg tests alone) covering all operations
5. Modern alternatives exist (vitest expectTypeOf, tsd) but Drizzle's approach remains valid

---

## 1. Drizzle ORM's Approach

### 1.1 Test Infrastructure

**Location:** `/drizzle-orm/type-tests/`
```
type-tests/
├── common/           # Shared tests
├── pg/              # PostgreSQL (1,458 lines in select.ts alone!)
├── mysql/
├── sqlite/
├── singlestore/
├── geldb/
├── utils.ts         # Core utilities
└── tsconfig.json
```

**Running Tests:**
```json
{
  "scripts": {
    "test:types": "cd type-tests && tsc"
  }
}
```

**Key Insight:** They use plain `tsc` with `noEmit: true` - no runtime execution, pure compile-time validation.

### 1.2 Core Testing Utilities

**File:** `type-tests/utils.ts` (6 lines!)
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true
  : false;
```

**How it works:**
- `Expect<T extends true>()` - Function that only accepts `true` as type parameter
- `Equal<X, Y>` - Sophisticated type equality checker using conditional type inference
- If types don't match exactly, TypeScript compilation fails

**Source:** This `Equal` type is the same pattern used by [popular libraries](https://effectivetypescript.com/2022/05/28/eslint-plugin-expect-type/) like Zod, TanStack Query, zustand, tRPC, MUI, type-fest.

### 1.3 Testing Patterns

#### A. Positive Assertions (Type Inference)

**Pattern:** Write actual code, then assert the inferred type matches expectations.

```typescript
// 1. Write the actual query
const leftJoinFull = await db.select().from(users).leftJoin(city, eq(users.id, city.id));

// 2. Assert the inferred type
Expect<
  Equal<
    {
      users_table: typeof users.$inferSelect;
      city: typeof cities.$inferSelect | null;
    }[],
    typeof leftJoinFull
  >
>;
```

**Why this works:**
- Tests BOTH that code compiles AND type inference is correct
- Catches regressions when types change unexpectedly
- No runtime overhead - pure compile-time

#### B. Complex Type Scenarios

**Nested objects with nullability:**
```typescript
const leftJoinMixed = await db
  .select({
    id: users.id,
    text: users.text,
    textUpper: sql<string | null>`upper(${users.text})`,
    idComplex: sql<string | null>`${users.id}::text || ${city.id}::text`,
    city: {
      id: city.id,
      name: city.name,
    },
  })
  .from(users)
  .leftJoin(city, eq(users.id, city.id));

Expect<
  Equal<
    {
      id: number;
      text: string | null;
      textUpper: string | null;
      idComplex: string | null;
      city: {
        id: number;
        name: string;
      } | null; // Entire nested object becomes nullable!
    }[],
    typeof leftJoinMixed
  >
>;
```

**Key Pattern:** They test that nested objects in left joins become `T | null`, not `{ a: T | null }`.

#### C. Generated Columns & Inference

```typescript
const users = pgTable('users', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  email: text('email').notNull(),
  fullName: text('full_name').generatedAlwaysAs(sql`concat_ws(first_name, ' ', last_name)`).notNull(),
  upperName: text('upper_name').generatedAlwaysAs(
    sql` case when first_name is null then null else upper(first_name) end `,
  ),
});

type NewUser = typeof users.$inferInsert;

Expect<
  Equal<
    {
      email: string;
      id?: number | undefined;
      firstName?: string | null | undefined;
      lastName?: string | null | undefined;
      // Note: fullName and upperName are EXCLUDED from insert type
    },
    NewUser
  >
>();
```

**Pattern:** Generated columns are automatically excluded from insert types.

#### D. Negative Testing with @ts-expect-error

**Usage:** 61 occurrences across pg tests alone!

```typescript
db
  .select()
  .from(users)
  .where(eq(users.id, 1))
  // @ts-expect-error - can't use where twice
  .where(eq(users.id, 1));

db
  .insert(users1)
  .select(
    // @ts-expect-error name is undefined
    qb.select({ admin: users1.admin }).from(users1),
  );

// @ts-expect-error - can't use both skipLocked and noWait
await db
  .select()
  .from(users)
  .for('share', { of: users, noWait: true, skipLocked: true });
```

**Pattern:** Test invalid usage produces errors. If no error occurs, TypeScript reports "unnecessary @ts-expect-error".

#### E. Custom Type Errors (DrizzleTypeError)

**Definition:** `src/utils.ts`
```typescript
export interface DrizzleTypeError<T extends string> {
  $drizzleTypeError: T;
}
```

**Usage in tests:**
```typescript
const errorSubquery = await db.select({
  name: db.select({ name: users.name, managerId: users.managerId })
    .from(users)
    .where(eq(users.id, posts.authorId))
    .as('name'),
}).from(posts);

Expect<
  Equal<
    typeof errorSubquery,
    { name: DrizzleTypeError<'You can only select one column in the subquery'> }[]
  >
>;
```

**Advantage:** Provides **user-friendly error messages** instead of cryptic TypeScript errors.

**Pattern for detecting inaccessible properties:**
```typescript
{
  const sq = db.select({ count: sql<number>`count(1)::int` }).from(users).as('sq');
  Expect<typeof sq.count extends DrizzleTypeError<any> ? true : false>;
  // Tests that sq.count is a DrizzleTypeError (not accessible directly)
}
```

### 1.4 Test Organization

**By Operation:**
- `select.ts` (1,458 lines) - Comprehensive join testing, dynamic queries, views
- `insert.ts` (299 lines) - Insert values, returning, prepared statements
- `update.ts` (278 lines) - Update operations, returning
- `delete.ts` (78 lines) - Delete operations
- `subquery.ts` (124 lines) - Subquery type inference
- `tables.ts` (1,476 lines) - Schema definitions, inference helpers
- `generated-columns.ts` (222 lines) - Generated column behavior

**By Feature:**
- `with.ts` - CTE (Common Table Expressions)
- `set-operators.ts` - UNION, INTERSECT, EXCEPT
- `array.ts` - Array operations
- `count.ts` - Aggregate functions
- `db-rel.ts`, `tables-rel.ts` - Relations

**Edge Cases:**
- `no-strict-null-checks/test.ts` - Tests behavior without strict null checks

### 1.5 Pattern: Dynamic Query Building

```typescript
{
  function withFriends<T extends PgSelect>(qb: T) {
    const friends = alias(users, 'friends');
    const friends2 = alias(users, 'friends2');
    // ...
    return qb
      .leftJoin(friends, sql`true`)
      .leftJoin(friends2, sql`true`)
      // ... more joins
  }

  const qb = db.select().from(users).$dynamic();
  const result = await withFriends(qb);
  Expect<
    Equal<typeof result, {
      users_table: typeof users.$inferSelect;
      friends: typeof users.$inferSelect | null;
      friends2: typeof users.$inferSelect | null;
      // ...
    }[]>
  >;
}
```

**Pattern:** Tests that generic query builders maintain correct type inference through transformations.

---

## 2. TypeScript Type Testing Tools

### 2.1 Vitest expectTypeOf

**Documentation:** [vitest.dev/guide/testing-types](https://vitest.dev/guide/testing-types)

**Features:**
- Built into Vitest (no separate tool needed)
- Tests in `*.test-d.ts` files
- Uses `tsc` or `vue-tsc` under the hood
- Pass `--typecheck` flag to run

**API:**
```typescript
import { expectTypeOf } from 'vitest';

expectTypeOf(leftJoinResult).toEqualTypeOf<{
  users_table: typeof users.$inferSelect;
  city: typeof cities.$inferSelect | null;
}[]>();

// Negative testing
expectTypeOf(invalidQuery).not.toBeString();

// Function signatures
expectTypeOf(fn).parameter(0).toBeNumber();
expectTypeOf(fn).returns.toBeString();

// Extract/exclude
expectTypeOf<string | number>().exclude<number>().toEqualTypeOf<string>();
```

**Key Matchers:**
- `.toEqualTypeOf<T>()` - Exact type equality
- `.toExtend<T>()` - Type extends check (replaces deprecated `.toMatchTypeOf`)
- `.toMatchObjectType<T>()` - Object shape matching
- `.toBeAny()`, `.toBeUnknown()`, `.toBeNever()`, `.toBeFunction()`, etc.
- `.not` - Negation
- `.parameter(index)`, `.returns` - Function testing
- `.extract<T>()`, `.exclude<T>()` - Type narrowing

**Recent Changes (Vitest 2.1+):**
- If `include` and `typecheck.include` overlap, type tests and runtime tests are separate entries
- Before 2.1, this would override include and only type-check

**Pros:**
- Integrated with existing test suite
- Good API for complex scenarios
- Active development

**Cons:**
- Requires Vitest setup
- Heavier than Drizzle's approach
- Different syntax from Drizzle's patterns

### 2.2 tsd / tsd-lite

**Documentation:**
- [github.com/tsdjs/tsd](https://github.com/tsdjs/tsd)
- [github.com/mrazauskas/tsd-lite](https://github.com/mrazauskas/tsd-lite)

**tsd (Original):**
```typescript
import { expectType, expectError, expectAssignable } from 'tsd';

expectType<string>(await getUserName());
expectError(await db.select().from(users).where(eq(users.id, 1)).where(eq(users.id, 1)));
expectAssignable<{ id: number }>(userResult);
```

**tsd-lite (Lighter Version):**
- Better for monorepos written in TypeScript (not just .d.ts files)
- Exposes: `expectAssignable`, `expectNotAssignable`, `expectError`, `expectType`, `expectNotType`
- Assertion strictness: `string` will NOT match `string | number` with `expectType` (use `expectAssignable` for loose matching)

**Pros:**
- Dedicated type testing tool
- Good for libraries with .d.ts files
- Standard in ecosystem

**Cons:**
- Another dependency
- Less flexible than custom utilities
- Drizzle didn't choose it (signal?)

### 2.3 conditional-type-checks

**Repository:** [github.com/dsherret/conditional-type-checks](https://github.com/dsherret/conditional-type-checks)

**Purpose:** Reusable conditional types for testing types.

**API:**
```typescript
import { IsExact, Has, NotHas, IsAny, IsNever, IsUnknown, AssertTrue, AssertFalse } from 'conditional-type-checks';

type Result = IsExact<ActualType, ExpectedType>; // true or false
type Check = Has<ActualType, SubType>; // true if ActualType has SubType

// Assertions
type Test1 = AssertTrue<IsExact<string, string>>;
type Test2 = AssertFalse<IsExact<string, number>>;
```

**Pros:**
- Lightweight (just types, no runtime)
- Reusable utilities
- Good for library authors

**Cons:**
- Limited ecosystem adoption
- Overlaps with Drizzle's `Equal` utility
- Less expressive than vitest's API

### 2.4 eslint-plugin-expect-type

**Documentation:** [effectivetypescript.com/2022/05/28/eslint-plugin-expect-type](https://effectivetypescript.com/2022/05/28/eslint-plugin-expect-type/)

**Purpose:** ESLint plugin for type assertions in comments.

**Usage:**
```typescript
const result = await db.select().from(users);
// @ts-expect-type: { id: number; name: string }[]
```

**Recommendation:** "For TypeScript libraries using heavy type machinery, writing tests with eslint-plugin-expect-type is highly recommended."

**Pros:**
- Inline with code
- Works with ESLint
- Comment-based (non-invasive)

**Cons:**
- Requires ESLint setup
- Less discoverable than dedicated test files
- Not widely adopted

---

## 3. Best Practices from Research

### 3.1 Type Equality Testing

**The "Gold Standard" Equal Type:**
```typescript
export type Equal<X, Y extends X> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;
```

**Why this works:**
- Uses conditional type inference to detect subtle differences
- Catches issues like branded types, literal types, optional properties
- Same pattern used across major TypeScript libraries
- Source: [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)

**Alternative (array-based):**
```typescript
type Expect<T, U> = T[] extends U[] ? U[] extends T[] ? true : false : false;
```
Source: [TypeScript Test Your Generic Type Part 2](https://dev.to/tylim88/typescript-test-your-generic-type-part-2-k2b)

### 3.2 Negative Testing Patterns

**Best Practice:** Use `@ts-expect-error` over `@ts-ignore`

**From TypeScript 3.9 release notes:**
> When a line is preceded by a `// @ts-expect-error` comment, TypeScript will suppress that error from being reported; but if there's no error, TypeScript will report that `// @ts-expect-error` wasn't necessary.

**Use Cases:**
1. **Test invalid operations fail:**
   ```typescript
   // @ts-expect-error - can't use where twice
   db.select().from(users).where(...).where(...);
   ```

2. **Test invalid types fail:**
   ```typescript
   // @ts-expect-error - should be number
   pgTable('test', {
     id3: integer('id').$default(() => '1'),
   });
   ```

3. **Test mutually exclusive options:**
   ```typescript
   // @ts-expect-error - can't use both
   db.select().from(users).for('share', { noWait: true, skipLocked: true });
   ```

**Warning:** [One @ts-expect-error can affect subsequent parameters](https://github.com/microsoft/TypeScript/issues/49972) in function calls.

**When NOT to use:** [Avoid in production code](https://shane-o.dev/articles/any-or-expect) - use only for testing.

### 3.3 Custom Type Errors

**Pattern:** Create branded error types with descriptive messages.

```typescript
export interface DrizzleTypeError<T extends string> {
  $drizzleTypeError: T;
}

// Usage in type definitions
type SelectResult =
  Columns extends [Column, Column, ...Column[]]
    ? DrizzleTypeError<'You can only select one column in the subquery'>
    : InferredType;
```

**Benefits:**
- User-friendly error messages
- Testable (can assert error type appears)
- Better DX than generic TypeScript errors

**Testing:**
```typescript
Expect<Equal<typeof result, { field: DrizzleTypeError<'Error message'> }[]>>;
// Or check if it's an error:
Expect<typeof field extends DrizzleTypeError<any> ? true : false>;
```

### 3.4 Testing Complex Generics

**Source:** [Mastering TypeScript Generics](https://leapcell.io/blog/mastering-typescript-generics-conditions-mappings-and-inference)

**Key Patterns:**

1. **Conditional Type Testing:**
   ```typescript
   type Result<T> = T extends string ? string[] : number[];

   Expect<Equal<Result<string>, string[]>>;
   Expect<Equal<Result<number>, number[]>>;
   ```

2. **Mapped Type Testing:**
   ```typescript
   type Nullable<T> = { [K in keyof T]: T[K] | null };

   type Input = { a: string; b: number };
   type Expected = { a: string | null; b: number | null };

   Expect<Equal<Nullable<Input>, Expected>>;
   ```

3. **Template Literal Type Testing:**
   ```typescript
   type EventName<T extends string> = `on${Capitalize<T>}`;

   Expect<Equal<EventName<'click'>, 'onClick'>>;
   ```

4. **Infer Testing:**
   ```typescript
   type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

   type Fn = () => string;
   Expect<Equal<ReturnType<Fn>, string>>;
   ```

**Known Issue:** [Method overload resolution with mapped types + conditional generics](https://github.com/microsoft/TypeScript/issues/62377) (Sep 2025) can confuse TypeScript.

---

## 4. Patterns Analysis

### 4.1 PATTERNS TO COPY

#### ✅ 1. Custom `Expect<Equal<...>>` Utility

**Why:**
- Zero dependencies
- Proven pattern (used by Zod, TanStack Query, zustand, tRPC, etc.)
- Simple and powerful
- Works with plain `tsc`

**For Convex:**
```typescript
// packages/kitcn/test-utils/type-testing.ts
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;
```

#### ✅ 2. Actual Code + Type Assertion Pattern

**Why:**
- Tests both compilation AND type inference
- Catches regressions automatically
- Self-documenting test cases

**For Convex:**
```typescript
const query = await ctx.table('users')
  .getMany()
  .nullable();

Expect<
  Equal<
    (UserDoc | null)[],
    typeof query
  >
>;
```

#### ✅ 3. Comprehensive Coverage by Operation

**Why:**
- Ensures all API surfaces have type tests
- Drizzle has 4,891 lines of type tests - we should be similarly thorough

**For Convex:**
```
type-tests/
├── query.test-d.ts      # Query building
├── insert.test-d.ts     # Insert operations
├── update.test-d.ts     # Update operations
├── delete.test-d.ts     # Delete operations
├── relations.test-d.ts  # Joins/relations
├── indexes.test-d.ts    # Index queries
├── nullable.test-d.ts   # Nullable conventions
└── schema.test-d.ts     # Schema inference
```

#### ✅ 4. @ts-expect-error for Negative Testing

**Why:**
- Tests that invalid usage produces errors
- Catches when error messages disappear
- Standard TypeScript feature

**For Convex:**
```typescript
// @ts-expect-error - can't filter after take
ctx.table('users').getMany().take(10).filter(...);

// @ts-expect-error - can't call nullable twice
ctx.table('users').getMany().nullable().nullable();
```

#### ✅ 5. Edge Case Testing (no-strict-null-checks)

**Why:**
- Users may have different tsconfig settings
- Ensures types work in various environments

**For Convex:**
```
type-tests/
└── no-strict-null-checks/
    └── query.test-d.ts
```

#### ✅ 6. Custom Type Errors with Branded Types

**Why:**
- Better error messages for users
- Testable error conditions
- Improved DX

**For Convex:**
```typescript
export interface ConvexTypeError<T extends string> {
  $convexTypeError: T;
}

// Usage:
type FilterResult<T> =
  T extends AfterTake
    ? ConvexTypeError<'Cannot filter after take/first - apply filters before limiting results'>
    : FilteredQuery<T>;
```

### 4.2 PATTERNS TO ADAPT

#### 🔄 1. Test File Naming

**Drizzle:** `type-tests/*.ts` (runs with `tsc`)
**Vitest:** `*.test-d.ts` (runs with `--typecheck`)

**For Convex:** Use `*.test-d.ts` if we might use vitest later, otherwise `*.types.ts` or `type-tests/*.ts`

**Recommendation:** `type-tests/*.ts` (clearer separation, follows Drizzle)

#### 🔄 2. Dynamic Query Testing

**Drizzle:**
```typescript
function withFriends<T extends PgSelect>(qb: T) {
  return qb.leftJoin(friends, sql`true`);
}
```

**For Convex:** Test our builder patterns:
```typescript
function withUserRelation<Q extends Query<any>>(query: Q) {
  return query.edge('user');
}

const result = withUserRelation(ctx.table('posts').getMany());
Expect<Equal<typeof result, ...>>;
```

#### 🔄 3. Generated/Computed Column Testing

**Drizzle:** Tests that generated columns are excluded from `$inferInsert`

**For Convex:** Test our schema inference:
```typescript
const table = convexTable({
  name: v.string(),
  computedField: v.optional(v.string()), // Not in insert?
});

type Insert = InferInsertModel<typeof table>;
Expect<Equal<Insert, { name: string }>>;
```

**Note:** Need to verify if Convex has equivalent concept.

### 4.3 PATTERNS TO AVOID

#### ❌ 1. Extremely Long Test Files

**Issue:** Drizzle's `select.ts` is 1,458 lines!

**Why avoid:**
- Hard to navigate
- Slow to compile
- Difficult to debug failures

**Better approach:** Split by feature:
```
type-tests/query/
├── basic.test-d.ts
├── joins.test-d.ts
├── pagination.test-d.ts
├── filtering.test-d.ts
└── edge-cases.test-d.ts
```

#### ❌ 2. Database-Specific Duplication

**Issue:** Drizzle duplicates tests across pg/, mysql/, sqlite/

**Why avoid:**
- We only target Convex
- More maintenance burden
- Not applicable

**Better approach:** Single test suite with Convex-specific patterns.

#### ❌ 3. Testing Internal Implementation Types

**Issue:** Some Drizzle tests assert on internal types like `PgColumn<{ tableName: '...'; ... }>`

**Why avoid:**
- Couples tests to implementation
- Breaks when refactoring internals
- Should test public API only

**Better approach:** Test inferred types from user perspective:
```typescript
// Good: Tests public API
Expect<Equal<typeof user.id, number>>;

// Bad: Tests internal structure
Expect<Equal<typeof user.id, ConvexColumn<{ dataType: 'number', ... }>>>;
```

#### ❌ 4. Mixing Type Tests with Runtime Tests

**Issue:** Vitest allows mixing, but can be confusing

**Why avoid:**
- Different execution models (compile-time vs runtime)
- Harder to understand failures
- Slower feedback loop

**Better approach:** Separate directories:
```
tests/           # Runtime tests
type-tests/      # Compile-time tests
```

### 4.4 MISSING APPROACHES IN OUR PLAN

#### 🆕 1. Testing Type Narrowing

**From:** [TypeScript Conditional Types Guide](https://blog.logrocket.com/guide-conditional-types-typescript/)

**Pattern:**
```typescript
// Test that type guards work correctly
const result = ctx.table('users').get(userId);

if (result !== null) {
  // result should be narrowed to UserDoc here
  Expect<Equal<typeof result, UserDoc>>;
}
```

**For Convex ORM:**
```typescript
const maybeUser = await ctx.table('users').getX('userId', userId).nullable();

if (maybeUser !== null) {
  Expect<Equal<typeof maybeUser, UserDoc>>;
} else {
  Expect<Equal<typeof maybeUser, null>>;
}
```

#### 🆕 2. Testing Discriminated Union Handling

**Pattern:**
```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const result: Result<string> = ...;

if (result.success) {
  Expect<Equal<typeof result.data, string>>;
}
```

**For Convex ORM:** If we have error types:
```typescript
const result = await ctx.table('users').getOrThrow(userId);
Expect<Equal<typeof result, UserDoc>>; // Never throws type

const maybeResult = await ctx.table('users').get(userId);
Expect<Equal<typeof maybeResult, UserDoc | null>>;
```

#### 🆕 3. Testing Recursive Types

**From:** [Advanced TypeScript Generics](https://codezup.com/typescript-generics-advanced-patterns/)

**Pattern:** For deeply nested joins/relations:
```typescript
type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

type Input = { a: { b: { c: string } } };
type Expected = { a?: { b?: { c?: string } } };

Expect<Equal<DeepPartial<Input>, Expected>>;
```

**For Convex ORM:** Testing nested edge loading:
```typescript
const post = await ctx.table('posts')
  .get(postId)
  .include({
    author: true,
    comments: {
      include: {
        author: true
      }
    }
  });

type Expected = {
  ...PostDoc,
  author: UserDoc,
  comments: Array<CommentDoc & { author: UserDoc }>
};

Expect<Equal<typeof post, Expected>>;
```

#### 🆕 4. Testing Generic Constraints

**Pattern:**
```typescript
function onlyNumbers<T extends number>(value: T): T {
  return value;
}

// Should work
onlyNumbers(42);

// @ts-expect-error - should fail
onlyNumbers("string");

// Test constraint propagation
Expect<Equal<Parameters<typeof onlyNumbers>[0], number>>;
```

**For Convex ORM:**
```typescript
// Test that filter builders only accept valid field names
const query = ctx.table('users').filter((q) =>
  q.eq('name', 'Alice') // Should work
);

// @ts-expect-error - invalid field
ctx.table('users').filter((q) => q.eq('nonexistent', 'value'));
```

#### 🆕 5. Testing ThisType and Method Chaining

**Pattern:** Ensure method chaining maintains correct `this` type:
```typescript
class QueryBuilder<T> {
  filter(...): this { return this; }
  sort(...): this { return this; }
  take(n: number): this { return this; }
}

const query = new QueryBuilder<User>()
  .filter(...)
  .sort(...)
  .take(10);

Expect<Equal<typeof query, QueryBuilder<User>>>;
```

**For Convex ORM:** Critical for our builder pattern!
```typescript
const query1 = ctx.table('users').getMany();
Expect<Equal<typeof query1, GetManyQueryBuilder<UserTable>>>;

const query2 = query1.filter(...);
Expect<Equal<typeof query2, FilteredGetManyQueryBuilder<UserTable>>>;

const query3 = query2.take(10);
Expect<Equal<typeof query3, LimitedGetManyQueryBuilder<UserTable>>>;
```

#### 🆕 6. Performance: Testing Type Instantiation Depth

**From:** [TypeScript Type Testing Blog](https://frontendmasters.com/blog/testing-types-in-typescript/)

**Issue:** Complex generic types can hit TypeScript's instantiation depth limit.

**Pattern:**
```typescript
// Test that deeply nested types don't explode
type Deep10 = NestedType<NestedType<NestedType<...>>>; // 10 levels

// Should still compile without error
Expect<Equal<Deep10, ExpectedType>>;
```

**For Convex ORM:** If we have deeply nested edge loading:
```typescript
// Ensure this doesn't hit instantiation limits
const result = await ctx.table('posts')
  .include({ author: { include: { posts: { include: { author: true } } } } });

Expect<Equal<typeof result, ...>>;
```

#### 🆕 7. Testing with Utility Types

**Pattern:** Test interaction with TypeScript's built-in utility types:
```typescript
// Partial
type PartialUser = Partial<UserDoc>;
Expect<Equal<PartialUser, { id?: string; name?: string; ... }>>;

// Pick/Omit
type UserName = Pick<UserDoc, 'name'>;
Expect<Equal<UserName, { name: string }>>;

// Required
type RequiredUser = Required<OptionalUserDoc>;
Expect<Equal<RequiredUser, { id: string; name: string; ... }>>;
```

**For Convex ORM:**
```typescript
// Ensure our types work with standard utilities
type PartialUpdate = Partial<InferInsertModel<typeof users>>;
const update: PartialUpdate = { name: 'Alice' }; // Should work

Expect<Equal<PartialUpdate, { name?: string; age?: number; ... }>>;
```

---

## 5. Recommendations for Convex ORM

### 5.1 Tooling Choice

**Recommendation: Use Drizzle's approach (plain tsc) + add vitest integration later**

**Phase 1: Drizzle-style (MVP)**
```
type-tests/
├── utils.ts              # Expect, Equal utilities
├── query.ts              # Query type tests
├── mutations.ts          # Mutation type tests
└── tsconfig.json         # { noEmit: true }
```

**Run with:**
```json
{
  "scripts": {
    "test:types": "tsc --project type-tests/tsconfig.json"
  }
}
```

**Phase 2: Add vitest integration (optional)**
- Rename to `*.test-d.ts`
- Add `--typecheck` flag
- Enables future runtime + type test integration

**Why this approach:**
1. Start simple (zero dependencies)
2. Proven pattern (Drizzle's success)
3. Fast feedback (tsc is fast)
4. Future-proof (can add vitest later)

### 5.2 Test Structure

```
packages/kitcn/
├── src/
│   └── orm/
│       ├── ...
│       └── types.ts          # Public type exports
│
├── type-tests/
│   ├── utils.ts              # Expect, Equal, ConvexTypeError
│   │
│   ├── schema/
│   │   ├── inference.ts      # Schema -> Doc type inference
│   │   ├── insert.ts         # InsertModel inference
│   │   └── validators.ts     # Validator type checking
│   │
│   ├── query/
│   │   ├── basic.ts          # get, getMany, first, unique
│   │   ├── filtering.ts      # filter, eq, gt, etc.
│   │   ├── ordering.ts       # order, orderDesc
│   │   ├── pagination.ts     # take, skip, paginate
│   │   ├── nullable.ts       # nullable() convention
│   │   └── edge-cases.ts     # Empty results, etc.
│   │
│   ├── mutations/
│   │   ├── insert.ts         # insert type checking
│   │   ├── update.ts         # update type checking
│   │   ├── replace.ts        # replace type checking
│   │   └── delete.ts         # delete type checking
│   │
│   ├── relations/
│   │   ├── edge.ts           # edge() type inference
│   │   ├── backEdge.ts       # backEdge() type inference
│   │   └── include.ts        # include() (if implemented)
│   │
│   ├── indexes/
│   │   ├── getX.ts           # Index-based getters
│   │   ├── getMany.ts        # Index-based queries
│   │   └── withIndex.ts      # withIndex() type checking
│   │
│   ├── edge-cases/
│   │   ├── no-strict-null-checks.ts
│   │   ├── generated-columns.ts  # If applicable
│   │   └── circular-refs.ts      # If applicable
│   │
│   └── tsconfig.json
│
└── tests/
    └── orm/                  # Runtime tests (separate)
```

### 5.3 Priority Test Coverage

**Must Have (M5):**
1. ✅ Basic query type inference (get, getMany, first, unique)
2. ✅ Nullable convention (.nullable() affects return type)
3. ✅ Filter type safety (only valid fields, correct operators)
4. ✅ Order type safety (only valid fields)
5. ✅ Pagination (take, skip)
6. ✅ Insert type checking (required fields, correct types)
7. ✅ Update type checking (optional fields, correct types)
8. ✅ Edge relationships (edge type inference)
9. ✅ Negative tests (@ts-expect-error for invalid usage)

**Should Have (M6):**
10. Index-based queries (getX, getMany with indexes)
11. Complex filtering (and, or, not)
12. Nested edge loading (include, if supported)
13. Custom type errors (ConvexTypeError)
14. Type narrowing (non-null assertions)
15. Generic query builders (dynamic queries)

**Nice to Have (M7+):**
16. Recursive relations
17. Discriminated unions
18. Performance tests (instantiation depth)
19. Utility type compatibility (Partial, Pick, etc.)
20. no-strict-null-checks compatibility

### 5.4 Example Implementation

**File:** `type-tests/utils.ts`
```typescript
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;

/**
 * Branded error type for better error messages.
 */
export interface ConvexTypeError<T extends string> {
  $convexTypeError: T;
  $errorDetails: T;
}
```

**File:** `type-tests/query/basic.ts`
```typescript
import { Expect, Equal } from '../utils';
import { ctx } from './test-db';

// Test: get() returns Doc | null
const user = await ctx.table('users').get(userId);
Expect<Equal<typeof user, UserDoc | null>>;

// Test: getMany() returns Doc[]
const users = await ctx.table('users').getMany();
Expect<Equal<typeof users, UserDoc[]>>;

// Test: first() returns Doc | null
const firstUser = await ctx.table('users').getMany().first();
Expect<Equal<typeof firstUser, UserDoc | null>>;

// Test: nullable() adds null to array type
const nullableUsers = await ctx.table('users').getMany().nullable();
Expect<Equal<typeof nullableUsers, (UserDoc | null)[]>>;

// Test: unique() with nullable
const uniqueUser = await ctx.table('users').getMany().unique().nullable();
Expect<Equal<typeof uniqueUser, UserDoc | null>>;

// Negative tests
// @ts-expect-error - can't call nullable twice
ctx.table('users').getMany().nullable().nullable();

// @ts-expect-error - can't filter after unique
ctx.table('users').getMany().unique().filter(...);
```

**File:** `type-tests/query/filtering.ts`
```typescript
import { Expect, Equal } from '../utils';
import { ctx } from './test-db';

// Test: filter maintains type
const filtered = await ctx.table('users')
  .getMany()
  .filter((q) => q.eq('name', 'Alice'));

Expect<Equal<typeof filtered, UserDoc[]>>;

// Test: chained filters
const chained = await ctx.table('users')
  .getMany()
  .filter((q) => q.eq('name', 'Alice'))
  .filter((q) => q.gt('age', 18));

Expect<Equal<typeof chained, UserDoc[]>>;

// Negative tests
// @ts-expect-error - invalid field name
ctx.table('users').getMany().filter((q) => q.eq('nonexistent', 'value'));

// @ts-expect-error - wrong type for field
ctx.table('users').getMany().filter((q) => q.eq('age', 'not-a-number'));

// @ts-expect-error - can't filter after take
ctx.table('users').getMany().take(10).filter((q) => q.eq('name', 'Alice'));
```

**File:** `type-tests/mutations/insert.ts`
```typescript
import { Expect, Equal } from '../utils';
import { ctx } from './test-db';

// Test: insert requires all required fields
const insertResult = await ctx.table('users').insert({
  name: 'Alice',
  age: 30,
  email: 'alice@example.com',
});

Expect<Equal<typeof insertResult, string>>; // Returns ID

// Test: optional fields are optional
const insertWithOptional = await ctx.table('users').insert({
  name: 'Bob',
  age: 25,
  // email is optional
});

Expect<Equal<typeof insertWithOptional, string>>;

// Negative tests
// @ts-expect-error - missing required field
ctx.table('users').insert({
  name: 'Charlie',
  // age is required
});

// @ts-expect-error - wrong type
ctx.table('users').insert({
  name: 'Dave',
  age: 'not-a-number',
});

// @ts-expect-error - can't insert generated fields
ctx.table('users').insert({
  id: 'custom-id', // id is generated
  name: 'Eve',
  age: 30,
});
```

**File:** `type-tests/relations/edge.ts`
```typescript
import { Expect, Equal } from '../utils';
import { ctx } from './test-db';

// Test: edge() returns related document
const post = await ctx.table('posts').get(postId);
const author = await post?.edge('author');

Expect<Equal<typeof author, UserDoc | null>>;

// Test: edge() on non-nullable post
const definitePost = await ctx.table('posts').getOrThrow(postId);
const definiteAuthor = await definitePost.edge('author');

Expect<Equal<typeof definiteAuthor, UserDoc | null>>;

// Test: backEdge returns array
const userPosts = await user.backEdge('posts');
Expect<Equal<typeof userPosts, PostDoc[]>>;

// Negative tests
// @ts-expect-error - invalid edge name
post?.edge('nonexistent');

// @ts-expect-error - can't use edge on query builder
ctx.table('posts').getMany().edge('author');
```

**File:** `type-tests/edge-cases/custom-errors.ts`
```typescript
import { Expect, Equal, ConvexTypeError } from '../utils';
import { ctx } from './test-db';

// Test: Attempting to filter after take produces helpful error
type FilterAfterTake = ReturnType<
  typeof ctx.table<'users'>('users').getMany().take(10).filter
>;

Expect<
  FilterAfterTake extends ConvexTypeError<infer Msg>
    ? Msg extends string
      ? true
      : false
    : false
>;

// Test: Error message is descriptive
Expect<
  Equal<
    FilterAfterTake,
    ConvexTypeError<'Cannot filter after take/first - apply filters before limiting results'>
  >
>;
```

### 5.5 CI Integration

**Add to `.github/workflows/test.yml`:**
```yaml
- name: Type Tests
  run: npm run test:types
```

**Or with Turborepo:**
```json
{
  "tasks": {
    "test:types": {
      "cache": false,
      "dependsOn": ["^build"]
    }
  }
}
```

---

## 6. Sources

### Drizzle ORM
- Repository: https://github.com/drizzle-team/drizzle-orm
- Contributing Guide: /tmp/cc-repos/drizzle-orm/CONTRIBUTING.md
- Type Tests: /tmp/cc-repos/drizzle-orm/drizzle-orm/type-tests/

### Vitest
- [Testing Types | Guide | Vitest](https://vitest.dev/guide/testing-types)
- [expectTypeOf | Vitest](https://vitest.dev/api/expect-typeof)

### TypeScript Type Testing
- [Testing Types in TypeScript – Frontend Masters Blog](https://frontendmasters.com/blog/testing-types-in-typescript/)
- [A Deep Dive into Typescript Type Testing](https://www.empathetic.dev/test-typescript-types)
- [How to use @ts-expect-error | Total TypeScript](https://www.totaltypescript.com/concepts/how-to-use-ts-expect-error)
- [TypeScript 3.9 Release Notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html)

### Type Testing Libraries
- [tsd - Check TypeScript type definitions](https://github.com/tsdjs/tsd)
- [tsd-lite - Test your TypeScript types easily](https://github.com/mrazauskas/tsd-lite)
- [conditional-type-checks - Types for testing TypeScript types](https://github.com/dsherret/conditional-type-checks)
- [eslint-plugin-expect-type](https://effectivetypescript.com/2022/05/28/eslint-plugin-expect-type/)

### Advanced TypeScript Patterns
- [TypeScript: Documentation - Conditional Types](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html)
- [TypeScript: Documentation - Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Mastering TypeScript Generics: Conditions, Mappings, and Inference | Leapcell](https://leapcell.io/blog/mastering-typescript-generics-conditions-mappings-and-inference)
- [The guide to conditional types in TypeScript - LogRocket Blog](https://blog.logrocket.com/guide-conditional-types-typescript/)
- [Understanding infer in TypeScript - LogRocket Blog](https://blog.logrocket.com/understanding-infer-typescript/)
- [Master TypeScript Generics: Advanced Patterns & Use Cases | Codez Up](https://codezup.com/typescript-generics-advanced-patterns/)

### Known Issues
- [Method overloads with mapped types + conditional generics · Issue #62377](https://github.com/microsoft/TypeScript/issues/62377)
- [@ts-expect-error in multi-line JSX leads to false-positive · Issue #49972](https://github.com/microsoft/TypeScript/issues/49972)

---

## 7. Action Items

### Immediate (M5 - Type Testing Infrastructure)

1. **Create test infrastructure:**
   - [ ] Create `packages/kitcn/type-tests/` directory
   - [ ] Add `utils.ts` with `Expect`, `Equal`, `ConvexTypeError`
   - [ ] Add `tsconfig.json` for type tests
   - [ ] Add `package.json` script: `"test:types": "tsc --project type-tests"`

2. **Write core type tests (priority order):**
   - [ ] `query/basic.ts` - get, getMany, first, unique
   - [ ] `query/nullable.ts` - .nullable() convention
   - [ ] `query/filtering.ts` - filter type safety
   - [ ] `mutations/insert.ts` - insert type checking
   - [ ] `relations/edge.ts` - edge type inference
   - [ ] Negative tests for each category

3. **Documentation:**
   - [ ] Add type testing section to CONTRIBUTING.md
   - [ ] Document test patterns for new features
   - [ ] Add examples to PR template

### Short-term (M6 - Extended Coverage)

4. **Add advanced type tests:**
   - [ ] `query/pagination.ts` - take, skip, paginate
   - [ ] `query/ordering.ts` - order, orderDesc
   - [ ] `mutations/update.ts` - update type checking
   - [ ] `indexes/getX.ts` - index-based queries
   - [ ] `edge-cases/custom-errors.ts` - ConvexTypeError tests

5. **CI Integration:**
   - [ ] Add type tests to GitHub Actions workflow
   - [ ] Add pre-commit hook for type tests
   - [ ] Configure Turborepo to run type tests

### Long-term (M7+ - Polish)

6. **Enhanced testing:**
   - [ ] Add `edge-cases/no-strict-null-checks.ts`
   - [ ] Test recursive relations (if supported)
   - [ ] Test performance (instantiation depth)
   - [ ] Consider vitest integration for unified test experience

7. **Developer Experience:**
   - [ ] Create VSCode snippets for writing type tests
   - [ ] Add watch mode for type tests during development
   - [ ] Generate type test coverage report

---

## Appendix A: Example Equal Type Implementations

### Option 1: Drizzle/Standard (Recommended)
```typescript
export type Equal<X, Y extends X> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2)
    ? true
    : false;
```

**Pros:** Used by Zod, TanStack Query, zustand, etc. Well-tested in production.

### Option 2: Array-based (Alternative)
```typescript
export type Equal<T, U> =
  T[] extends U[]
    ? U[] extends T[]
      ? true
      : false
    : false;
```

**Pros:** Simpler to understand. **Cons:** May miss edge cases with branded types.

### Option 3: ts-expect-error helper (For negative tests)
```typescript
export type ExpectError<T> = T extends { error: infer E } ? E : never;
```

**Usage:** Test that error messages appear in types.

---

## Appendix B: Test Template

```typescript
/**
 * Type tests for [feature name]
 *
 * Tests:
 * - [ ] Positive: [Feature] works with valid inputs
 * - [ ] Inference: Return type is correctly inferred
 * - [ ] Chaining: Method chaining maintains types
 * - [ ] Negative: Invalid usage produces errors
 * - [ ] Edge cases: Boundary conditions handled
 */

import { Expect, Equal, ConvexTypeError } from '../utils';
import { ctx } from './test-db';

// ============================================================================
// Positive Tests
// ============================================================================

{
  // Test: [Description]
  const result = await ctx.table('users').someMethod();

  Expect<Equal<typeof result, ExpectedType>>;
}

// ============================================================================
// Type Inference Tests
// ============================================================================

{
  // Test: [Description]
  const inferred = await ctx.table('users').chainedMethod().anotherMethod();

  Expect<Equal<typeof inferred, InferredType>>;
}

// ============================================================================
// Negative Tests
// ============================================================================

{
  // @ts-expect-error - [Explanation of why this should fail]
  ctx.table('users').invalidUsage();
}

// ============================================================================
// Edge Cases
// ============================================================================

{
  // Test: [Description of edge case]
  const edge = await ctx.table('users').edgeCase();

  Expect<Equal<typeof edge, EdgeCaseType>>;
}
```

---

**End of Research Document**
