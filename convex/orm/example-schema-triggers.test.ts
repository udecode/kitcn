import { getTableConfig } from 'better-convex/orm';
import { describe, expect, test } from 'vitest';
import {
  relations,
  tables,
  triggers,
} from '../../example/convex/functions/schema';
import { compileCountQueryPlan } from '../../packages/better-convex/src/orm/aggregate-index/runtime';

describe('example schema aggregate triggers', () => {
  test('registers user/session create triggers in addition to aggregate change triggers', () => {
    const triggerConfig = triggers as Record<
      string,
      {
        change?: (...args: unknown[]) => unknown;
        create?: {
          before?: (...args: unknown[]) => unknown;
          after?: (...args: unknown[]) => unknown;
        };
      }
    >;

    expect(typeof triggerConfig.user?.create?.before).toBe('function');
    expect(typeof triggerConfig.user?.create?.after).toBe('function');
    expect(typeof triggerConfig.session?.create?.after).toBe('function');
  });

  test('does not register aggregate change triggers in example schema', () => {
    const nonTriggeredTables = [
      'projectMembers',
      'todoComments',
      'todoTags',
      'todos',
    ] as const;

    const triggerConfig = triggers as Record<
      string,
      { change?: (...args: unknown[]) => unknown } | undefined
    >;

    for (const tableName of nonTriggeredTables) {
      expect(triggerConfig[tableName]?.change).toBeUndefined();
    }
  });

  test('registers triggers only on user/session tables', () => {
    const triggeredTables = new Set(['session', 'triggerDemoRecord', 'user']);

    for (const [tableName, table] of Object.entries(tables)) {
      void table;
      const tableTrigger = (
        triggers as Record<
          string,
          | {
              change?: (...args: unknown[]) => unknown;
              create?: {
                before?: (...args: unknown[]) => unknown;
                after?: (...args: unknown[]) => unknown;
              };
              update?: {
                before?: (...args: unknown[]) => unknown;
                after?: (...args: unknown[]) => unknown;
              };
              delete?: {
                before?: (...args: unknown[]) => unknown;
                after?: (...args: unknown[]) => unknown;
              };
            }
          | undefined
        >
      )[tableName];

      if (triggeredTables.has(tableName)) {
        if (tableName === 'session') {
          expect(typeof tableTrigger?.create?.after).toBe('function');
          continue;
        }
        if (tableName === 'user') {
          expect(typeof tableTrigger?.create?.before).toBe('function');
          expect(typeof tableTrigger?.create?.after).toBe('function');
          continue;
        }
        if (tableName === 'triggerDemoRecord') {
          expect(typeof tableTrigger?.create?.before).toBe('function');
          expect(typeof tableTrigger?.create?.after).toBe('function');
          expect(typeof tableTrigger?.update?.before).toBe('function');
          expect(typeof tableTrigger?.update?.after).toBe('function');
          expect(typeof tableTrigger?.delete?.before).toBe('function');
          expect(typeof tableTrigger?.delete?.after).toBe('function');
          expect(typeof tableTrigger?.change).toBe('function');
          continue;
        }
      }

      expect(tableTrigger).toBeUndefined();
    }
  });

  test('member table keeps aggregate index coverage for organization.members _count', () => {
    const memberConfig = getTableConfig(tables.member as any);
    const hasByOrganization = memberConfig.aggregateIndexes.some(
      (index) =>
        index.name === 'by_organization' &&
        index.fields.length === 1 &&
        index.fields[0] === 'organizationId'
    );
    expect(hasByOrganization).toBe(true);

    const countPlan = compileCountQueryPlan((relations as any).member, {
      organizationId: 'org_123',
    });
    expect(countPlan.indexName).toBe('by_organization');
  });

  test('user.create.after uses public id field from lifecycle docs', async () => {
    const userAfter = (
      triggers as Record<
        string,
        {
          create?: {
            after?: (...args: unknown[]) => unknown;
          };
        }
      >
    ).user?.create?.after;

    const insertedOrg: Array<Record<string, unknown>> = [];
    const insertedMember: Array<Record<string, unknown>> = [];
    const updatedUser: Array<Record<string, unknown>> = [];

    await userAfter?.(
      {
        id: 'user-12345678',
        image: null,
        name: 'Alice',
        personalOrganizationId: null,
      },
      {
        orm: {
          insert: () => ({
            values: (values: Record<string, unknown>) => {
              if ('monthlyCredits' in values) {
                insertedOrg.push(values);
                return {
                  returning: async () => [{ id: 'org-1' }],
                };
              }
              insertedMember.push(values);
              return Promise.resolve();
            },
          }),
          update: () => ({
            set: (values: Record<string, unknown>) => {
              updatedUser.push(values);
              return {
                where: async () => undefined,
              };
            },
          }),
        },
      }
    );

    expect(insertedOrg[0]?.slug).toBe('personal-12345678');
    expect(insertedMember[0]?.userId).toBe('user-12345678');
    expect(updatedUser[0]).toEqual({
      lastActiveOrganizationId: 'org-1',
      personalOrganizationId: 'org-1',
    });
  });
});
