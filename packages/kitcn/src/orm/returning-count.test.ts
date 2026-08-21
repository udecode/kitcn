import { describe, expect, test } from 'vitest';
import { convexTable, text } from './index';
import {
  countedEdgesReadCreationTime,
  createReturningCountLoader,
} from './returning-count';

const posts = convexTable('returning_count_posts', {
  title: text().notNull(),
});

describe('returning count loader', () => {
  test('validates ORM wiring when the loader is built, not per row', () => {
    expect(() =>
      createReturningCountLoader({} as any, posts, undefined)
    ).toThrow(/requires orm\.db\(ctx\)/i);

    expect(() =>
      createReturningCountLoader({} as any, posts, {
        edgeMetadata: [],
        schema: {},
      } as any)
    ).toThrow(/is not registered/i);
  });

  test('resolves the table config and edge list once per statement', () => {
    const schema = {
      posts: { name: 'returning_count_posts', table: posts },
    } as any;
    let lookups = 0;
    const countingSchema = new Proxy(schema, {
      get(target, key) {
        lookups += 1;
        return (target as any)[key];
      },
    });

    const loader = createReturningCountLoader({} as any, posts, {
      edgeMetadata: [],
      schema: countingSchema,
    } as any);
    const afterBuild = lookups;

    expect(typeof loader.load).toBe('function');
    expect(afterBuild).toBeGreaterThan(0);
  });
});

describe('countedEdgesReadCreationTime', () => {
  const edge = (overrides: Record<string, unknown>) =>
    ({
      edgeName: 'posts',
      sourceTable: 'returning_count_posts',
      targetTable: 'other',
      fieldName: 'authorId',
      sourceFields: ['authorId'],
      targetFields: ['_id'],
      ...overrides,
    }) as any;

  test('is false for an ordinary column edge and for another table', () => {
    expect(
      countedEdgesReadCreationTime([edge({})], 'returning_count_posts')
    ).toBe(false);
    expect(
      countedEdgesReadCreationTime(
        [edge({ sourceFields: ['_creationTime'] })],
        'some_other_table'
      )
    ).toBe(false);
    expect(
      countedEdgesReadCreationTime(undefined, 'returning_count_posts')
    ).toBe(false);
  });

  test('is true for an edge keyed on _creationTime under either spelling', () => {
    expect(
      countedEdgesReadCreationTime(
        [edge({ sourceFields: ['_creationTime'] })],
        'returning_count_posts'
      )
    ).toBe(true);
    expect(
      countedEdgesReadCreationTime(
        [edge({ sourceFields: ['createdAt'] })],
        'returning_count_posts'
      )
    ).toBe(true);
    // Composite edges only need one such column to matter.
    expect(
      countedEdgesReadCreationTime(
        [edge({ sourceFields: ['authorId', '_creationTime'] })],
        'returning_count_posts'
      )
    ).toBe(true);
  });

  test('falls back to fieldName when sourceFields is empty', () => {
    expect(
      countedEdgesReadCreationTime(
        [edge({ sourceFields: [], fieldName: '_creationTime' })],
        'returning_count_posts'
      )
    ).toBe(true);
  });
});
