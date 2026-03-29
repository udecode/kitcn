---
title: Milestone 3: Query Builder - Read Operations
type: feat
date: 2026-01-31
---

# Milestone 3: Query Builder - Read Operations

## Overview

Implement Drizzle-style relational query builder for Convex, providing `findMany()` and `findFirst()` methods with type-safe relation loading via `with` option. This milestone delivers the core read API that developers familiar with Drizzle ORM expect, eliminating the learning curve when adopting Convex.

**Target API**:
```typescript
const usersWithPosts = await ctx.db.query.users.findMany({
  columns: { id: true, name: true },
  with: {
    posts: {
      columns: { content: true },
      limit: 5
    }
  },
  where: ({ id }, { eq }) => eq(id, 1),
  limit: 10
});

// Inferred type:
// {
//   id: Id<"users">;
//   name: string;
//   posts: {
//     content: string;
//   }[];
// }[]
```

## Problem Statement

Developers familiar with Drizzle/Prisma face a steep learning curve when adopting Convex because they must learn convex-ents' different API for querying and loading relations. kitcn has already implemented M1 (Schema Foundation) and M2 (Relations Layer), but lacks the familiar query builder interface for reading data with relations.

**Pain points**:
- No familiar `findMany({ with: { relation: true } })` pattern
- Unfamiliar query patterns when coming from Drizzle/Prisma
- Manual relation loading with multiple queries

## Proposed Solution

Implement `RelationalQueryBuilder` and `GelRelationalQuery` classes that:

1. Provide `db.query[tableName].findMany(config)` and `.findFirst(config)` methods
2. Support `DBQueryConfig` with `columns`, `with`, `where`, `orderBy`, `limit`, `offset`
3. Infer result types via `BuildQueryResult` conditional type
4. Generate efficient Convex queries using M2 EdgeMetadata for relation traversal
5. Map query results to nested objects matching the selected schema

**Adaptation for Convex**: Unlike Drizzle's SQL with LATERAL JOINs + JSON aggregation, we'll use Convex's native `db.get()` and `db.query()` APIs to load relations in batches, avoiding N+1 queries through intelligent prefetching.

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Query Builder API                       │
│  ctx.db.query.users.findMany({ with: { posts: true } }) │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────▼────────────┐
         │ RelationalQueryBuilder │  (Per-table instance)
         │  - findMany(config)    │
         │  - findFirst(config)   │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │  GelRelationalQuery    │  (Promise-based builder)
         │  - _toConvexQuery()    │
         │  - _loadRelations()    │
         │  - execute()           │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │   EdgeMetadata (M2)    │  (Relation configuration)
         │  - sourceTable         │
         │  - targetTable         │
         │  - fieldName           │
         │  - cardinality         │
         └───────────┬────────────┘
                     │
         ┌───────────▼────────────┐
         │   Convex Database      │
         │  - db.query(table)     │
         │  - db.get(id)          │
         └────────────────────────┘
```

### Implementation Phases

#### Phase 1: Core Query Builder Infrastructure

**Deliverables**:
- [x] `RelationalQueryBuilder<TSchema, TTableConfig>` class
- [x] `GelRelationalQuery<TResult>` class extending `QueryPromise<TResult>`
- [x] `findMany()` and `findFirst()` method signatures
- [x] Basic configuration passing and builder instantiation

**Files**:
```
packages/kitcn/src/orm/
  query-builder.ts          # RelationalQueryBuilder class
  query.ts                  # GelRelationalQuery class
  query-promise.ts          # QueryPromise abstract class
```

**Example**:
```typescript
// query-builder.ts
export class RelationalQueryBuilder<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig
> {
  constructor(
    private fullSchema: TSchema,
    private tableConfig: TTableConfig,
    private edgeMetadata: EdgeMetadata[],
    private db: DatabaseReader
  ) {}

  findMany<TConfig extends DBQueryConfig<'many', true, TSchema, TTableConfig>>(
    config?: TConfig
  ): GelRelationalQuery<BuildQueryResult<TSchema, TTableConfig, TConfig>[]> {
    return new GelRelationalQuery(
      this.fullSchema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      config ?? {},
      'many'
    );
  }

  findFirst<TConfig extends Omit<DBQueryConfig<'many', true, TSchema, TTableConfig>, 'limit'>>(
    config?: TConfig
  ): GelRelationalQuery<BuildQueryResult<TSchema, TTableConfig, TConfig> | undefined> {
    return new GelRelationalQuery(
      this.fullSchema,
      this.tableConfig,
      this.edgeMetadata,
      this.db,
      { ...(config ?? {}), limit: 1 },
      'first'
    );
  }
}
```

**Success criteria**:
- Type inference works for simple queries (no `with` yet)
- Builders instantiate without errors
- `findFirst` automatically adds `limit: 1`

**Estimated effort**: Foundation building, type system setup

---

#### Phase 2: Type System for Query Configuration

**Deliverables**:
- [x] `DBQueryConfig<TRelationType, TSchema, TTableConfig>` type
- [x] `BuildQueryResult<TSchema, TTableConfig, TConfig>` type
- [x] `BuildRelationResult<TSchema, TInclude, TRelations>` type
- [x] `InferModelFromColumns<TColumns>` helper type
- [x] Conditional types for `One` vs `Many` relations

**Files**:
```
packages/kitcn/src/orm/
  types.ts                  # Add new query result types
  relations.ts              # Reference existing relation types
```

**Example**:
```typescript
// types.ts
export type DBQueryConfig<
  TRelationType extends 'one' | 'many' = 'one' | 'many',
  TIsRoot extends boolean = boolean,
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig = TableRelationalConfig
> =
  & {
    columns?: {
      [K in keyof TTableConfig['columns']]?: boolean;
    };
    with?: {
      [K in keyof TTableConfig['relations']]?:
        | true
        | DBQueryConfig<
            TTableConfig['relations'][K] extends One ? 'one' : 'many',
            false,
            TSchema,
            FindTableByDBName<TSchema, TTableConfig['relations'][K]['referencedTableName']>
          >;
    };
  }
  & (TRelationType extends 'many' ? {
    where?: FilterFunction<TTableConfig>;
    orderBy?: OrderByFunction<TTableConfig>;
    limit?: number;
    offset?: number;
  } : {});

export type BuildQueryResult<
  TSchema extends TablesRelationalConfig,
  TTableConfig extends TableRelationalConfig,
  TConfig extends true | Record<string, unknown>
> =
  TConfig extends true
    ? InferSelectModel<ConvexTable<TTableConfig>>
    : TConfig extends Record<string, unknown>
      ? Simplify<
          & (TConfig['columns'] extends Record<string, boolean>
              ? PickColumns<TTableConfig['columns'], TConfig['columns']>
              : InferModelFromColumns<TTableConfig['columns']>)
          & (TConfig['with'] extends Record<string, unknown>
              ? BuildRelationResult<TSchema, TConfig['with'], TTableConfig['relations']>
              : {})
        >
      : never;

export type BuildRelationResult<
  TSchema extends TablesRelationalConfig,
  TInclude extends Record<string, unknown>,
  TRelations extends Record<string, Relation>
> = {
  [K in NonUndefinedKeysOnly<TInclude> & keyof TRelations]:
    TRelations[K] extends One<infer TTableName, infer TIsNullable>
      ? BuildQueryResult<
          TSchema,
          FindTableByDBName<TSchema, TTableName>,
          TInclude[K]
        > | (TIsNullable extends true ? null : never)
      : TRelations[K] extends Many<infer TTableName>
        ? BuildQueryResult<
            TSchema,
            FindTableByDBName<TSchema, TTableName>,
            TInclude[K]
          >[]
        : never;
};
```

**Success criteria**:
- Type inference correctly maps `columns` selection
- Type inference correctly maps `with` relations (One vs Many, nullable)
- Nested `with` configurations type-check correctly
- Hovering over query results shows accurate types

**Estimated effort**: Complex TypeScript generics, recursive type definitions

---

#### Phase 3: Convex Query Generation

**Deliverables**:
- [ ] `_toConvexQuery()` method to translate config to Convex query API
- [ ] `where` function compilation to Convex filter expressions
- [ ] `orderBy` function compilation to Convex index usage
- [ ] `limit` and `offset` parameter passing

**Files**:
```
packages/kitcn/src/orm/
  query.ts                  # Add _toConvexQuery() method
  query-compiler.ts         # Helper functions for filter/order compilation
```

**Example**:
```typescript
// query.ts (GelRelationalQuery class)
private _toConvexQuery(): {
  table: string;
  filter?: Expression;
  index?: { name: string; fields: string[] };
  limit?: number;
  offset?: number;
} {
  const { where, orderBy, limit, offset } = this.config;

  // Compile where clause
  const filter = where
    ? compileWhereClause(where, this.tableConfig.columns)
    : undefined;

  // Compile orderBy to index selection
  const index = orderBy
    ? compileOrderBy(orderBy, this.tableConfig.columns)
    : undefined;

  return {
    table: this.tableConfig.tsName,
    filter,
    index,
    limit,
    offset
  };
}

// query-compiler.ts
function compileWhereClause<TColumns>(
  where: FilterFunction<TColumns>,
  columns: TColumns
): Expression {
  const operators = {
    eq: (field: any, value: any) => q.eq(field, value),
    ne: (field: any, value: any) => q.neq(field, value),
    // ... more operators
  };

  return where(columns, operators);
}
```

**Success criteria**:
- Simple `where` clauses compile to valid Convex filter expressions
- `orderBy` selects appropriate indexes when available
- `limit` and `offset` apply correctly to queries

**Estimated effort**: Query translation logic, operator mapping

---

#### Phase 4: Relation Loading Strategy

**Deliverables**:
- [ ] `_loadRelations()` method using EdgeMetadata
- [ ] Batch loading for `Many` relations to avoid N+1 queries
- [ ] Single `db.get()` for `One` relations
- [ ] Recursive relation loading for nested `with` configs
- [ ] Result mapping to reconstruct nested objects

**Files**:
```
packages/kitcn/src/orm/
  query.ts                  # Add _loadRelations() method
  relation-loader.ts        # RelationLoader class for batching
```

**Example**:
```typescript
// relation-loader.ts
export class RelationLoader {
  async loadMany<TResult>(
    db: DatabaseReader,
    parentRows: any[],
    edge: EdgeMetadata,
    config: DBQueryConfig<'many', false>
  ): Promise<TResult[][]> {
    // Extract parent IDs
    const parentIds = parentRows.map(row => row.id);

    // Query related rows in batch
    const relatedRows = await db
      .query(edge.targetTable)
      .withIndex(edge.indexName, q =>
        q.in(edge.fieldName, parentIds)
      )
      .collect();

    // Group by parent ID
    const grouped = new Map<Id, TResult[]>();
    for (const row of relatedRows) {
      const parentId = row[edge.fieldName];
      if (!grouped.has(parentId)) {
        grouped.set(parentId, []);
      }
      grouped.get(parentId)!.push(row as TResult);
    }

    // Apply limit if configured
    if (config.limit) {
      for (const [id, rows] of grouped.entries()) {
        grouped.set(id, rows.slice(0, config.limit));
      }
    }

    // Return in parent order
    return parentRows.map(row => grouped.get(row.id) ?? []);
  }

  async loadOne<TResult>(
    db: DatabaseReader,
    parentRows: any[],
    edge: EdgeMetadata
  ): Promise<(TResult | null)[]> {
    // Extract foreign key IDs
    const foreignKeyIds = parentRows.map(row => row[edge.fieldName]);

    // Batch load referenced rows
    const referencedRows = await Promise.all(
      foreignKeyIds.map(id => id ? db.get(id) : null)
    );

    return referencedRows as (TResult | null)[];
  }
}
```

**Success criteria**:
- `Many` relations load in batch (1 query per relation, not N+1)
- `One` relations load efficiently with `db.get()`
- Nested `with` configs load relations recursively
- Results correctly map to nested object structure

**Estimated effort**: Relation loading logic, batching strategy, result mapping

---

#### Phase 5: Promise-Based Execution

**Deliverables**:
- [ ] `QueryPromise<T>` abstract class with `then()` and `execute()`
- [ ] `execute()` implementation in `GelRelationalQuery`
- [ ] Lazy query execution (only on `await` or `.then()`)
- [ ] Error handling and result transformation

**Files**:
```
packages/kitcn/src/orm/
  query-promise.ts          # QueryPromise abstract class
  query.ts                  # Implement execute() method
```

**Example**:
```typescript
// query-promise.ts
export abstract class QueryPromise<T> implements Promise<T> {
  [Symbol.toStringTag] = 'QueryPromise';

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled, onRejected);
  }

  catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<T | TResult> {
    return this.execute().catch(onRejected);
  }

  finally(onFinally?: (() => void) | undefined | null): Promise<T> {
    return this.execute().finally(onFinally);
  }

  abstract execute(): Promise<T>;
}

// query.ts (GelRelationalQuery class)
async execute(): Promise<TResult> {
  // 1. Build Convex query from config
  const query = this._toConvexQuery();

  // 2. Execute base query
  const rows = await this.db
    .query(query.table)
    .filter(query.filter)
    .order(query.orderBy)
    .take(query.limit ?? Infinity);

  // 3. Load relations if configured
  const rowsWithRelations = this.config.with
    ? await this._loadRelations(rows, this.config.with)
    : rows;

  // 4. Apply column selection
  const selectedRows = this._selectColumns(rowsWithRelations, this.config.columns);

  // 5. Return based on mode
  if (this.mode === 'first') {
    return selectedRows[0] as TResult;
  }

  return selectedRows as TResult;
}
```

**Success criteria**:
- Queries execute only when awaited (lazy evaluation)
- Promise interface works with `async/await` and `.then()`
- Errors propagate correctly through promise chain

**Estimated effort**: Promise mechanics, execution flow

---

#### Phase 6: Database Context Integration

**Deliverables**:
- [ ] Extend `ctx.db` with `query` property
- [ ] Populate `ctx.db.query[tableName]` with `RelationalQueryBuilder` instances
- [ ] Pass EdgeMetadata from M2 `extractRelationsConfig()` to builders
- [ ] Ensure type safety for `ctx.db.query` object

**Files**:
```
packages/kitcn/src/orm/
  database.ts               # Extend database context
  index.ts                  # Export new APIs
```

**Example**:
```typescript
// database.ts
export function createDatabase<TSchema extends TablesRelationalConfig>(
  db: DatabaseReader,
  schema: TSchema,
  edgeMetadata: EdgeMetadata[]
): DatabaseWithQuery<TSchema> {
  const query: any = {};

  for (const [tableName, tableConfig] of Object.entries(schema)) {
    query[tableName] = new RelationalQueryBuilder(
      schema,
      tableConfig,
      edgeMetadata.filter(e => e.sourceTable === tableName),
      db
    );
  }

  return {
    ...db,
    query
  } as DatabaseWithQuery<TSchema>;
}

export type DatabaseWithQuery<TSchema extends TablesRelationalConfig> =
  DatabaseReader & {
    query: {
      [K in keyof TSchema]: RelationalQueryBuilder<TSchema, TSchema[K]>;
    };
  };
```

**Success criteria**:
- `ctx.db.query.users` provides autocomplete for table names
- `.findMany()` and `.findFirst()` show correct type signatures
- EdgeMetadata correctly filters to only edges from source table

**Estimated effort**: Context setup, type plumbing

---

#### Phase 7: Comprehensive Testing

**Deliverables**:
- [ ] Unit tests for type inference (30+ test cases)
- [ ] Integration tests for query execution (25+ test cases)
- [ ] Tests for relation loading (batch loading, N+1 prevention)
- [ ] Tests for nested `with` configurations
- [ ] Edge case tests (empty results, null relations, circular refs)

**Files**:
```
convex/
  query-builder.test.ts     # Core builder tests
  query-types.test.ts       # Type inference tests
  relation-loading.test.ts  # Relation loading tests
```

**Test cases**:

```typescript
// query-builder.test.ts
describe('M3 Query Builder', () => {
  describe('findMany()', () => {
    it('should query all rows without config', async () => {
      const users = await ctx.db.query.users.findMany();
      expect(users).toHaveLength(3);
    });

    it('should filter with where clause', async () => {
      const users = await ctx.db.query.users.findMany({
        where: ({ name }, { eq }) => eq(name, 'Alice')
      });
      expect(users).toHaveLength(1);
      expect(users[0].name).toBe('Alice');
    });

    it('should select specific columns', async () => {
      const users = await ctx.db.query.users.findMany({
        columns: { id: true, name: true }
      });
      expect(users[0]).toHaveProperty('id');
      expect(users[0]).toHaveProperty('name');
      expect(users[0]).not.toHaveProperty('email');
    });

    it('should load Many relations', async () => {
      const users = await ctx.db.query.users.findMany({
        with: { posts: true }
      });
      expect(users[0].posts).toBeInstanceOf(Array);
    });

    it('should load One relations', async () => {
      const posts = await ctx.db.query.posts.findMany({
        with: { author: true }
      });
      expect(posts[0].author).toHaveProperty('name');
    });

    it('should load nested relations', async () => {
      const users = await ctx.db.query.users.findMany({
        with: {
          posts: {
            with: { comments: true }
          }
        }
      });
      expect(users[0].posts[0].comments).toBeInstanceOf(Array);
    });

    it('should apply limit to Many relations', async () => {
      const users = await ctx.db.query.users.findMany({
        with: { posts: { limit: 2 } }
      });
      expect(users[0].posts.length).toBeLessThanOrEqual(2);
    });

    it('should handle null One relations', async () => {
      const posts = await ctx.db.query.posts.findMany({
        where: ({ authorId }, { eq }) => eq(authorId, null),
        with: { author: true }
      });
      expect(posts[0].author).toBeNull();
    });
  });

  describe('findFirst()', () => {
    it('should return first row or undefined', async () => {
      const user = await ctx.db.query.users.findFirst();
      expect(user).toBeDefined();
    });

    it('should return undefined for empty results', async () => {
      const user = await ctx.db.query.users.findFirst({
        where: ({ name }, { eq }) => eq(name, 'NonExistent')
      });
      expect(user).toBeUndefined();
    });

    it('should automatically apply limit: 1', async () => {
      const user = await ctx.db.query.users.findFirst({
        with: { posts: true }
      });
      // Implementation should only query 1 user
      expect(user).toBeDefined();
    });
  });
});

// query-types.test.ts
describe('M3 Type Inference', () => {
  it('should infer all columns by default', () => {
    const users = convexTable('users', {
      name: v.string(),
      email: v.string()
    });

    const result = {} as Awaited<ReturnType<
      RelationalQueryBuilder<any, typeof users>['findMany']
    >>;

    type Test = Expect<Equal<
      typeof result,
      { name: string; email: string }[]
    >>;
  });

  it('should infer selected columns', () => {
    const users = convexTable('users', {
      name: v.string(),
      email: v.string()
    });

    const result = {} as Awaited<ReturnType<
      RelationalQueryBuilder<any, typeof users>['findMany']
    >>({
      columns: { name: true }
    });

    type Test = Expect<Equal<
      typeof result,
      { name: string }[]
    >>;
  });

  it('should infer Many relations as arrays', () => {
    const users = convexTable('users', { name: v.string() });
    const posts = convexTable('posts', {
      title: v.string(),
      userId: v.id('users')
    });

    const usersRelations = relations(users, ({ many }) => ({
      posts: many(posts)
    }));

    const result = {} as Awaited<ReturnType<
      RelationalQueryBuilder<any, typeof users>['findMany']
    >>({
      with: { posts: true }
    });

    type Test = Expect<Equal<
      typeof result,
      { name: string; posts: { title: string; userId: Id<"users"> }[] }[]
    >>;
  });

  it('should infer One relations as nullable', () => {
    const users = convexTable('users', { name: v.string() });
    const posts = convexTable('posts', {
      title: v.string(),
      userId: v.id('users')
    });

    const postsRelations = relations(posts, ({ one }) => ({
      author: one(users, { fields: ['userId'] })
    }));

    const result = {} as Awaited<ReturnType<
      RelationalQueryBuilder<any, typeof posts>['findMany']
    >>({
      with: { author: true }
    });

    type Test = Expect<Equal<
      typeof result,
      { title: string; userId: Id<"users">; author: { name: string } | null }[]
    >>;
  });
});

// relation-loading.test.ts
describe('M3 Relation Loading', () => {
  it('should avoid N+1 queries for Many relations', async () => {
    const queryCount = { count: 0 };
    const db = mockDatabase({
      onQuery: () => queryCount.count++
    });

    await db.query.users.findMany({
      with: { posts: true }
    });

    // Should be: 1 query for users + 1 query for posts (not N+1)
    expect(queryCount.count).toBe(2);
  });

  it('should batch load One relations', async () => {
    const queryCount = { count: 0 };
    const db = mockDatabase({
      onQuery: () => queryCount.count++
    });

    await db.query.posts.findMany({
      with: { author: true }
    });

    // Should be: 1 query for posts + 1 batch db.get for authors
    expect(queryCount.count).toBe(2);
  });
});
```

**Success criteria**:
- All type tests pass (compile-time verification)
- All integration tests pass
- No N+1 queries detected in relation loading tests
- Edge cases handled correctly

**Estimated effort**: Comprehensive test coverage, edge case handling

---

## Acceptance Criteria

### Functional Requirements

- [ ] `ctx.db.query[tableName].findMany(config)` executes and returns typed results
- [ ] `ctx.db.query[tableName].findFirst(config)` executes and returns first result or undefined
- [ ] `columns` config filters returned fields correctly
- [ ] `where` config filters rows using Convex filter expressions
- [ ] `orderBy` config orders results (using indexes when possible)
- [ ] `limit` and `offset` config paginate results
- [ ] `with` config loads `One` relations as nullable objects
- [ ] `with` config loads `Many` relations as arrays
- [ ] Nested `with` configs load multi-level relations
- [ ] Relation loading avoids N+1 queries through batching

### Non-Functional Requirements

- [ ] Type inference correctly infers result shapes from config
- [ ] Autocomplete shows available table names, columns, relations
- [ ] Query execution is lazy (only runs on `await`)
- [ ] Error messages are clear for invalid configurations
- [ ] Performance is comparable to hand-written Convex queries

### Quality Gates

- [ ] 75+ test cases covering all query patterns and edge cases
- [ ] All M1 + M2 + M3 tests pass (200+ tests total expected)
- [ ] TypeScript compiles with no errors
- [ ] Biome linting passes
- [ ] No new console warnings or errors

## Success Metrics

**Developer Experience**:
- Developers familiar with Drizzle can write queries without consulting docs
- Query result types show accurate nested shapes on hover
- Autocomplete suggests available relations and columns

**Technical**:
- Relation loading uses batch queries (1 query per relation level)
- Type inference depth supports at least 3 levels of nested `with`
- Query builder overhead < 5% vs hand-written queries

## Dependencies & Prerequisites

**Prerequisites**:
- ✅ M1 (Schema Foundation) - `convexTable()`, column validators, type inference
- ✅ M2 (Relations Layer) - `relations()`, `one()`, `many()`, `extractRelationsConfig()`

**Dependencies**:
- Convex SDK 1.31+
- EdgeMetadata from M2 for relation configuration
- kitcn package exports from M1/M2

**Blockers**:
- None - M1 and M2 are complete

## Risk Analysis & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type inference depth limit (TypeScript) | High | Test with deep nesting, use `Simplify` helper to flatten types |
| N+1 queries in relation loading | High | Implement batch loading via `RelationLoader`, add tests to detect |
| `where` clause compilation complexity | Medium | Start with simple operators (`eq`, `ne`), expand incrementally |
| Index selection for `orderBy` | Medium | Use simple heuristic: match index name to field name, fallback to scan |
| Convex query API differences from SQL | Medium | Adapt Drizzle patterns to Convex primitives (no JOINs, use `db.get()`) |

## Resource Requirements

**Development**:
- 1-2 developers
- Familiarity with TypeScript generics, Drizzle ORM patterns, Convex query API

**Testing**:
- Comprehensive test suite (75+ tests)
- Type-level tests with `Expect<Equal<>>` assertions
- Integration tests with mock database

**Infrastructure**:
- Convex dev environment for testing
- Drizzle ORM source code for reference patterns

## Future Considerations

**Post-M3 Milestones**:
- M4: Query Builder - Write Operations (`insert`, `update`, `delete`)
- M5: Advanced Query Features (aggregations, `groupBy`, subqueries)
- M6: Migrations System (schema versioning, migration generation)
- M7: Real-time Subscriptions (integrate with Convex reactivity)

**Extensibility**:
- Plugin system for custom query operators
- Query hooks for logging, tracing, caching
- Support for computed fields and virtual columns

## Documentation Plan

**Updates needed**:
- [ ] Add M3 section to main README
- [ ] Create query builder guide with examples
- [ ] Document `DBQueryConfig` type structure
- [ ] Add migration guide from convex-ents to kitcn query API
- [ ] Update type inference examples

## References & Research

### Internal References

**M2 Contract**:
- EdgeMetadata interface: [packages/kitcn/src/orm/extractRelationsConfig.ts:17-40](packages/kitcn/src/orm/extractRelationsConfig.ts#L17-L40)
- extractRelationsConfig: [packages/kitcn/src/orm/extractRelationsConfig.ts:49-119](packages/kitcn/src/orm/extractRelationsConfig.ts#L49-L119)

**M2 Relations**:
- One and Many classes: [packages/kitcn/src/orm/relations.ts:88-165](packages/kitcn/src/orm/relations.ts#L88-L165)
- InferRelations type: [packages/kitcn/src/orm/types.ts](packages/kitcn/src/orm/types.ts)

**Existing Builder Pattern**:
- cRPC ProcedureBuilder: [packages/kitcn/src/server/builder.ts](packages/kitcn/src/server/builder.ts)

**Institutional Learnings**:
- Use instanceof not duck typing: [docs/solutions/auto-coerce-searchparams-zod-schema.md](docs/solutions/auto-coerce-searchparams-zod-schema.md)
- Generic threading patterns: [docs/solutions/middleware-input-access-trpc-style.md](docs/solutions/middleware-input-access-trpc-style.md)
- Flat metadata structures: [docs/solutions/nested-files-meta-generation-codegen.md](docs/solutions/nested-files-meta-generation-codegen.md)

### External References

**Drizzle ORM Source Code** (`/tmp/cc-repos/drizzle-orm`):
- Query builder API: [`gel-core/query-builders/query.ts:32-62`](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/gel-core/query-builders/query.ts#L32-L62)
- Type inference: [`relations.ts:210-404`](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/relations.ts#L210-L404)
- SQL building: [`gel-core/dialect.ts:1141-1435`](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/gel-core/dialect.ts#L1141-L1435)
- Row mapping: [`relations.ts:666-725`](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/relations.ts#L666-L725)
- QueryPromise: [`query-promise.ts:27-31`](file:///tmp/cc-repos/drizzle-orm/drizzle-orm/src/query-promise.ts#L27-L31)

**Convex Documentation**:
- Database query API: https://docs.convex.dev/database/reading-data
- Indexes and filtering: https://docs.convex.dev/database/indexes
- Batch operations: https://docs.convex.dev/database/writing-data

**TypeScript Resources**:
- Conditional types: https://www.typescriptlang.org/docs/handbook/2/conditional-types.html
- Mapped types: https://www.typescriptlang.org/docs/handbook/2/mapped-types.html
- Template literal types: https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html

### Related Work

**M1 Milestone**:
- PR: (if exists)
- Plan: [docs/plans/2026-01-31-feat-milestone-1-schema-foundation-plan.md](docs/plans/2026-01-31-feat-milestone-1-schema-foundation-plan.md)

**M2 Milestone**:
- PR: (if exists)
- Plan: [docs/plans/2026-01-31-feat-milestone-2-relations-layer-plan-deepened.md](docs/plans/2026-01-31-feat-milestone-2-relations-layer-plan-deepened.md)
- Tests: [convex/relations.test.ts](convex/relations.test.ts)

**Similar Implementations**:
- convex-ents query API: https://github.com/get-convex/convex-ents
- Drizzle ORM: https://github.com/drizzle-team/drizzle-orm
