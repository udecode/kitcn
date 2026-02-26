import {
  createOrm,
  defineRelations,
  eq,
  extractRelationsConfig,
} from 'better-convex/orm';
import type { GenericDatabaseWriter } from 'convex/server';
import { UserRow } from './fixtures/types';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny, Not } from './utils';

const schemaConfig = defineRelations({ users });
const edgeMetadata = extractRelationsConfig(schemaConfig);
const mockDb = {} as GenericDatabaseWriter<any>;
const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

// ============================================================================
// DELETE TYPE TESTS
// ============================================================================

// Test 1: delete without returning
{
  const result = await db.delete(users);

  Expect<Equal<undefined, typeof result>>;
}

// Test 2: delete with where clause
{
  const result = await db.delete(users).where(eq(users.name, 'Alice'));

  Expect<Equal<undefined, typeof result>>;
}

// Test 3: delete returning all
{
  const result = await db.delete(users).returning();

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: delete returning partial
{
  const result = await db.delete(users).returning({
    name: users.name,
  });

  type Expected = Array<{
    name: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: returning() cannot be called twice
{
  db.delete(users)
    .returning()
    // @ts-expect-error - returning already called
    .returning();
}

// Test 6: paginated delete without returning
{
  const result = await db.delete(users).paginate({ cursor: null, limit: 10 });

  type Expected = {
    continueCursor: string | null;
    isDone: boolean;
    numAffected: number;
  };

  Expect<Equal<Expected, typeof result>>;
}

// Test 7: paginated delete with returning
{
  const result = await db
    .delete(users)
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
  const result = await db.delete(users).allowFullScan().executeAsync();

  Expect<Equal<undefined, typeof result>>;
}

// Test 9: executeAsync with returning matches execute() result type
{
  const result = await db
    .delete(users)
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
    .delete(users)
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

// where() should enforce column value types
{
  db.delete(users)
    // @ts-expect-error - age expects number
    .where(eq(users.age, 'not-a-number'));
}

// where() requires an argument
{
  db.delete(users)
    // @ts-expect-error - where() requires a filter expression
    .where();
}

// paginate() should reject invalid cursor type
{
  db.delete(users)
    // @ts-expect-error - cursor must be string | null
    .paginate({ cursor: 123, limit: 10 });
}

// paginate() should reject invalid limit type
{
  db.delete(users)
    // @ts-expect-error - limit must be number
    .paginate({ cursor: null, limit: '10' });
}

// paginate() cannot be called twice
{
  db.delete(users)
    .paginate({ cursor: null, limit: 10 })
    // @ts-expect-error - paginate already called
    .paginate({ cursor: null, limit: 10 });
}

// executeAsync() is not available on paginated delete builders
{
  db.delete(users)
    .paginate({ cursor: null, limit: 10 })
    // @ts-expect-error - executeAsync is not available after paginate()
    .executeAsync();
}

// execute(config) is not available on paginated delete builders
{
  const pagedDelete = db.delete(users).paginate({ cursor: null, limit: 10 });
  // @ts-expect-error - execute config is not available after paginate()
  pagedDelete.execute({ mode: 'async' });
}

// execute() requires where() or allowFullScan()
{
  const unsafeDelete = db.delete(users);
  // @ts-expect-error - execute requires where() or allowFullScan()
  unsafeDelete.execute();
}

// executeAsync() requires where() or allowFullScan()
{
  const unsafeDelete = db.delete(users);
  // @ts-expect-error - executeAsync requires where() or allowFullScan()
  unsafeDelete.executeAsync();
}

// returning selection must use column builders
{
  db.delete(users).returning({
    name: users.name,
    // @ts-expect-error - returning selection must be a column builder
    invalid: 'nope',
  });
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// Returning row type should not be any
{
  const result = await db.delete(users).returning();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

export {};
