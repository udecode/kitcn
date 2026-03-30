/**
 * Table Inference Type Tests
 *
 * Comprehensive tests for InferSelectModel, InferInsertModel, and column builders.
 * Mirrors Drizzle ORM patterns and includes institutional learnings.
 */

import type { GenericId } from 'convex/values';
import {
  bigint,
  boolean,
  type ConvexTable,
  convexTable,
  defineSchema,
  deletion,
  foreignKey,
  type InferInsertModel,
  type InferSelectModel,
  id,
  index,
  integer,
  searchIndex,
  text,
  unique,
  uniqueIndex,
  vector,
  vectorIndex,
} from 'kitcn/orm';
import { type Equal, Expect, IsAny, IsNever, Not } from './utils';

// ============================================================================
// A. INFERSELECTMODEL TESTS
// ============================================================================

// Test 1: InferSelectModel equivalence with $inferSelect property
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferSelectModel<typeof users>;
  type FromProperty = (typeof users)['$inferSelect'];

  Expect<Equal<Result, FromProperty>>;
}

// Test 2: InferSelectModel equivalence with _['inferSelect'] property
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferSelectModel<typeof users>;
  type FromBrand = (typeof users)['_']['inferSelect'];

  Expect<Equal<Result, FromBrand>>;
}

// Test 3: System fields always present (id, createdAt)
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type Result = InferSelectModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        name: string;
      }
    >
  >;
}

// Test 6f: defineSchema defaults support mutation async execution options
{
  const users = convexTable('users', {
    slug: text().notNull(),
  });

  defineSchema(
    {
      users,
    },
    {
      defaults: {
        mutationExecutionMode: 'async',
        mutationAsyncDelayMs: 0,
      },
    }
  );
}

{
  const users = convexTable(
    'scheduled_users',
    {
      slug: text().notNull(),
      deletionTime: integer(),
    },
    () => [deletion('scheduled', { delayMs: 60_000 })]
  );

  defineSchema({ users });
}

{
  const users = convexTable(
    'soft_users',
    {
      slug: text().notNull(),
      deletionTime: integer(),
    },
    () => [deletion('soft')]
  );

  defineSchema({ users });
}

{
  const users = convexTable('invalid_mode_users', {
    slug: text().notNull(),
  });

  defineSchema({
    users,
  });

  // @ts-expect-error - invalid deletion mode
  deletion('eventual');
}

{
  const users = convexTable('users', {
    slug: text().notNull(),
  });

  defineSchema(
    {
      users,
    },
    {
      defaults: {
        // @ts-expect-error - invalid mutation execution mode
        mutationExecutionMode: 'eventual',
      },
    }
  );
}

// Test 4: NotNull vs nullable field types
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(), // nullable by default
  });

  type Result = InferSelectModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        name: string; // NOT string | null
        age: number | null; // nullable
      }
    >
  >;
}

// Test 5: GenericId brand preservation (no widening to string)
{
  const users = convexTable('users', {
    cityId: id('cities').notNull(),
  });

  type Result = InferSelectModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        cityId: GenericId<'cities'>; // NOT string
      }
    >
  >;
}

// Test 6: All column builder types
{
  const entities = convexTable('entities', {
    textField: text().notNull(),
    intField: integer(),
    boolField: boolean().notNull(),
    bigintField: bigint(),
    idField: id('other').notNull(),
    numberField: integer(),
    vectorField: vector(1536),
  });

  type Result = InferSelectModel<typeof entities>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        textField: string;
        intField: number | null;
        boolField: boolean;
        bigintField: bigint | null;
        idField: GenericId<'other'>;
        numberField: number | null;
        vectorField: number[] | null;
      }
    >
  >;
}

// ============================================================================
// B. INFERINSERTMODEL TESTS
// ============================================================================

// Test 6b: Drizzle-style indexes in table definition
{
  const users = convexTable(
    'users',
    {
      name: text().notNull(),
      email: text().notNull(),
    },
    (t) => [
      index('users_name_idx').on(t.name),
      uniqueIndex('users_email_idx').on(t.email),
    ]
  );

  type Result = InferSelectModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        name: string;
        email: string;
      }
    >
  >;
}

// Test 6c: Search/vector index builders in extraConfig
{
  const posts = convexTable(
    'posts',
    {
      text: text().notNull(),
      type: text().notNull(),
      embedding: vector(1536).notNull(),
    },
    (t) => [
      searchIndex('text_search').on(t.text).filter(t.type),
      vectorIndex('embedding_vec')
        .on(t.embedding)
        .dimensions(1536)
        .filter(t.type),
    ]
  );

  type Result = InferSelectModel<typeof posts>;
  type VectorIndexes =
    typeof posts extends ConvexTable<any, any, any, infer TVectorIndexes>
      ? TVectorIndexes
      : never;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        text: string;
        type: string;
        embedding: number[];
      }
    >
  >;

  Expect<Equal<keyof VectorIndexes, 'embedding_vec'>>;
  Expect<Equal<VectorIndexes['embedding_vec']['vectorField'], 'embedding'>>;
  Expect<Equal<VectorIndexes['embedding_vec']['filterFields'], 'type'>>;
}

// Test 6d: unique() constraint + column unique()
{
  const users = convexTable(
    'users',
    {
      email: text().notNull().unique(),
      handle: text().unique('handle_unique', { nulls: 'not distinct' }),
    },
    (t) => [unique('unique_email').on(t.email)]
  );

  type Result = InferSelectModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        email: string;
        handle: string | null;
      }
    >
  >;
}

// Test 6e: foreignKey() constraint typing
{
  const users = convexTable('users', {
    slug: text().notNull(),
  });

  const memberships = convexTable(
    'memberships',
    {
      userSlug: text().notNull(),
    },
    (t) => [
      foreignKey({ columns: [t.userSlug], foreignColumns: [users.slug] })
        .onDelete('cascade')
        .onUpdate('restrict'),
    ]
  );

  type Result = InferSelectModel<typeof memberships>;

  Expect<
    Equal<
      Result,
      {
        id: string;
        createdAt: number;
        userSlug: string;
      }
    >
  >;
}

convexTable(
  'users',
  {
    name: text().notNull(),
  },
  // @ts-expect-error - index() must be followed by .on(...)
  () => [index('missing_on')]
);

convexTable(
  'users',
  {
    name: text().notNull(),
  },
  // @ts-expect-error - searchIndex() must be followed by .on(...)
  () => [searchIndex('missing_on')]
);

convexTable(
  'users',
  {
    embedding: vector(1536),
  },
  // @ts-expect-error - vectorIndex() must be followed by .on(...)
  () => [vectorIndex('missing_on')]
);

convexTable(
  'users',
  {
    name: text().notNull(),
  },
  // @ts-expect-error - unique() must be followed by .on(...)
  () => [unique('missing_on')]
);

convexTable(
  'users',
  {
    slug: text().notNull(),
  },
  // @ts-expect-error - foreignKey() requires at least one column
  () => [foreignKey({ columns: [], foreignColumns: [] })]
);

convexTable(
  'users',
  {
    slug: text().notNull(),
    other: text().notNull(),
  },
  // @ts-expect-error - foreignColumns must match columns length
  (t) => [foreignKey({ columns: [t.slug], foreignColumns: [t.slug, t.other] })]
);

convexTable(
  'users',
  {
    slug: text().notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.slug], foreignColumns: [t.slug] }).onDelete(
      // @ts-expect-error - invalid foreign key action
      'invalid'
    ),
  ]
);

// @ts-expect-error - index().on requires at least one column
index('missing_columns').on();

// Test 7: InferInsertModel equivalence with $inferInsert property
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferInsertModel<typeof users>;
  type FromProperty = (typeof users)['$inferInsert'];

  Expect<Equal<Result, FromProperty>>;
}

// Test 8: InferInsertModel equivalence with _['inferInsert'] property
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferInsertModel<typeof users>;
  type FromBrand = (typeof users)['_']['inferInsert'];

  Expect<Equal<Result, FromBrand>>;
}

// Test 9: No system fields in insert (id, createdAt excluded)
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Result = InferInsertModel<typeof users>;

  Expect<
    Equal<
      Result,
      {
        name: string;
        age?: number | null; // Nullable fields are optional
      }
    >
  >;

  // Verify id and createdAt are not present
  type HasId = 'id' extends keyof Result ? true : false;
  type HasCreationTime = 'createdAt' extends keyof Result ? true : false;

  Expect<Equal<HasId, false>>;
  Expect<Equal<HasCreationTime, false>>;
}

// Test 10: NotNull vs nullable fields in insert
{
  const users = convexTable('users', {
    name: text().notNull(),
    email: text().notNull(),
    age: integer(), // nullable = includes | null
    bio: text(), // nullable = includes | null
  });

  type Result = InferInsertModel<typeof users>;

  // NotNull fields don't include null
  type NotNullKeys = keyof {
    [K in keyof Result as null extends Result[K] ? never : K]: Result[K];
  };
  Expect<Equal<NotNullKeys, 'name' | 'email'>>;

  // Nullable fields include | null
  type NullableKeys = keyof {
    [K in keyof Result as null extends Result[K] ? K : never]: Result[K];
  };
  Expect<Equal<NullableKeys, 'age' | 'bio'>>;
}

// Test 11: Default values still nullable in insert
{
  const posts = convexTable('posts', {
    title: text().notNull(),
    status: text().default('draft'),
  });

  type Insert = InferInsertModel<typeof posts>;

  Expect<
    Equal<
      Insert,
      {
        title: string;
        status?: string | null; // Defaults make fields optional
      }
    >
  >;
}

// ============================================================================
// C. COLUMN BUILDER TESTS
// ============================================================================

// Test 12: text().notNull() type inference
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type NameType = User['name'];

  Expect<Equal<NameType, string>>;
}

// Test 13: integer() nullable by default
{
  const users = convexTable('users', {
    age: integer(),
  });

  type User = InferSelectModel<typeof users>;
  type AgeType = User['age'];

  Expect<Equal<AgeType, number | null>>;
}

// Test 14: boolean().default(true) type inference
{
  const posts = convexTable('posts', {
    published: boolean().default(true),
  });

  type Post = InferSelectModel<typeof posts>;
  type PublishedType = Post['published'];

  Expect<Equal<PublishedType, boolean | null>>;
}

// Test 15: id('table').notNull() GenericId inference
{
  const posts = convexTable('posts', {
    authorId: id('users').notNull(),
  });

  type Post = InferSelectModel<typeof posts>;
  type AuthorIdType = Post['authorId'];

  Expect<Equal<AuthorIdType, GenericId<'users'>>>;
}

// Test 15b: references() keeps column type
{
  const users = convexTable('users', {
    slug: text().notNull(),
  });

  const profiles = convexTable('profiles', {
    userSlug: text().references(() => users.slug),
  });

  type Profile = InferSelectModel<typeof profiles>;
  type UserSlugType = Profile['userSlug'];

  Expect<Equal<UserSlugType, string | null>>;
}

// Test 16: bigint() nullable type
{
  const users = convexTable('users', {
    balance: bigint(),
  });

  type User = InferSelectModel<typeof users>;
  type BalanceType = User['balance'];

  Expect<Equal<BalanceType, bigint | null>>;
}

// Test 17: integer() numeric inference
{
  const entities = convexTable('entities', {
    intValue: integer(),
    numValue: integer(),
  });

  type Entity = InferSelectModel<typeof entities>;

  // Both fields infer to nullable number
  Expect<Equal<Entity['intValue'], number | null>>;
  Expect<Equal<Entity['numValue'], number | null>>;
}

// ============================================================================
// D. NEGATIVE TESTS
// ============================================================================

// Test 18: @ts-expect-error - Invalid column access
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  // @ts-expect-error - Property 'invalidColumn' does not exist
  type Invalid = (typeof users)['_']['columns']['invalidColumn'];
}

// Test 19: @ts-expect-error - Type mismatch in column definition
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;

  const invalidUser: User = {
    id: '123' as string,
    createdAt: 123,
    // @ts-expect-error - Type 'number' is not assignable to type 'string'
    name: 456, // Should be string, not number
  };
}

// Test 20: @ts-expect-error - Duplicate column names
{
  // TypeScript reports duplicate property error in object literal
  const duplicateTest = convexTable('duplicateTest', {
    name: text().notNull(),
    // @ts-expect-error - An object literal cannot have multiple properties with the same name
    name: integer(),
  });
}

// ============================================================================
// E. INSTITUTIONAL LEARNING TESTS
// ============================================================================

// Test 21: Merge utility preservation
// Verify InferSelectModel uses Merge<>, not &
// From: docs/solutions/typescript-patterns/phantom-type-brand-preservation-20260202.md
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type NameField = User['name'];

  // Should be `string`, NOT `never` (proves Merge used, not &)
  Expect<Equal<NameField, string>>;
}

// Test 22: No index signature pollution
// Verify `keyof Columns` returns union type, not `string`
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type Columns = (typeof users)['_']['columns'];
  type Keys = keyof Columns;

  // Should be 'name' | 'age', NOT 'string'
  Expect<Equal<Keys, 'name' | 'age'>>;

  // Verify no index signature
  type HasIndexSignature = string extends Keys ? true : false;
  Expect<Equal<HasIndexSignature, false>>;
}

// Test 23: GenericId brand preservation
// GenericId<'cities'> doesn't widen to `string`
{
  const users = convexTable('users', {
    cityId: id('cities').notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type CityId = User['cityId'];

  // Should be GenericId<'cities'>, NOT string
  Expect<Equal<CityId, GenericId<'cities'>>>;

  // Verify brand not widened
  type IsString = string extends CityId ? true : false;
  Expect<Equal<IsString, false>>;
}

// Test 24: Phantom properties exist
// Verify `_` properties exist in intermediate types
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type NameBuilder = typeof users.name;
  type HasPhantom = '_' extends keyof NameBuilder ? true : false;
  Expect<Equal<HasPhantom, true>>;
}

// ============================================================================
// F. ENHANCED TEST UTILITIES (validation only, utils.ts updated separately)
// ============================================================================

// Test 25: Not<> utility for explicit negation
{
  Expect<Not<Equal<string, number>>>;
  Expect<Not<Equal<number, string | number>>>;
}

// Test 26: IsAny<> utility to catch 'any' leaks
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;

  // InferSelectModel should NOT return 'any'
  Expect<Not<IsAny<User>>>;
}

// Test 27: IsNever<> utility to catch 'never' types
{
  const users = convexTable('users', {
    name: text().notNull(),
  });

  type User = InferSelectModel<typeof users>;
  type NameType = User['name'];

  // Name should NOT be 'never'
  Expect<Not<IsNever<NameType>>>;
}

// Test 28: Combined utility validation
{
  const users = convexTable('users', {
    name: text().notNull(),
    age: integer(),
  });

  type User = InferSelectModel<typeof users>;

  // Full type shouldn't be 'any' or 'never'
  Expect<Not<IsAny<User>>>;
  Expect<Not<IsNever<User>>>;

  // Individual fields shouldn't be 'any' or 'never'
  Expect<Not<IsAny<User['name']>>>;
  Expect<Not<IsNever<User['name']>>>;
  Expect<Not<IsAny<User['age']>>>;
  Expect<Not<IsNever<User['age']>>>;
}

export {};
