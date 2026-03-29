import type { GenericDatabaseWriter } from 'convex/server';
import {
  createOrm,
  defineRelations,
  extractRelationsConfig,
  type InsertValue,
  unsetToken,
} from 'kitcn/orm';
import { UserRow } from './fixtures/types';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny, Not } from './utils';

const schemaConfig = defineRelations({ users });
const edgeMetadata = extractRelationsConfig(schemaConfig);
const mockDb = {} as GenericDatabaseWriter<any>;
const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

const baseUserInsert = {
  name: 'Alice',
  email: 'alice@example.com',
  height: null,
  status: null,
  role: null,
  deletedAt: null,
  age: null,
  cityId: null,
  homeCityId: null,
} satisfies InsertValue<typeof users>;

// ============================================================================
// INSERT TYPE TESTS
// ============================================================================

// Test 1: insert without returning
{
  const result = await db.insert(users).values({
    ...baseUserInsert,
  });

  Expect<Equal<undefined, typeof result>>;
}

// Test 2: insert returning all
{
  const result = await db
    .insert(users)
    .values({
      ...baseUserInsert,
    })
    .returning();

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: insert returning partial
{
  const result = await db
    .insert(users)
    .values({
      ...baseUserInsert,
    })
    .returning({
      name: users.name,
      city: users.cityId,
    });

  type Expected = Array<{
    name: string;
    city: string | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: onConflictDoNothing keeps returning type
{
  const result = await db
    .insert(users)
    .values({
      ...baseUserInsert,
    })
    .onConflictDoNothing({ target: users.name })
    .returning();

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: onConflictDoUpdate keeps returning type
{
  const result = await db
    .insert(users)
    .values({
      ...baseUserInsert,
    })
    .onConflictDoUpdate({
      target: users.name,
      set: { name: 'Updated' },
    })
    .returning({
      name: users.name,
    });

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 6: returning() cannot be called twice
{
  db.insert(users)
    .values({
      ...baseUserInsert,
    })
    .returning()
    // @ts-expect-error - returning already called
    .returning();
}

// ============================================================================
// NEGATIVE TYPE TESTS
// ============================================================================

// Missing required notNull field (name)
{
  db.insert(users).values(
    // @ts-expect-error - name is required
    {
      email: 'alice@example.com',
    }
  );
}

// values() requires an argument
{
  // @ts-expect-error - values() requires at least one value
  db.insert(users).values(undefined);
  // @ts-expect-error - values() requires an argument
  db.insert(users).values();
}

// Missing required notNull field (email)
{
  db.insert(users).values(
    // @ts-expect-error - email is required
    {
      name: 'Alice',
    }
  );
}

// Extra property should be rejected
{
  db.insert(users).values({
    ...baseUserInsert,
    // @ts-expect-error - extra field not allowed
    nope: 123,
  });
}

// Wrong type for name
{
  db.insert(users).values({
    ...baseUserInsert,
    // @ts-expect-error - name must be string
    name: 123,
  });
}

// Wrong type for cityId
{
  db.insert(users).values({
    ...baseUserInsert,
    // @ts-expect-error - cityId must be string | null
    cityId: 123,
  });
}

// onConflictDoNothing target must be a column builder
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoNothing({
      // @ts-expect-error - target must be a column builder
      target: 'name',
    });
}

// onConflictDoUpdate requires target
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate(
      // @ts-expect-error - target is required
      {
        set: { name: 'Updated' },
      }
    );
}

// onConflictDoUpdate requires set
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate(
      // @ts-expect-error - set is required
      {
        target: users.name,
      }
    );
}

// onConflictDoUpdate set must use valid fields and types
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate({
      target: users.name,
      set: {
        // @ts-expect-error - invalid field in set
        nope: 'value',
      },
    });

  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate({
      target: users.name,
      set: {
        // @ts-expect-error - age expects number | null
        age: 'not-a-number',
      },
    });
}

// onConflictDoUpdate set should allow unsetToken for nullable fields
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate({
      target: users.name,
      set: { age: unsetToken },
    });
}

// onConflictDoUpdate set should not allow unsetToken for notNull fields
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .onConflictDoUpdate({
      target: users.name,
      set: {
        // @ts-expect-error - cannot unset notNull column
        name: unsetToken,
      },
    });
}

// returning selection must use column builders
{
  db.insert(users)
    .values({ ...baseUserInsert })
    .returning({
      name: users.name,
      // @ts-expect-error - returning selection must be a column builder
      invalid: 'nope',
    });
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// InsertValue should not be any
{
  type Insert = InsertValue<typeof users>;
  Expect<Not<IsAny<Insert>>>;
}

// Returning row type should not be any
{
  const result = await db
    .insert(users)
    .values({ ...baseUserInsert })
    .returning();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

export {};
