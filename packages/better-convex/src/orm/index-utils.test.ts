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
});
