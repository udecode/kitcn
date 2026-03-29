import { describe, expect, test } from 'vitest';
import * as aggregateModule from './index';

describe('aggregate entrypoint', () => {
  test('createAggregate is no longer exported', () => {
    expect('createAggregate' in aggregateModule).toBe(false);
  });

  test('TableAggregate constructor is available for legacy runtime usage', () => {
    const aggregate = new aggregateModule.TableAggregate<{
      DataModel: {
        users: {
          document: {
            _id: string;
            _creationTime: number;
            name: string;
          };
        };
      };
      TableName: 'users';
      Key: string;
    }>({
      name: 'usersByName',
      table: 'users',
      sortKey: (doc) => doc.name,
    });

    expect(typeof aggregate.count).toBe('function');
    expect(typeof aggregate.trigger).toBe('function');
  });

  test('createDirectAggregate({ name }) creates a direct aggregate', () => {
    const aggregate = aggregateModule.createDirectAggregate<{
      Key: number;
      Id: string;
      Namespace: string;
    }>({
      name: 'likesByPost',
    });

    expect(typeof aggregate.count).toBe('function');
    expect(typeof aggregate.insert).toBe('function');
  });
});
