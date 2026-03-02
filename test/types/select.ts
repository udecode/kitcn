import {
  convexTable,
  createOrm,
  defineRelations,
  discriminator,
  extractRelationsConfig,
  type InferInsertModel,
  type InferSelectModel,
  id,
  integer,
  type PredicateWhereIndexConfig,
  text,
} from 'better-convex/orm';
import type { GenericDatabaseReader } from 'convex/server';
import type { GenericId, Value } from 'convex/values';
import { UserRow } from './fixtures/types';
import {
  bookAuthors,
  books,
  cities,
  comments,
  node,
  posts,
  relations,
  users,
} from './tables-rel';
import { type Equal, Expect, IsAny, Not } from './utils';

// Build schema following Better Convex pattern
const schemaConfig = relations;
const edgeMetadata = extractRelationsConfig(relations);

type SchemaUsersName = typeof schemaConfig.users.name;
Expect<Equal<SchemaUsersName, 'users'>>;

type SchemaKeys = Extract<keyof typeof schemaConfig, string>;
type ExpectedSchemaKeys =
  | 'users'
  | 'cities'
  | 'posts'
  | 'comments'
  | 'books'
  | 'bookAuthors'
  | 'node'
  | 'metrics';
Expect<Equal<SchemaKeys, ExpectedSchemaKeys>>;

type SchemaUserRelationKeys = keyof typeof schemaConfig.users.relations;
type ExpectedSchemaUserRelationKeys =
  | 'city'
  | 'homeCity'
  | 'posts'
  | 'comments';
Expect<Equal<SchemaUserRelationKeys, ExpectedSchemaUserRelationKeys>>;

const schemaRelationKeyOk: SchemaUserRelationKeys = 'posts';
// @ts-expect-error - invalid relation key should not be allowed
const schemaRelationKeyBad: SchemaUserRelationKeys = 'invalidRelationKey';
void schemaRelationKeyOk;
void schemaRelationKeyBad;

// Mock database reader for type testing
const mockDb = {} as GenericDatabaseReader<any>;
const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

// ============================================================================
// DATABASE TYPE TESTS (Convex-backend inspired)
// ============================================================================

// Invalid table access on db.query should error
{
  // @ts-expect-error - table does not exist on schema
  db.query.nonExistentTable;
}

// ============================================================================
// WHERE CLAUSE TYPE TESTS
// ============================================================================

// Test 1: eq operator
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// WHERE (FUNCTION) TYPE TESTS
// ============================================================================

{
  const result = await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
  });
  type Row = (typeof result)[number];
  Expect<Equal<Row, UserRow>>;
}

{
  db.query.users.findMany({
    // @ts-expect-error - unknown field in where()
    where: (users, { eq }) => eq(users.unknownField, 'x'),
  });
}

// Test 2: Multiple filter operators
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18, lt: 65 } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: inArray operator
{
  const result = await db.query.users.findMany({
    where: { name: { in: ['Alice', 'Bob'] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: isNull / isNotNull for optional fields
{
  const result = await db.query.users.findMany({
    where: { age: { isNull: true } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4b: notIn operator
{
  const result = await db.query.users.findMany({
    where: { name: { notIn: ['Alice', 'Bob'] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4c: between operator
{
  const result = await db.query.users.findMany({
    where: { age: { between: [18, 65] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4d: notBetween operator
{
  const result = await db.query.users.findMany({
    where: { age: { notBetween: [18, 65] } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// LOGICAL OPERATOR TYPE TESTS
// ============================================================================

// Test 4e: OR at table level
{
  const result = await db.query.users.findMany({
    where: {
      OR: [{ name: 'Alice' }, { name: 'Bob' }],
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4d: AND at table level
{
  const result = await db.query.users.findMany({
    where: {
      AND: [{ age: { gt: 18 } }, { age: { lt: 65 } }],
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4e: NOT at table level
{
  const result = await db.query.users.withIndex('by_age').findMany({
    where: {
      NOT: { age: { isNull: true } },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4f: OR inside a single column filter
{
  const result = await db.query.users.findMany({
    where: {
      age: { OR: [{ lt: 18 }, { gt: 65 }] },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4g: AND inside a single column filter
{
  const result = await db.query.users.findMany({
    where: {
      age: { AND: [{ gt: 18 }, { lt: 65 }] },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 4h: NOT inside a single column filter
{
  const result = await db.query.users.withIndex('by_age').findMany({
    where: {
      age: { NOT: { isNull: true } },
    },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// ORDER BY TYPE TESTS
// ============================================================================

// Test 5: orderBy asc
{
  const result = await db.query.users.findMany({
    orderBy: { name: 'asc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6: orderBy desc
{
  const result = await db.query.users.findMany({
    orderBy: { age: 'desc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6b: orderBy callback with column builder
{
  const result = await db.query.users.findMany({
    orderBy: (users) => users.name,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 6c: orderBy callback with multiple fields
{
  const result = await db.query.users.findMany({
    orderBy: (users, { asc, desc }) => [desc(users.age), asc(users.name)],
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// LIMIT / OFFSET TYPE TESTS
// ============================================================================

// Test 7: limit
{
  const result = await db.query.users.findMany({
    limit: 10,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 8: offset
{
  const result = await db.query.users.findMany({
    offset: 5,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test 9: Combined where + orderBy + limit
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
    orderBy: { name: 'desc' },
    limit: 10,
    offset: 5,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// COLUMN SELECTION TYPE TESTS
// ============================================================================

// Test 10: Select specific columns
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
  });

  type Expected = Array<{
    name: string;
    email: string;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 11: Exclude columns with false
{
  const result = await db.query.users.findMany({
    columns: {
      age: false,
    },
  });

  type Expected = Array<Omit<UserRow, 'age'>>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 11b: Empty columns returns no table columns
{
  const result = await db.query.users.findMany({
    columns: {},
  });

  type Expected = Array<{}>;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// COMBINED WHERE + RELATIONS TYPE TESTS
// ============================================================================

// Test 12: Where clause with nested relations
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
    with: {
      posts: {
        where: { published: true },
        columns: {
          title: true,
        },
      },
    },
  });

  type Row = (typeof result)[number];
  Expect<Equal<Row['name'], string>>;
  Expect<Equal<Row['posts'][number]['title'], string | null>>;
}

// Test 12b: one() relation with where is nullable (even if optional false)
{
  const authors = convexTable('authors_where', {
    name: text().notNull(),
  });

  const books = convexTable('books_where', {
    authorId: id('authors_where').notNull(),
    title: text().notNull(),
  });

  const relationsWhere = defineRelations({ authors, books }, (r) => ({
    authors: {
      books: r.many.books(),
    },
    books: {
      author: r.one.authors({
        from: r.books.authorId,
        to: r.authors.id,
        optional: false,
      }),
    },
  }));

  const edgesWhere = extractRelationsConfig(relationsWhere);
  const ormWhere = createOrm({ schema: relationsWhere });
  const dbWhere = ormWhere.db(mockDb);

  const result = await dbWhere.query.books.findMany({
    with: {
      author: {
        where: { name: 'Alice' },
      },
    },
  });

  type AuthorRow = InferSelectModel<typeof authors>;
  type Row = (typeof result)[number];

  Expect<Equal<Row['author'], AuthorRow | null>>;
}

// Test 12c: columns {} in relations keeps nested relations only
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        columns: {},
        with: {
          author: true,
        },
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  type ExpectedPost = {
    author: UserRow | null;
  };

  Expect<Equal<Post, ExpectedPost>>;
}

// Test 12d: offset in nested relations preserves types
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        offset: 1,
        limit: 2,
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  type ExpectedPost = InferSelectModel<typeof posts>;

  Expect<Equal<Post, ExpectedPost>>;
}

// Test 12e: predefined where alias on many() keeps relation shape
{
  const polyUsers = convexTable('poly_users_types', {
    name: text().notNull(),
  });

  const polyPosts = convexTable('poly_posts_types', {
    title: text().notNull(),
    status: text().notNull(),
    authorId: id('poly_users_types').notNull(),
  });

  const polyRelations = defineRelations({ polyUsers, polyPosts }, (r) => ({
    polyUsers: {
      publishedPosts: r.many.polyPosts({
        from: r.polyUsers.id,
        to: r.polyPosts.authorId,
        where: { status: 'published' },
        alias: 'published-posts',
      }),
    },
    polyPosts: {
      author: r.one.polyUsers({
        from: r.polyPosts.authorId,
        to: r.polyUsers.id,
      }),
    },
  }));

  const polyOrm = createOrm({ schema: polyRelations });
  const polyDb = polyOrm.db(mockDb);

  const result = await polyDb.query.polyUsers.findMany({
    with: {
      publishedPosts: true,
    },
  });

  type PolyPostRow = InferSelectModel<typeof polyPosts>;
  type Row = (typeof result)[number];
  type PublishedPosts = Row['publishedPosts'];

  Expect<Equal<PublishedPosts, PolyPostRow[]>>;
}

// Test 12f: strict polymorphic dual-target relations stay nullable in result
{
  const strictPosts = convexTable('strict_posts_types', {
    title: text().notNull(),
    kind: text().notNull(),
  });

  const strictVideos = convexTable('strict_videos_types', {
    title: text().notNull(),
    kind: text().notNull(),
  });

  const strictComments = convexTable('strict_comments_types', {
    body: text().notNull(),
    postId: id('strict_posts_types'),
    videoId: id('strict_videos_types'),
  });

  const strictRelations = defineRelations(
    { strictPosts, strictVideos, strictComments },
    (r) => ({
      strictComments: {
        post: r.one.strictPosts({
          from: r.strictComments.postId,
          to: r.strictPosts.id,
          where: { kind: 'post' },
        }),
        video: r.one.strictVideos({
          from: r.strictComments.videoId,
          to: r.strictVideos.id,
          where: { kind: 'video' },
        }),
      },
    })
  );

  const strictOrm = createOrm({ schema: strictRelations });
  const strictDb = strictOrm.db(mockDb);

  const result = await strictDb.query.strictComments.findMany({
    with: {
      post: true,
      video: true,
    },
  });

  type StrictPostRow = InferSelectModel<typeof strictPosts>;
  type StrictVideoRow = InferSelectModel<typeof strictVideos>;
  type Row = (typeof result)[number];

  Expect<Equal<Row['post'], StrictPostRow | null>>;
  Expect<Equal<Row['video'], StrictVideoRow | null>>;
}

// Test 12g: nested with + relation where remains type-safe
{
  const nestedUsers = convexTable('nested_users_types', {
    name: text().notNull(),
  });

  const nestedPosts = convexTable('nested_posts_types', {
    title: text().notNull(),
    status: text().notNull(),
    authorId: id('nested_users_types').notNull(),
  });

  const nestedRelations = defineRelations(
    { nestedUsers, nestedPosts },
    (r) => ({
      nestedUsers: {
        publishedPosts: r.many.nestedPosts({
          from: r.nestedUsers.id,
          to: r.nestedPosts.authorId,
          where: { status: 'published' },
          alias: 'published-posts',
        }),
      },
      nestedPosts: {
        author: r.one.nestedUsers({
          from: r.nestedPosts.authorId,
          to: r.nestedUsers.id,
        }),
      },
    })
  );

  const nestedOrm = createOrm({ schema: nestedRelations });
  const nestedDb = nestedOrm.db(mockDb);

  const result = await nestedDb.query.nestedUsers.findMany({
    with: {
      publishedPosts: {
        where: { status: 'published' },
        with: {
          author: {
            where: { name: 'Alice' },
          },
        },
      },
    },
  });

  type NestedUserRow = InferSelectModel<typeof nestedUsers>;
  type Row = (typeof result)[number];
  type Author = Row['publishedPosts'][number]['author'];

  Expect<Equal<Author, NestedUserRow | null>>;
}

// Test 12h: discriminator findMany narrows synthesized details + withVariants
{
  const polyUsers = convexTable('poly_users_discriminator_types', {
    name: text().notNull(),
  });

  const polyTodos = convexTable('poly_todos_discriminator_types', {
    title: text().notNull(),
  });

  const polyEvents = convexTable('poly_events_discriminator_types', {
    actorId: id('poly_users_discriminator_types').notNull(),
    eventType: discriminator({
      variants: {
        todo_completed: {
          todoId: id('poly_todos_discriminator_types').notNull(),
          completedAt: integer().notNull(),
        },
        profile_updated: {
          displayName: text().notNull(),
        },
      },
    }),
  });

  const polyRelations = defineRelations(
    { polyUsers, polyTodos, polyEvents },
    (r) => ({
      polyEvents: {
        actor: r.one.polyUsers({
          from: r.polyEvents.actorId,
          to: r.polyUsers.id,
          optional: true,
        }),
        todo: r.one.polyTodos({
          from: r.polyEvents.todoId,
          to: r.polyTodos.id,
          optional: true,
        }),
      },
    })
  );

  const polyOrm = createOrm({ schema: polyRelations });
  const polyDb = polyOrm.db(mockDb);

  const result = await polyDb.query.polyEvents.findMany({
    withVariants: true,
    limit: 10,
  });

  type Row = (typeof result)[number];
  type TodoRow = Extract<Row, { eventType: 'todo_completed' }>;
  type ProfileRow = Extract<Row, { eventType: 'profile_updated' }>;

  Expect<
    Equal<
      TodoRow['details']['todoId'],
      GenericId<'poly_todos_discriminator_types'>
    >
  >;
  Expect<Equal<TodoRow['details']['completedAt'], number>>;
  Expect<Equal<ProfileRow['details']['displayName'], string>>;
  Expect<Equal<Row['actor'], InferSelectModel<typeof polyUsers> | null>>;
  Expect<Equal<Row['todo'], InferSelectModel<typeof polyTodos> | null>>;
}

// Test 12i: discriminator findFirst + custom alias narrows
{
  const polyDocs = convexTable('poly_docs_discriminator_first_types', {
    title: text().notNull(),
  });

  const polyEvents = convexTable('poly_events_discriminator_first_types', {
    actorId: text().notNull(),
    eventType: discriminator({
      as: 'entity',
      variants: {
        doc_updated: {
          docId: id('poly_docs_discriminator_first_types').notNull(),
          version: integer().notNull(),
        },
        actor_renamed: {
          name: text().notNull(),
        },
      },
    }),
  });

  const polyOrm = createOrm({
    schema: defineRelations({ polyDocs, polyEvents }),
  });
  const polyDb = polyOrm.db(mockDb);

  const result = await polyDb.query.polyEvents.findFirst();

  type Row = NonNullable<typeof result>;
  type DocRow = Extract<Row, { eventType: 'doc_updated' }>;
  type RenameRow = Extract<Row, { eventType: 'actor_renamed' }>;

  Expect<
    Equal<
      DocRow['entity']['docId'],
      GenericId<'poly_docs_discriminator_first_types'>
    >
  >;
  Expect<Equal<DocRow['entity']['version'], number>>;
  Expect<Equal<RenameRow['entity']['name'], string>>;
}

// Test 12j: discriminator findFirstOrThrow narrows synthesized details
{
  const polyFiles = convexTable('poly_files_discriminator_throw_types', {
    path: text().notNull(),
  });

  const polyEvents = convexTable('poly_events_discriminator_throw_types', {
    eventType: discriminator({
      variants: {
        file_created: {
          fileId: id('poly_files_discriminator_throw_types').notNull(),
        },
        heartbeat: {
          source: text().notNull(),
        },
      },
    }),
  });

  const polyOrm = createOrm({
    schema: defineRelations({ polyFiles, polyEvents }),
  });
  const polyDb = polyOrm.db(mockDb);

  const result = await polyDb.query.polyEvents.findFirstOrThrow();

  type Row = typeof result;
  type FileRow = Extract<Row, { eventType: 'file_created' }>;
  type HeartbeatRow = Extract<Row, { eventType: 'heartbeat' }>;

  Expect<
    Equal<
      FileRow['details']['fileId'],
      GenericId<'poly_files_discriminator_throw_types'>
    >
  >;
  Expect<Equal<HeartbeatRow['details']['source'], string>>;
}

// ============================================================================
// FINDFIRST RESULT TYPE TESTS
// ============================================================================

// Test: findFirst returns T | null
{
  const result = await db.query.users.findFirst({
    where: { name: 'Alice' },
  });

  type Expected = UserRow | null;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst with orderBy
{
  const result = await db.query.users.findFirst({
    orderBy: { age: 'desc' },
  });

  type Expected = UserRow | null;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst with no match returns null
{
  const result = await db.query.users.findFirst({
    where: { name: 'NonExistent' },
  });

  type Expected = UserRow | null;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirst never returns array
{
  const result = await db.query.users.findFirst();

  // Verify it's not an array type
  type IsArray = typeof result extends Array<any> ? true : false;
  Expect<Equal<IsArray, false>>;
}

// Test: findFirstOrThrow returns T (never null)
{
  const result = await db.query.users.findFirstOrThrow({
    where: { name: 'Alice' },
  });

  type Expected = UserRow;

  Expect<Equal<Expected, typeof result>>;
}

// Test: findFirstOrThrow with no match still types as T (throws at runtime)
{
  const result = await db.query.users.findFirstOrThrow({
    where: { name: 'NonExistent' },
  });

  type Expected = UserRow;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// GETCOLUMNDATA MODE VERIFICATION TESTS
// ============================================================================

// Test: InferSelectModel uses 'query' mode (includes null for nullable fields)
{
  type User = InferSelectModel<typeof users>;

  // Age is nullable, should include null (query mode)
  Expect<Equal<User['age'], number | null>>;

  // Name is notNull, should NOT include null
  Expect<Equal<User['name'], string>>;
}

// Test: BuildQueryResult column selection uses 'query' mode
{
  const result = await db.query.users.findMany({
    columns: { age: true },
  });

  type Row = (typeof result)[number];

  // Selected age field preserves nullability
  Expect<Equal<Row['age'], number | null>>;
}

// Test: Filter values use 'raw' mode (don't accept null)
{
  // eq should accept `number`, NOT `number | null`
  await db.query.users.findMany({
    where: { age: 30 }, // ✓ Should work
  });

  // This test verifies eq doesn't accept null by attempting it in negative test section
  // See negative tests below for the @ts-expect-error version
}

// ============================================================================
// COMPLEX COMBINATIONS
// ============================================================================

// Test: where + orderBy + limit combined
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
    orderBy: { age: 'desc' },
    limit: 10,
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: columns + where combined
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
    where: { name: 'Alice' },
  });

  type Row = (typeof result)[number];
  type Expected = {
    name: string;
    email: string;
  };

  Expect<Equal<Row, Expected>>;
}

// Test: orderBy on posts table
{
  const result = await db.query.posts.findMany({
    orderBy: { title: 'desc' },
  });

  // Should return array of posts
  type IsArray = typeof result extends Array<any> ? true : false;
  Expect<Equal<IsArray, true>>;
}

// Test: Complex where with multiple operators
{
  const result = await db.query.users.findMany({
    where: { age: { gt: 18 } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M5 STRING OPERATOR TESTS
// ============================================================================

// Test: like prefix pattern
{
  const result = await db.query.users.findMany({
    where: { name: { like: 'A%' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: like suffix pattern
{
  const result = await db.query.users.findMany({
    where: { email: { like: '%@example.com' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: like substring pattern
{
  const result = await db.query.users.findMany({
    where: { name: { like: '%ice%' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: startsWith operator
{
  const result = await db.query.users.findMany({
    where: { email: { startsWith: 'a' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: endsWith operator
{
  const result = await db.query.users.withIndex('by_email').findMany({
    where: { email: { endsWith: '@example.com' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: contains operator
{
  const result = await db.query.users.withIndex('by_name').findMany({
    where: { name: { contains: 'ice' } },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M5 ORDERBY EXTENDED TESTS
// ============================================================================

// Test: orderBy with system field createdAt
{
  const result = await db.query.users.findMany({
    orderBy: { createdAt: 'desc' },
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// Test: orderBy with nullable field
{
  const result = await db.query.users.findMany({
    orderBy: { age: 'desc' }, // age is nullable
  });

  type Expected = UserRow[];

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// M6 COLUMN BUILDER TESTS
// ============================================================================

// Test: Method chaining - notNull().default()
{
  const posts = convexTable('posts', {
    title: text().notNull(),
    status: text().notNull().default('draft'),
  });

  type Insert = InferInsertModel<typeof posts>;

  Expect<
    Equal<
      Insert,
      {
        title: string;
        status?: string; // Defaults make fields optional (Drizzle parity)
      }
    >
  >;
}

// Test: Default value type inference
{
  const posts = convexTable('posts', {
    viewCount: integer().default(0),
  });

  type Post = InferSelectModel<typeof posts>;
  type ViewCountType = Post['viewCount'];

  // Default doesn't change nullability - still nullable in select
  Expect<Equal<ViewCountType, number | null>>;
}

// ============================================================================
// M5/M6 NEGATIVE TYPE TESTS
// ============================================================================

// Negative: orderBy on invalid field
db.query.users.findMany({
  // @ts-expect-error - Property 'nonExistent' does not exist
  orderBy: { nonExistent: 'asc' },
});

// Negative: Invalid default value type
{
  convexTable('invalid', {
    // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
    age: integer().default('not a number'),
  });
}

// ============================================================================
// NEGATIVE TYPE TESTS - Invalid usage should error
// ============================================================================

// Invalid field in where clause
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  where: { invalidField: 'test' },
});

// Legacy query-level polymorphic config is removed
db.query.users.findMany({
  // @ts-expect-error - query-level polymorphic config is removed
  polymorphic: {},
});

db.query.users.findFirst({
  // @ts-expect-error - query-level polymorphic config is removed
  polymorphic: {},
});

db.query.users.findFirstOrThrow({
  // @ts-expect-error - query-level polymorphic config is removed
  polymorphic: {},
});

// Type mismatch in eq operator
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'string' is not assignable to parameter of type 'number'
  where: { age: 'not a number' },
});

// Invalid field in orderBy
db.query.users.findMany({
  // @ts-expect-error - Property 'invalidField' does not exist
  orderBy: (users, { asc }) => asc(users.invalidField),
});

// Invalid orderBy direction
db.query.users.findMany({
  // @ts-expect-error - orderBy direction must be 'asc' | 'desc'
  orderBy: { age: 'up' },
});

// Invalid operator for field type
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'number' is not assignable to parameter of type 'string'
  where: { name: { gt: 100 } },
});

// between with wrong tuple element type
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  where: { age: { between: ['18', 65] } },
});

// notBetween expects tuple of two values
db.query.users.findMany({
  // @ts-expect-error - notBetween expects [min, max]
  where: { age: { notBetween: [18] } },
});

// inArray with wrong value type
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  where: { age: { in: ['not', 'numbers'] } },
});

// inArray expects array
db.query.users.findMany({
  // @ts-expect-error - 'in' expects an array of values
  where: { age: { in: 123 } },
});

// like operator expects string pattern
db.query.users.findMany({
  // @ts-expect-error - like expects a string pattern
  where: { name: { like: 123 } },
});

// FilterOperators use 'raw' mode - eq should NOT accept null
db.query.users.findMany({
  // @ts-expect-error - Argument of type 'null' is not assignable to parameter of type 'number'
  where: { age: null },
});

// findFirst should not be assignable to array type
{
  const result = await db.query.users.findFirst();
  // @ts-expect-error - Type 'UserRow | undefined' is not assignable to type 'UserRow[]'
  const arr: UserRow[] = [result];
}

// isNull expects boolean
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'true'
  where: { name: { isNull: 'nope' } },
});

// OR must be an array of filters
db.query.users.findMany({
  where: {
    // @ts-expect-error - OR expects an array of filters
    OR: { name: 'Alice' },
  },
});

// Column-level OR must be an array of filters
db.query.users.findMany({
  where: {
    age: {
      // @ts-expect-error - OR expects an array of field filters
      OR: { gt: 18 },
    },
  },
});

// isNull only accepts true
db.query.users.findMany({
  where: {
    age: {
      // @ts-expect-error - isNull only accepts true
      isNull: false,
    },
  },
});

// Invalid column in selection
db.query.users.findMany({
  columns: {
    // @ts-expect-error - 'invalidColumn' does not exist
    invalidColumn: true,
  },
});

// Columns values must be boolean
db.query.users.findMany({
  columns: {
    // @ts-expect-error - columns values must be boolean
    name: 'yes',
  },
});

// Where in nested one() relation (allowed)
db.query.posts.findMany({
  with: {
    author: {
      where: { name: 'Alice' },
    },
  },
});

// Limit is not allowed in nested one() relation
db.query.posts.findMany({
  with: {
    author: {
      // @ts-expect-error - limit is only allowed on many() relations
      limit: 10,
    },
  },
});

// Invalid nested relation option type
db.query.users.findMany({
  with: {
    posts: {
      // @ts-expect-error - limit must be a number
      limit: '10',
    },
  },
});

// ============================================================================
// PHASE 4: COMPREHENSIVE NEGATIVE TESTS
// ============================================================================

// A. Invalid Column Access - Invalid column in relation config
db.query.posts.findMany({
  with: {
    // @ts-expect-error - Invalid relation name
    nonExistentRelation: true,
  },
});

// B. Type Mismatches - Wrong GenericId table reference
{
  const posts = convexTable('posts', {
    authorId: id('users').notNull(),
  });

  type Post = InferSelectModel<typeof posts>;

  const invalidPost: Post = {
    id: '123' as GenericId<'posts'>,
    createdAt: 123,
    // @ts-expect-error - Type 'GenericId<"posts">' is not assignable to type 'GenericId<"users">'
    authorId: '456' as GenericId<'posts'>, // Wrong table reference
  };
}

// B. Type Mismatches - Array for single value operator
db.query.users.findMany({
  // @ts-expect-error - Type 'number' is not assignable to type 'string'
  where: { name: { eq: 123 } },
});

// C. Invalid Operations - gt on boolean field
// Note: This currently doesn't produce a type error due to type system limitations
db.query.posts.findMany({
  where: { published: { gt: true } },
});

// C. Invalid Operations - lt on boolean field
// Note: This currently doesn't produce a type error due to type system limitations
db.query.posts.findMany({
  where: { published: { lt: false } },
});

// D. Invalid Query Config - Unknown query option
db.query.users.findMany({
  // @ts-expect-error - Object literal may only specify known properties
  unknownOption: true,
});

// D. Invalid Query Config - limit with string value
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  limit: '10',
});

// D. Invalid Query Config - offset with string value
db.query.users.findMany({
  // @ts-expect-error - Type 'string' is not assignable to type 'number'
  offset: '5',
});

// E. Relation Constraints - Invalid relation name in with
{
  type UsersQueryConfig = import('better-convex/orm').DBQueryConfig<
    'many',
    true,
    typeof schemaConfig,
    typeof schemaConfig.users
  >;

  const invalidConfig: UsersQueryConfig = {
    with: {
      // @ts-expect-error - Invalid relation name
      invalidRelation: true,
    },
  };

  void invalidConfig;
}

// ============================================================================
// PHASE 5: EDGE CASES
// ============================================================================

// Edge Case 1: Empty result arrays
{
  const result = await db.query.users.findMany({
    where: { name: 'NonExistentUser12345' },
  });

  // Should still be Array<UserRow>, not undefined or never
  type Expected = UserRow[];

  Expect<Equal<typeof result, Expected>>;
}

// Edge Case 2: Null handling in complex queries
{
  const result = await db.query.users.findMany({
    where: { age: { isNull: true } },
    columns: {
      name: true,
      age: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  type Row = (typeof result)[number];

  // Age should preserve nullability
  Expect<Equal<Row['age'], number | null>>;
}

// Edge Case 3: System field ordering (id, createdAt)
{
  const result = await db.query.users.findMany({
    orderBy: { createdAt: 'asc' },
  });

  type Expected = UserRow[];

  Expect<Equal<typeof result, Expected>>;
}

// Edge Case 4: GenericId across multiple tables
{
  const result = await db.query.posts.findMany({
    columns: {
      authorId: true,
    },
  });

  type Row = (typeof result)[number];

  // authorId should keep nullable string typing from schema
  Expect<Equal<Row['authorId'], string | null>>;
}

// Edge Case 5: Deeply nested query configs (type check only)
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
    columns: {
      name: true,
      email: true,
      age: true,
    },
    orderBy: { age: 'desc' },
    limit: 10,
    offset: 5,
  });

  // Should compile without errors
  type Row = (typeof result)[number];

  Expect<
    Equal<
      Row,
      {
        name: string;
        email: string;
        age: number | null;
      }
    >
  >;
}

// ============================================================================
// FINDMANY CURSOR PAGINATION TYPE TESTS
// ============================================================================

// Cursor pagination returns page + cursor metadata
{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
    cursor: null,
    limit: 10,
  });

  type Expected = {
    page: UserRow[];
    continueCursor: string | null;
    isDone: boolean;
    pageStatus?: 'SplitRecommended' | 'SplitRequired';
    splitCursor?: string;
  };

  Expect<Equal<typeof result, Expected>>;
}

// Non-paginated findMany returns an array
{
  const result = await db.query.users.findMany({ limit: 10 });
  type Row = (typeof result)[number];
  Expect<Equal<Row, UserRow>>;
}

// Cursor pagination requires limit when cursor is provided
db.query.users.findMany({
  // @ts-expect-error - limit is required
  cursor: null,
});

// Cursor pagination forbids offset
// @ts-expect-error - cursor pagination cannot be combined with offset
db.query.users.findMany({ cursor: null, limit: 10, offset: 1 });

// maxScan requires cursor pagination
db.query.users.findMany({
  // @ts-expect-error - maxScan requires cursor pagination
  maxScan: 100,
});

// @ts-expect-error - allowFullScan is not supported with cursor pagination
db.query.users.findMany({ cursor: null, limit: 10, allowFullScan: true });

db.query.users.findMany({
  // @ts-expect-error - numItems alias is not supported
  cursor: null,
  limit: 10,
  numItems: 10,
});

db.query.users.findMany({
  // @ts-expect-error - maximumRowsRead alias is not supported
  cursor: null,
  limit: 10,
  maximumRowsRead: 50,
});

// ============================================================================
// EXTRAS TYPE TESTS (runtime-computed fields)
// ============================================================================

// Extras appear on result rows with inferred types (function return types + constants)
{
  const result = await db.query.users.findMany({
    extras: {
      nameUpper: (row) => row.name.toUpperCase(),
      constant: 123,
    },
  });

  type Row = (typeof result)[number];

  Expect<Equal<Row['nameUpper'], string>>;
  Expect<Equal<Row['constant'], number>>;
}

// Extras are preserved even when columns selection is empty
{
  const result = await db.query.users.findMany({
    columns: {},
    extras: {
      nameUpper: (row) => row.name.toUpperCase(),
    },
  });

  type Row = (typeof result)[number];

  Expect<
    Equal<
      Row,
      {
        nameUpper: string;
      }
    >
  >;
}

// Nested extras work inside `with`
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        extras: {
          textLength: (row) => row.text.length,
        },
      },
    },
  });

  type Post = (typeof result)[number]['posts'][number];
  Expect<Equal<Post['textLength'], number>>;
}

// ============================================================================
// ANY-PROTECTION TESTS
// ============================================================================

// findMany row type should not be any
{
  const result = await db.query.users.findMany();
  type Row = (typeof result)[number];
  Expect<Not<IsAny<Row>>>;
}

// findFirst row type should not be any
{
  const result = await db.query.users.findFirst();
  type Row = NonNullable<typeof result>;
  Expect<Not<IsAny<Row>>>;
}

// findMany cursor pagination row type should not be any
{
  const result = await db.query.users.findMany({
    cursor: null,
    limit: 1,
  });
  type Row = (typeof result)['page'][number];
  Expect<Not<IsAny<Row>>>;
}

// pageByKey mode return shape
{
  const page = await db.query.users.findMany({
    pageByKey: {
      index: 'by_name',
      targetMaxRows: 10,
    },
  });

  type Expected = {
    page: UserRow[];
    indexKeys: (Value | undefined)[][];
    hasMore: boolean;
  };
  Expect<Equal<typeof page, Expected>>;
}

// select() map/filter stage chaining infers transformed row shape
{
  const page = await db.query.users
    .select()
    .map(async (row) => ({ ...row, slug: row.name.toLowerCase() }))
    .filter(async (row) => row.slug.endsWith('a'))
    .paginate({ cursor: null, limit: 5 });

  type Row = (typeof page)['page'][number];
  Expect<Equal<Row['slug'], string>>;
}

// select() flatMap includeParent defaults to parent/child tuple rows
{
  const page = await db.query.users
    .select()
    .flatMap('posts')
    .paginate({ cursor: null, limit: 5 });

  type Row = (typeof page)['page'][number];
  type Expected = {
    parent: UserRow;
    child: InferSelectModel<typeof posts>;
  };
  Expect<Equal<Row, Expected>>;
}

// select() flatMap includeParent=false returns child rows directly
{
  const page = await db.query.users
    .select()
    .flatMap('posts', { includeParent: false })
    .paginate({ cursor: null, limit: 5 });

  type Row = (typeof page)['page'][number];
  type Expected = InferSelectModel<typeof posts>;
  Expect<Equal<Row, Expected>>;
}

// findMany({ pipeline }) is removed
{
  await db.query.users.findMany({
    // @ts-expect-error - findMany({ pipeline }) is removed; use select() chain
    pipeline: { stages: [] },
  });
}

// select() does not accept config object modes
{
  // @ts-expect-error - select() is chain-only and does not accept with
  db.query.users.select({ with: { posts: true } });

  // @ts-expect-error - select() is chain-only and does not accept extras
  db.query.users.select({ extras: { upperName: (row: UserRow) => row.name } });

  // @ts-expect-error - select() is chain-only and does not accept columns
  db.query.users.select({ columns: { name: true } });

  // @ts-expect-error - select() is chain-only and does not accept search
  db.query.posts.select({ search: { index: 'text_search', query: 'hello' } });

  // @ts-expect-error - select() is chain-only and does not accept vectorSearch
  db.query.posts.select({
    vectorSearch: { index: 'embedding_vec', vector: [0.1, 0.2], limit: 1 },
  });

  // @ts-expect-error - select() is chain-only and does not accept offset
  db.query.users.select({ offset: 1 });
}

// callback predicate requires explicit .withIndex(...) and forbids allowFullScan
{
  type UsersPredicateIndexConfig = PredicateWhereIndexConfig<
    typeof schemaConfig.users
  >;
  type UsersByNameRange = NonNullable<
    Extract<UsersPredicateIndexConfig, { name: 'by_name' }>['range']
  >;
  type PostsPredicateIndexConfig = PredicateWhereIndexConfig<
    typeof schemaConfig.posts
  >;
  type PostsNumLikesAndTypeRange = NonNullable<
    Extract<PostsPredicateIndexConfig, { name: 'numLikesAndType' }>['range']
  >;

  const usersByNameRange: UsersByNameRange = (q) => q.eq('name', 'Alice');
  const postsTypeLikesRange: PostsNumLikesAndTypeRange = (q) =>
    q.eq('type', 'article').gte('numLikes', 10);

  const usersByNameWrongStart: UsersByNameRange = (q) =>
    // @ts-expect-error - by_name range must start on indexed field sequence (name first)
    q.eq('_creationTime', 0);
  const usersByNameWrongField: UsersByNameRange = (q) =>
    // @ts-expect-error - by_name range cannot use non-indexed field
    q.eq('email', 'alice@example.com');
  // @ts-expect-error - by_name range value must match field type
  const usersByNameWrongValue: UsersByNameRange = (q) => q.eq('name', 123);
  const postsWrongStart: PostsNumLikesAndTypeRange = (q) =>
    // @ts-expect-error - compound index must start with first field 'type'
    q.eq('numLikes', 10);
  void usersByNameWrongStart;
  void usersByNameWrongField;
  void usersByNameWrongValue;
  void postsWrongStart;

  // @ts-expect-error - predicate callback requires .withIndex(...)
  await db.query.users.findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });
  await db.query.users.withIndex('by_name').findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });
  await db.query.users.withIndex('by_name', usersByNameRange).findMany({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });
  // @ts-expect-error - invalid index name should be rejected
  db.query.users.withIndex('by_nope');

  await db.query.posts
    .withIndex('numLikesAndType', postsTypeLikesRange)
    .findMany({
      where: (_posts, { predicate }) =>
        predicate((row) => row.type === 'article'),
    });
  await db.query.posts
    .withIndex('numLikesAndType', (q) =>
      q.eq('type', 'article').gte('numLikes', 10)
    )
    .findMany({
      where: (_posts, { predicate }) =>
        predicate((row) => row.type === 'article'),
    });
  db.query.posts.withIndex(
    'numLikesAndType',
    // @ts-expect-error - inline compound range must start with first field 'type'
    (q) => q.eq('numLikes', 10)
  );

  await db.query.users.findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
    // @ts-expect-error - top-level index config is removed; use .withIndex(...)
    index: { name: 'by_name' },
  });

  await db.query.users.withIndex('by_name').findMany({
    where: (users, { eq }) => eq(users.name, 'Alice'),
    // @ts-expect-error - allowFullScan is forbidden when .withIndex(...) is used
    allowFullScan: true,
  });

  // @ts-expect-error - predicate callback requires .withIndex(...) on findFirst
  await db.query.users.findFirst({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });
  await db.query.users.withIndex('by_name').findFirst({
    where: (_users, { predicate }) => predicate((row) => row.name === 'Alice'),
  });

  // @ts-expect-error - allowFullScan is forbidden when .withIndex(...) is used (findFirst)
  await db.query.users.withIndex('by_name').findFirst({
    where: { name: 'Alice' },
    allowFullScan: true,
  });
}

// predicate callback cursor pagination supports maxScan
{
  const result = await db.query.users.withIndex('by_name').findMany({
    where: (_users, { predicate }) =>
      predicate((row) => row.name.startsWith('A')),
    cursor: null,
    limit: 1,
    maxScan: 50,
  });

  type Row = (typeof result)['page'][number];
  Expect<Equal<Row, UserRow>>;
}

// index-compiled operators should not require allowFullScan
{
  await db.query.users.findMany({
    where: { name: { ne: 'Alice' } },
  });
  await db.query.users.findMany({
    where: { name: { notIn: ['Alice', 'Bob'] } },
  });
  await db.query.users.findMany({
    where: { deletedAt: { isNotNull: true } },
  });
}

// id-branded strings should not be treated as full-scan operator objects
// (GenericId includes String prototype keys like "endsWith")
{
  const cityId = 'city' as unknown as GenericId<'cities'>;

  await db.query.users.findFirst({
    where: { cityId },
  });

  await db.query.users.findMany({
    where: { cityId },
  });

  await db.query.users.findFirst({
    where: { cityId: { eq: cityId } },
  });

  await db.query.users.findMany({
    where: { cityId: { eq: cityId } },
  });
}

// non-indexable operators require .withIndex(...)
{
  // @ts-expect-error - .withIndex(...) required for non-indexable operator (endsWith)
  await db.query.users.findMany({
    where: { email: { endsWith: '@example.com' } },
  });
  await db.query.users.withIndex('by_email').findMany({
    where: { email: { endsWith: '@example.com' } },
  });

  // @ts-expect-error - .withIndex(...) required for non-indexable operator (NOT)
  await db.query.users.findMany({
    where: { NOT: { name: 'Alice' } },
  });
  await db.query.users.withIndex('by_name').findMany({
    where: { NOT: { name: 'Alice' } },
  });
}

// object where can span multiple indexed fields without .withIndex(...)
{
  await db.query.users.findMany({
    where: { name: 'Alice', age: 30 },
  });

  await db.query.users.withIndex('by_name').findMany({
    where: { name: 'Alice', age: 30 },
  });
}

// non-leading compound-only fields can run without explicit .withIndex(...)
{
  await db.query.posts.findMany({
    where: { numLikes: 10 },
  });

  await db.query.posts.withIndex('numLikesAndType').findMany({
    where: { numLikes: 10 },
  });
}

// cursor mode uses maxScan for scan-fallback operators (with explicit index)
{
  await db.query.users.withIndex('by_email').findMany({
    where: { email: { endsWith: '@example.com' } },
    cursor: null,
    limit: 10,
    maxScan: 200,
  });
}

// ============================================================================
// SEARCH QUERY TYPE TESTS
// ============================================================================

// search works on tables with search indexes
{
  const result = await db.query.posts.findMany({
    search: {
      index: 'text_search',
      query: 'galaxy',
    },
  });

  type Row = (typeof result)[number];
  Expect<Equal<Row['text'], string>>;
}

// search filters are typed from filterFields
{
  await db.query.posts.findMany({
    search: {
      index: 'text_search',
      query: 'galaxy',
      filters: {
        type: 'article',
      },
    },
  });

  await db.query.posts.findMany({
    // @ts-expect-error - only search filterFields are allowed
    search: {
      index: 'text_search',
      query: 'galaxy',
      filters: {
        published: true,
      },
    },
  });
}

// search index name is strongly typed
{
  await db.query.posts.findMany({
    // @ts-expect-error - invalid search index name
    search: {
      index: 'by_title',
      query: 'galaxy',
    },
  });
}

// search is disallowed on tables with no search indexes
{
  await db.query.users.findMany({
    // @ts-expect-error - users table has no search indexes
    search: {
      index: 'text_search',
      query: 'alice',
    },
  });
}

// search + orderBy is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - search results are relevance ordered and do not allow orderBy
    search: {
      index: 'text_search',
      query: 'galaxy',
    },
    orderBy: { createdAt: 'desc' },
  });
}

// search + where(fn) is disallowed
{
  const disallowedWhereFn = (post: any, { eq }: any) =>
    eq(post.type, 'article');
  await db.query.posts.findMany({
    // @ts-expect-error - predicate where is not allowed with search
    search: {
      index: 'text_search',
      query: 'galaxy',
    },
    where: disallowedWhereFn,
  });
}

// search + relation where is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - relation-based where is not allowed with search
    search: {
      index: 'text_search',
      query: 'galaxy',
    },
    where: {
      author: { name: 'Alice' },
    },
  });
}

// search + with is allowed for eager loading
{
  const result = await db.query.posts.findMany({
    search: {
      index: 'text_search',
      query: 'galaxy',
    },
    with: {
      author: true,
    },
  });

  type Row = (typeof result)[number];
  type Author = Row['author'];
  Expect<Equal<Author extends object | null ? true : false, true>>;
}

// ============================================================================
// VECTOR SEARCH TYPE TESTS
// ============================================================================

// vectorSearch works on tables with vector indexes
{
  const result = await db.query.posts.findMany({
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
  });

  type Row = (typeof result)[number];
  Expect<Equal<Row['text'], string>>;
}

// vectorSearch filter fields are typed from vector index filterFields
{
  await db.query.posts.findMany({
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
      filter: (q) => q.eq('type', 'article'),
    },
  });

  await db.query.posts.findMany({
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
      // @ts-expect-error - only vector index filterFields are allowed
      filter: (q) => q.eq('published', true),
    },
  });
}

// vectorSearch index name is strongly typed
{
  await db.query.posts.findMany({
    // @ts-expect-error - invalid vector index name
    vectorSearch: {
      index: 'text_search',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
  });
}

// vectorSearch is disallowed on tables with no vector indexes
{
  await db.query.users.findMany({
    // @ts-expect-error - users table has no vector indexes
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
  });
}

// vectorSearch + orderBy is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search results are similarity ordered and do not allow orderBy
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    orderBy: { createdAt: 'desc' },
  });
}

// vectorSearch + cursor pagination is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search does not support cursor pagination
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    // @ts-expect-error - vector search does not support cursor pagination
    cursor: null,
  });
}

// vectorSearch + where(object) is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search does not allow where object filters
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    where: { type: 'article' },
  });
}

// vectorSearch + where(fn) is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search does not allow predicate where
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    where: (posts, { eq }) => eq(posts.type, 'article'),
  });
}

// vectorSearch + index is disallowed
{
  await db.query.posts.withIndex('by_author').findMany({
    // @ts-expect-error - vector search does not allow withIndex
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
  });
}

// vectorSearch + offset is disallowed
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search does not allow offset composition
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    // @ts-expect-error - vector search does not allow offset
    offset: 1,
  });
}

// vectorSearch + top-level limit is disallowed (use vectorSearch.limit)
{
  await db.query.posts.findMany({
    // @ts-expect-error - vector search uses vectorSearch.limit, not top-level limit
    vectorSearch: {
      index: 'embedding_vec',
      vector: [0.1, 0.2, 0.3],
      limit: 10,
    },
    limit: 1,
  });
}

export {};
