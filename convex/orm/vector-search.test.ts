import {
  createOrm,
  requireSchemaRelations,
  type VectorSearchProvider,
} from 'better-convex/orm';
import { expect, test } from 'vitest';
import schema from '../schema';
import { convexTest, runCtx } from '../setup.testing';

const relations = requireSchemaRelations(schema);
const orm = createOrm({ schema: relations });

test('vector search returns rows in provider order', async () => {
  const t = convexTest(schema);

  let firstPostId: any;
  let secondPostId: any;

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Vector Author',
      email: 'vector-author@example.com',
    });

    firstPostId = await baseCtx.db.insert('posts', {
      text: 'first result',
      type: 'article',
      authorId,
      numLikes: 1,
      embedding: [0.1, 0.2, 0.3],
    });
    secondPostId = await baseCtx.db.insert('posts', {
      text: 'second result',
      type: 'article',
      authorId,
      numLikes: 2,
      embedding: [0.4, 0.5, 0.6],
    });
  });

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [
      { _id: secondPostId, _score: 0.92 },
      { _id: firstPostId, _score: 0.88 },
    ];

    const db = orm.db(baseCtx.db, { vectorSearch });
    const rows = await db.query.posts.findMany({
      vectorSearch: {
        index: 'embedding_vec',
        vector: [0.1, 0.2, 0.3],
        limit: 2,
      },
    });

    expect(rows.map((row) => row.id)).toEqual([secondPostId, firstPostId]);
  });
});

test('vector search exposes _score only when includeScore is enabled', async () => {
  const t = convexTest(schema);

  let postId: any;

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Vector Score Author',
      email: 'vector-score-author@example.com',
    });

    postId = await baseCtx.db.insert('posts', {
      text: 'score test',
      type: 'article',
      authorId,
      numLikes: 1,
      embedding: [0.1, 0.2, 0.3],
    });
  });

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [
      { _id: postId, _score: 0.91 },
    ];
    const db = orm.db(baseCtx.db, { vectorSearch });

    const withoutScore = await db.query.posts.findMany({
      vectorSearch: {
        index: 'embedding_vec',
        vector: [0.1, 0.2, 0.3],
        limit: 1,
      },
    });
    expect(withoutScore).toHaveLength(1);
    expect('_score' in withoutScore[0]!).toBe(false);

    const withScore = await db.query.posts.findMany({
      vectorSearch: {
        index: 'embedding_vec',
        vector: [0.1, 0.2, 0.3],
        limit: 1,
        includeScore: true,
      },
      columns: {
        text: true,
      },
    } as const);
    expect(withScore).toHaveLength(1);
    expect(withScore[0]?._score).toBeCloseTo(0.91);
  });
});

test('vector search skips missing docs from provider results', async () => {
  const t = convexTest(schema);

  let keptPostId: any;
  let deletedPostId: any;

  await t.run(async (baseCtx) => {
    const authorId = await baseCtx.db.insert('users', {
      name: 'Vector Missing Author',
      email: 'vector-missing-author@example.com',
    });

    keptPostId = await baseCtx.db.insert('posts', {
      text: 'kept result',
      type: 'article',
      authorId,
      numLikes: 1,
      embedding: [0.1, 0.2, 0.3],
    });
    deletedPostId = await baseCtx.db.insert('posts', {
      text: 'deleted result',
      type: 'article',
      authorId,
      numLikes: 2,
      embedding: [0.4, 0.5, 0.6],
    });
    await baseCtx.db.delete('posts', deletedPostId);
  });

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [
      { _id: deletedPostId, _score: 0.97 },
      { _id: keptPostId, _score: 0.91 },
    ];

    const db = orm.db(baseCtx.db, { vectorSearch });
    const rows = await db.query.posts.findMany({
      vectorSearch: {
        index: 'embedding_vec',
        vector: [0.1, 0.2, 0.3],
        limit: 2,
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(keptPostId);
  });
});

test('vector search supports with, columns, and extras', async () => {
  const t = convexTest(schema);

  let postId: any;
  let authorId: any;

  await t.run(async (baseCtx) => {
    authorId = await baseCtx.db.insert('users', {
      name: 'Vector Relation Author',
      email: 'vector-relation-author@example.com',
    });

    postId = await baseCtx.db.insert('posts', {
      text: 'vector relation result',
      type: 'article',
      authorId,
      numLikes: 1,
      embedding: [0.1, 0.2, 0.3],
    });
  });

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [
      { _id: postId, _score: 0.99 },
    ];

    const db = orm.db(baseCtx.db, { vectorSearch });
    const rows = await db.query.posts.findMany({
      vectorSearch: {
        index: 'embedding_vec',
        vector: [0.1, 0.2, 0.3],
        limit: 1,
      },
      with: {
        author: true,
      },
      columns: {
        text: true,
        authorId: true,
      },
      extras: {
        textLength: (row) => row.text.length,
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.authorId).toBe(authorId);
    expect(rows[0]?.author?.name).toBe('Vector Relation Author');
    expect(rows[0]?.textLength).toBe('vector relation result'.length);
  });
});

test('vector search throws when provider is not configured', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const ctx = await runCtx(baseCtx);

    await expect(
      ctx.orm.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
      } as any)
    ).rejects.toThrow(/vectorSearch is not configured/i);
  });
});

test('vector search guardrails reject incompatible options', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [];
    const db = orm.db(baseCtx.db, { vectorSearch });

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        orderBy: { createdAt: 'desc' },
      } as any)
    ).rejects.toThrow(/vectorSearch.+orderBy|orderBy.+vectorSearch/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        cursor: null,
        limit: 10,
      } as any)
    ).rejects.toThrow(/vectorSearch.+cursor|cursor.+vectorSearch/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        where: { type: 'article' },
      } as any)
    ).rejects.toThrow(/vectorSearch.+where|where.+vectorSearch/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        where: (_posts: any, { predicate }: any) =>
          predicate((row: any) => row.type === 'article'),
      } as any)
    ).rejects.toThrow(/vectorSearch.+where|where.+vectorSearch/i);

    await expect(
      db.query.posts.withIndex('by_author').findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
      } as any)
    ).rejects.toThrow(/vectorSearch.+withIndex|withIndex.+vectorSearch/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        offset: 1,
      } as any)
    ).rejects.toThrow(/vectorSearch.+offset|offset.+vectorSearch/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
        limit: 1,
      } as any)
    ).rejects.toThrow(/vectorSearch.+limit|limit.+vectorSearch/i);
  });
});

test('vector search validates index existence and limit bounds', async () => {
  const t = convexTest(schema);

  await t.run(async (baseCtx) => {
    const vectorSearch: VectorSearchProvider = async () => [];
    const db = orm.db(baseCtx.db, { vectorSearch });

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'missing_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 1,
        },
      } as any)
    ).rejects.toThrow(/Vector index 'missing_vec' was not found/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 0,
        },
      } as any)
    ).rejects.toThrow(/vectorSearch\.limit.+1.+256/i);

    await expect(
      db.query.posts.findMany({
        vectorSearch: {
          index: 'embedding_vec',
          vector: [0.1, 0.2, 0.3],
          limit: 257,
        },
      } as any)
    ).rejects.toThrow(/vectorSearch\.limit.+1.+256/i);
  });
});
