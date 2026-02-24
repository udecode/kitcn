/**
 * Type tests for relation loading with `with` option
 *
 * Includes a local self-referential `node` relation schema for type-only
 * assertions so runtime schema guardrails (inverse/cycle detection) remain
 * unchanged.
 */

import {
  createOrm,
  defineRelations,
  extractRelationsConfig,
} from 'better-convex/orm';
import type { GenericDatabaseReader } from 'convex/server';
import type { GenericId } from 'convex/values';
import * as schema from './tables-rel';
import { type Equal, Expect } from './utils';

type UserId = string;
type PostId = string;
type CommentId = string;
type CityId = string;
type BookId = string;
type NodeId = string;

// Build schema following Better Convex pattern
const schemaConfig = schema.relations;
const edgeMetadata = extractRelationsConfig(schema.relations);

// Mock database reader for type testing
const mockDb = {} as GenericDatabaseReader<any>;
const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);

// ============================================================================
// DRIZZLE PARITY TESTS (pg db-rel.ts)
// ============================================================================

{
  const result = await db.query.users.findMany({
    where: { name: 'Alice' },
    limit: 1,
    orderBy: (users, { asc, desc }) => [asc(users.name), desc(users.email)],
    with: {
      posts: {
        where: { title: 'Hello' },
        limit: 1,
        columns: {
          content: false,
          title: undefined,
        },
        with: {
          author: true,
          comments: {
            where: { text: 'Nice' },
            limit: 1,
            columns: {
              text: true,
            },
            with: {
              author: {
                columns: {
                  name: undefined,
                },
                with: {
                  city: {
                    with: {
                      users: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  type Expected = Array<{
    id: UserId;
    createdAt: number;
    name: string;
    email: string;
    height: number | null;
    age: number | null;
    status: string | null;
    role: string | null;
    deletedAt: number | null;
    cityId: CityId | null;
    homeCityId: CityId | null;
    posts: Array<{
      id: PostId;
      createdAt: number;
      text: string;
      numLikes: number;
      type: string;
      embedding: number[] | null;
      title: string | null;
      authorId: UserId | null;
      publishedAt: number | null;
      published: boolean | null;
      author: {
        id: UserId;
        createdAt: number;
        name: string;
        email: string;
        height: number | null;
        age: number | null;
        status: string | null;
        role: string | null;
        deletedAt: number | null;
        cityId: CityId | null;
        homeCityId: CityId | null;
      } | null;
      comments: Array<{
        text: string;
        author: {
          city: {
            id: CityId;
            createdAt: number;
            name: string;
            users: Array<{
              id: UserId;
              createdAt: number;
              name: string;
              email: string;
              height: number | null;
              age: number | null;
              status: string | null;
              role: string | null;
              deletedAt: number | null;
              cityId: CityId | null;
              homeCityId: CityId | null;
            }>;
          } | null;
        } | null;
      }>;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 1: Basic findMany with relations
{
  const result = await db.query.users.findMany({
    with: {
      posts: true,
    },
  });

  type Expected = Array<{
    id: UserId;
    createdAt: number;
    name: string;
    email: string;
    height: number | null;
    age: number | null;
    status: string | null;
    role: string | null;
    deletedAt: number | null;
    cityId: CityId | null;
    homeCityId: CityId | null;
    posts: Array<{
      id: PostId;
      createdAt: number;
      text: string;
      numLikes: number;
      type: string;
      embedding: number[] | null;
      title: string | null;
      content: string | null;
      authorId: UserId | null;
      publishedAt: number | null;
      published: boolean | null;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 2: Nested relations
{
  const result = await db.query.users.findMany({
    with: {
      posts: {
        with: {
          comments: true,
        },
      },
    },
  });

  type Expected = Array<{
    id: UserId;
    createdAt: number;
    name: string;
    email: string;
    height: number | null;
    age: number | null;
    status: string | null;
    role: string | null;
    deletedAt: number | null;
    cityId: CityId | null;
    homeCityId: CityId | null;
    posts: Array<{
      id: PostId;
      createdAt: number;
      text: string;
      numLikes: number;
      type: string;
      embedding: number[] | null;
      title: string | null;
      content: string | null;
      authorId: UserId | null;
      publishedAt: number | null;
      published: boolean | null;
      comments: Array<{
        id: CommentId;
        createdAt: number;
        postId: PostId;
        authorId: UserId | null;
        text: string;
      }>;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 3: Column selection with relations
{
  const result = await db.query.users.findMany({
    columns: {
      name: true,
      email: true,
    },
    with: {
      posts: {
        columns: {
          title: true,
        },
      },
    },
  });

  type Expected = Array<{
    name: string;
    email: string;
    posts: Array<{
      title: string | null;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 4: One relation (nullable)
{
  const result = await db.query.posts.findMany({
    with: {
      author: true,
    },
  });

  type Expected = Array<{
    id: PostId;
    createdAt: number;
    text: string;
    numLikes: number;
    type: string;
    embedding: number[] | null;
    title: string | null;
    content: string | null;
    authorId: UserId | null;
    publishedAt: number | null;
    published: boolean | null;
    author: {
      id: UserId;
      createdAt: number;
      name: string;
      email: string;
      height: number | null;
      age: number | null;
      status: string | null;
      role: string | null;
      deletedAt: number | null;
      cityId: CityId | null;
      homeCityId: CityId | null;
    } | null;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 5: Self-referential relations
{
  const nodeRelations = defineRelations({ node: schema.node }, (r) => ({
    node: {
      parent: r.one.node({
        from: r.node.parentId,
        to: r.node.id,
        alias: 'NodeParentTypeTest',
      }),
      left: r.one.node({
        from: r.node.leftId,
        to: r.node.id,
        alias: 'NodeLeftTypeTest',
      }),
      right: r.one.node({
        from: r.node.rightId,
        to: r.node.id,
        alias: 'NodeRightTypeTest',
      }),
    },
  }));
  const nodeOrm = createOrm({ schema: nodeRelations });
  const nodeDb = nodeOrm.db(mockDb);

  const result = await nodeDb.query.node.findMany({
    with: {
      parent: true,
      left: true,
      right: true,
    },
  });

  type NodeType = {
    id: NodeId;
    createdAt: number;
    parentId: NodeId | null;
    leftId: NodeId | null;
    rightId: NodeId | null;
  };

  type Expected = Array<
    NodeType & {
      parent: NodeType | null;
      left: NodeType | null;
      right: NodeType | null;
    }
  >;

  type Row = (typeof result)[number];
  Expect<Equal<Row['id'], NodeId>>;
  Expect<Equal<Row['parentId'], NodeId | null>>;
  Expect<Equal<Row['leftId'], NodeId | null>>;
  Expect<Equal<Row['rightId'], NodeId | null>>;
  Expect<Equal<Row['parent'], NodeType | null>>;
  Expect<Equal<Row['left'], NodeType | null>>;
  Expect<Equal<Row['right'], NodeType | null>>;
}

// Test 6: Many-to-many through join table
{
  const result = await db.query.books.findMany({
    with: {
      authors: true,
    },
  });

  type Expected = Array<{
    id: BookId;
    createdAt: number;
    name: string;
    authors: Array<{
      id: UserId;
      createdAt: number;
      name: string;
      email: string;
      height: number | null;
      age: number | null;
      status: string | null;
      role: string | null;
      deletedAt: number | null;
      cityId: CityId | null;
      homeCityId: CityId | null;
    }>;
  }>;

  Expect<Equal<Expected, typeof result>>;
}

// Test 7: findFirst returns single item or null
{
  const result = await db.query.users.findFirst({
    with: {
      posts: true,
    },
  });

  type Expected = {
    id: UserId;
    createdAt: number;
    name: string;
    email: string;
    height: number | null;
    age: number | null;
    status: string | null;
    role: string | null;
    deletedAt: number | null;
    cityId: CityId | null;
    homeCityId: CityId | null;
    posts: Array<{
      id: PostId;
      createdAt: number;
      text: string;
      numLikes: number;
      type: string;
      embedding: number[] | null;
      title: string | null;
      content: string | null;
      authorId: UserId | null;
      publishedAt: number | null;
      published: boolean | null;
    }>;
  } | null;

  Expect<Equal<Expected, typeof result>>;
}

// ============================================================================
// NEGATIVE TYPE TESTS - Invalid usage should error
// ============================================================================

db.query.users.findMany({
  with: {
    // @ts-expect-error - Invalid relation name
    invalidRelation: true,
  },
});

db.query.users.findMany({
  columns: {
    // @ts-expect-error - Invalid column name in selection
    invalidColumn: true,
  },
});

db.query.users.findMany({
  with: {
    posts: {
      with: {
        // @ts-expect-error - Invalid nested relation
        invalidNestedRelation: true,
      },
    },
  },
});

// findFirst intentionally supports where/orderBy (see test/types/select.ts).
db.query.users.findFirst({
  // @ts-expect-error - limit is not allowed on findFirst
  limit: 10,
});
