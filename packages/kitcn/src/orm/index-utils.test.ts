/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */
import {
  findIndexForColumns,
  findRelationIndex,
  findRelationIndexOrThrow,
  findSearchIndexByName,
  findVectorIndexByName,
  getIndexes,
  getSearchIndexes,
  getVectorIndexes,
  resolveIndexOrderPushdown,
} from './index-utils';

describe('index-utils', () => {
  test('getIndexes reads method output only', () => {
    const fromMethod = {
      getIndexes: () => [{ name: 'by_name', fields: ['name'] }],
    };
    expect(getIndexes(fromMethod as any)).toEqual([
      { name: 'by_name', fields: ['name'] },
    ]);

    expect(getIndexes({ getIndexes: () => null } as any)).toEqual([]);
    expect(
      getIndexes({ indexes: [{ indexDescriptor: 'by_email' }] } as any)
    ).toEqual([]);
  });

  test('getSearchIndexes reads method output only', () => {
    const fromMethod = {
      getSearchIndexes: () => [
        { name: 'text_search', searchField: 'text', filterFields: ['type'] },
      ],
    };
    expect(getSearchIndexes(fromMethod as any)).toEqual([
      { name: 'text_search', searchField: 'text', filterFields: ['type'] },
    ]);

    expect(getSearchIndexes({ getSearchIndexes: () => null } as any)).toEqual(
      []
    );
    expect(
      getSearchIndexes({
        searchIndexes: [
          {
            indexDescriptor: 'text_search',
            searchField: 'text',
            filterFields: undefined,
          },
        ],
      } as any)
    ).toEqual([]);
  });

  test('getVectorIndexes reads method output only', () => {
    const fromMethod = {
      getVectorIndexes: () => [
        {
          name: 'embedding_vec',
          vectorField: 'embedding',
          dimensions: 1536,
          filterFields: ['type'],
        },
      ],
    };
    expect(getVectorIndexes(fromMethod as any)).toEqual([
      {
        name: 'embedding_vec',
        vectorField: 'embedding',
        dimensions: 1536,
        filterFields: ['type'],
      },
    ]);

    expect(getVectorIndexes({ getVectorIndexes: () => null } as any)).toEqual(
      []
    );
    expect(
      getVectorIndexes({
        vectorIndexes: [
          {
            indexDescriptor: 'embedding_vec',
            vectorField: 'embedding',
            dimensions: 1536,
            filterFields: undefined,
          },
        ],
      } as any)
    ).toEqual([]);
  });

  test('findSearchIndexByName and findVectorIndexByName return hit or null', () => {
    const table = {
      getSearchIndexes: () => [
        { name: 'text_search', searchField: 'text', filterFields: [] },
      ],
      getVectorIndexes: () => [
        {
          name: 'embedding_vec',
          vectorField: 'embedding',
          dimensions: 1536,
          filterFields: [],
        },
      ],
    };

    expect(
      findSearchIndexByName(table as any, 'text_search')?.searchField
    ).toBe('text');
    expect(findSearchIndexByName(table as any, 'missing')).toBeNull();

    expect(
      findVectorIndexByName(table as any, 'embedding_vec')?.dimensions
    ).toBe(1536);
    expect(findVectorIndexByName(table as any, 'missing')).toBeNull();
  });

  test('findIndexForColumns matches compound index prefixes', () => {
    const indexes = [
      { name: 'by_name', fields: ['name'] },
      { name: 'by_type_likes', fields: ['type', 'numLikes'] },
    ];

    expect(findIndexForColumns(indexes, ['name'])).toBe('by_name');
    expect(findIndexForColumns(indexes, ['type'])).toBe('by_type_likes');
    expect(findIndexForColumns(indexes, ['type', 'numLikes'])).toBe(
      'by_type_likes'
    );
    expect(findIndexForColumns(indexes, ['numLikes'])).toBeNull();
  });

  test('findRelationIndex throws without index unless allowFullScan', () => {
    const table = { getIndexes: () => [{ name: 'by_name', fields: ['name'] }] };

    expect(() =>
      findRelationIndex(
        table as any,
        ['email'],
        'users.posts',
        'users',
        true,
        false
      )
    ).toThrow(/requires index/i);
  });

  test('findRelationIndex returns null with allowFullScan and warns in strict mode', () => {
    const table = { getIndexes: () => [{ name: 'by_name', fields: ['name'] }] };
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const strictNull = findRelationIndex(
      table as any,
      ['email'],
      'users.posts',
      'users',
      true,
      true
    );
    expect(strictNull).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockClear();

    const nonStrictNull = findRelationIndex(
      table as any,
      ['email'],
      'users.posts',
      'users',
      false,
      true
    );
    expect(nonStrictNull).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  test('findRelationIndexOrThrow returns index or throws', () => {
    const table = {
      getIndexes: () => [{ name: 'by_author', fields: ['authorId'] }],
    };

    expect(
      findRelationIndexOrThrow(
        table as any,
        ['authorId'],
        'posts.author',
        'posts',
        false
      )
    ).toBe('by_author');

    expect(() =>
      findRelationIndexOrThrow(
        table as any,
        ['missingField'],
        'posts.author',
        'posts',
        false
      )
    ).toThrow(/requires index/i);
  });

  test('findRelationIndex prefers a later index that serves the order', () => {
    const table = {
      getIndexes: () => [
        { name: 'by_author', fields: ['authorId'] },
        { name: 'by_author_likes', fields: ['authorId', 'numLikes'] },
      ],
    };

    expect(
      findRelationIndex(
        table as any,
        ['authorId'],
        'users.posts',
        'posts',
        true,
        false,
        [{ field: 'numLikes', direction: 'desc' }]
      )
    ).toBe('by_author_likes');
  });
});

describe('resolveIndexOrderPushdown', () => {
  const asc = (field: string) => [{ field, direction: 'asc' as const }];
  const desc = (field: string) => [{ field, direction: 'desc' as const }];

  test('serves the first index field left unpinned by eq', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['type', 'numLikes'],
        pinnedEqCount: 1,
        orderSpecs: desc('numLikes'),
      })
    ).toBe('desc');
  });

  test('serves _creationTime only once every index field is pinned', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['authorId'],
        pinnedEqCount: 1,
        orderSpecs: desc('_creationTime'),
      })
    ).toBe('desc');

    // (type, numLikes) with only `type` pinned walks numLikes order, not
    // creation order, so `.order()` would silently sort by the wrong column.
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['type', 'numLikes'],
        pinnedEqCount: 1,
        orderSpecs: desc('_creationTime'),
      })
    ).toBeNull();
  });

  test('serves a pinned field because it is constant across the scan', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['type', 'numLikes'],
        pinnedEqCount: 1,
        orderSpecs: asc('type'),
      })
    ).toBe('asc');
  });

  test('serves the leading field when nothing is pinned', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['publishedAt'],
        pinnedEqCount: 0,
        orderSpecs: desc('publishedAt'),
      })
    ).toBe('desc');
  });

  test('declines a field the index does not sort by next', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['authorId', 'published'],
        pinnedEqCount: 1,
        orderSpecs: asc('numLikes'),
      })
    ).toBeNull();
  });

  test('declines without an index', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: null,
        pinnedEqCount: 0,
        orderSpecs: desc('_creationTime'),
      })
    ).toBeNull();
  });

  test('declines a multi-field sort that changes direction partway', () => {
    // `.order()` reverses the whole key tuple, so a scan is one direction.
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['authorId', 'numLikes'],
        pinnedEqCount: 1,
        orderSpecs: [
          { field: 'numLikes', direction: 'desc', nullable: false },
          { field: 'title', direction: 'asc', nullable: false },
        ],
      })
    ).toBeNull();
  });

  test('declines when there is no sort at all', () => {
    expect(
      resolveIndexOrderPushdown({
        indexFields: ['authorId'],
        pinnedEqCount: 1,
        orderSpecs: [],
      })
    ).toBeNull();
  });

  describe('multi-field sorts', () => {
    const spec = (field: string, direction: 'asc' | 'desc') => ({
      field,
      direction,
      nullable: false,
    });

    test('serves a sort that is a prefix of the index, in index order', () => {
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [spec('type', 'asc'), spec('numLikes', 'asc')],
        })
      ).toBe('asc');

      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes', 'title'],
          pinnedEqCount: 0,
          orderSpecs: [spec('type', 'desc'), spec('numLikes', 'desc')],
        })
      ).toBe('desc');
    });

    test('declines a sort that skips or reorders an index key', () => {
      // (type, numLikes) walks every numLikes inside one type, so sorting by
      // title next means re-sorting inside each of those buckets.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes', 'title'],
          pinnedEqCount: 0,
          orderSpecs: [spec('type', 'asc'), spec('title', 'asc')],
        })
      ).toBeNull();

      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [spec('numLikes', 'asc'), spec('type', 'asc')],
        })
      ).toBeNull();
    });

    test('absorbs an eq-pinned field at any position and any direction', () => {
      // `type` is constant across the scan, so it is already sorted whichever
      // way the caller asked and wherever it sits in the sort.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 1,
          orderSpecs: [spec('type', 'asc'), spec('numLikes', 'desc')],
        })
      ).toBe('desc');

      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 1,
          orderSpecs: [spec('numLikes', 'desc'), spec('type', 'asc')],
        })
      ).toBe('desc');
    });

    test('serves _creationTime only as the final spec', () => {
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [
            spec('type', 'asc'),
            spec('numLikes', 'asc'),
            spec('_creationTime', 'asc'),
          ],
        })
      ).toBe('asc');

      // Nothing follows the implicit trailing key.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type'],
          pinnedEqCount: 0,
          orderSpecs: [
            spec('type', 'asc'),
            spec('_creationTime', 'asc'),
            spec('numLikes', 'asc'),
          ],
        })
      ).toBeNull();

      // ...and it is only reached once every declared field is consumed.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [spec('type', 'asc'), spec('_creationTime', 'asc')],
        })
      ).toBeNull();
    });

    test('declines when a sort column can be missing or null', () => {
      // A Convex index sorts absent and null first; the post-fetch comparator
      // sorts them last. Only a sort the two agree on may move into the index.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['authorId', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [
            { field: 'authorId', direction: 'asc', nullable: true },
            spec('numLikes', 'asc'),
          ],
        })
      ).toBeNull();

      // Unknown nullability counts as nullable.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['type', 'numLikes'],
          pinnedEqCount: 0,
          orderSpecs: [
            { field: 'type', direction: 'asc' },
            { field: 'numLikes', direction: 'asc' },
          ],
        })
      ).toBeNull();

      // An eq-pinned nullable field is constant across the scan, so the two
      // orders cannot disagree about it.
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['authorId', 'numLikes'],
          pinnedEqCount: 1,
          orderSpecs: [
            { field: 'authorId', direction: 'asc', nullable: true },
            spec('numLikes', 'asc'),
          ],
        })
      ).toBe('asc');
    });

    test('still serves a single nullable spec, as it always has', () => {
      expect(
        resolveIndexOrderPushdown({
          indexFields: ['deletedAt'],
          pinnedEqCount: 0,
          orderSpecs: [
            { field: 'deletedAt', direction: 'asc', nullable: true },
          ],
        })
      ).toBe('asc');
    });

    test('models the default by_creation_time index as an empty key list', () => {
      expect(
        resolveIndexOrderPushdown({
          indexFields: [],
          pinnedEqCount: 0,
          orderSpecs: [spec('_creationTime', 'desc')],
        })
      ).toBe('desc');

      expect(
        resolveIndexOrderPushdown({
          indexFields: [],
          pinnedEqCount: 0,
          orderSpecs: [spec('_creationTime', 'desc'), spec('numLikes', 'desc')],
        })
      ).toBeNull();
    });
  });
});
