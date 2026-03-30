import type { GenericDatabaseWriter } from 'convex/server';
import {
  createOrm,
  defineRelations,
  eq,
  extractRelationsConfig,
  type UpdateSet,
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

const baseUpdate = {
  name: 'Alice',
} satisfies UpdateSet<typeof users>;

// ============================================================================
// UPDATE TYPE TESTS
// ============================================================================

// Test 1: update without returning
{
  const result = await db.update(users).set({ ...baseUpdate });

  Expect<Equal<undefined, typeof result>>;
}

// Test 2: update with where clause
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .where(eq(users.name, 'Alice'));

  Expect<Equal<undefined, typeof result>>;
}

// Test 3: update returning all
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .returning();

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: update returning partial
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .returning({
      name: users.name,
    });

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: returning() cannot be called twice
{
  db.update(users)
    .set({ ...baseUpdate })
    .returning()
    // @ts-expect-error - returning already called
    .returning();
}

// Test 6: paginated update without returning
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .paginate({ cursor: null, limit: 10 });

  type Expected = {
    continueCursor: string | null;
    isDone: boolean;
    numAffected: number;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 7: paginated update with returning
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .returning({ name: users.name })
    .paginate({ cursor: null, limit: 10 });

  type Expected = {
    continueCursor: string | null;
    isDone: boolean;
    numAffected: number;
    page: Array<{
      name: string;
    }>;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 8: executeAsync without returning matches execute() result type
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .allowFullScan()
    .executeAsync();

  Expect<Equal<undefined, typeof result>>;
}

// Test 9: executeAsync with returning matches execute() result type
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .allowFullScan()
    .returning({
      name: users.name,
    })
    .executeAsync();

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 10: execute({ mode: 'async' }) matches executeAsync() result type
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .allowFullScan()
    .returning({
      name: users.name,
    })
    .execute({ mode: 'async' });

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// NEGATIVE TYPE TESTS
// ============================================================================

// set() should reject unknown fields
{
  db.update(users).set({
    // @ts-expect-error - unknown field
    nope: 'value',
  });
}

// set() requires an argument
{
  // @ts-expect-error - set() requires values
  db.update(users).set();
}

// set() should enforce value types
{
  db.update(users).set({
    // @ts-expect-error - name must be string
    name: 123,
  });
}

// set() should allow unsetToken for nullable fields
{
  db.update(users).set({
    age: unsetToken,
  });
}

// set() should not accept null for notNull field
{
  db.update(users).set({
    // @ts-expect-error - name cannot be null
    name: null,
  });
}

// set() should not allow unsetToken for notNull fields
{
  db.update(users).set({
    // @ts-expect-error - cannot unset notNull column
    name: unsetToken,
  });
}

// where() should enforce column value types
{
  db.update(users)
    .set({ ...baseUpdate })
    // @ts-expect-error - age expects number
    .where(eq(users.age, 'not-a-number'));
}

// where() requires an argument
{
  db.update(users)
    .set({ ...baseUpdate })
    // @ts-expect-error - where() requires a filter expression
    .where();
}

// paginate() should reject invalid cursor type
{
  db.update(users)
    .set({ ...baseUpdate })
    // @ts-expect-error - cursor must be string | null
    .paginate({ cursor: 123, limit: 10 });
}

// paginate() should reject invalid limit type
{
  db.update(users)
    .set({ ...baseUpdate })
    // @ts-expect-error - limit must be number
    .paginate({ cursor: null, limit: '10' });
}

// paginate() cannot be called twice
{
  db.update(users)
    .set({ ...baseUpdate })
    .paginate({ cursor: null, limit: 10 })
    // @ts-expect-error - paginate already called
    .paginate({ cursor: null, limit: 10 });
}

// executeAsync() is not available on paginated update builders
{
  db.update(users)
    .set({ ...baseUpdate })
    .paginate({ cursor: null, limit: 10 })
    // @ts-expect-error - executeAsync is not available after paginate()
    .executeAsync();
}

// execute(config) is not available on paginated update builders
{
  const pagedUpdate = db
    .update(users)
    .set({ ...baseUpdate })
    .paginate({ cursor: null, limit: 10 });
  // @ts-expect-error - execute config is not available after paginate()
  pagedUpdate.execute({ mode: 'async' });
}

// execute() requires where() or allowFullScan()
{
  const unsafeUpdate = db.update(users).set({ ...baseUpdate });
  // @ts-expect-error - execute requires where() or allowFullScan()
  unsafeUpdate.execute();
}

// executeAsync() requires where() or allowFullScan()
{
  const unsafeUpdate = db.update(users).set({ ...baseUpdate });
  // @ts-expect-error - executeAsync requires where() or allowFullScan()
  unsafeUpdate.executeAsync();
}

// returning selection must use column builders
{
  db.update(users)
    .set({ ...baseUpdate })
    .returning({
      name: users.name,
      // @ts-expect-error - returning selection must be a column builder
      invalid: 'nope',
    });
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// UpdateSet should not be any
{
  type Set = UpdateSet<typeof users>;
  Expect<Not<IsAny<Set>>>;
}

// Returning row type should not be any
{
  const result = await db
    .update(users)
    .set({ ...baseUpdate })
    .returning();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

export {};
