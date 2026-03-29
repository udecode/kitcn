import { describe, expect, test } from 'vitest';
import {
  buildMigrationPlan,
  defineMigration,
  defineMigrationSet,
  detectMigrationDrift,
} from './definitions';

describe('orm/migrations definitions', () => {
  test('defineMigrationSet enforces unique ids and deterministic ordering', () => {
    const m2 = defineMigration({
      id: '20260102_add_profile',
      up: {
        table: 'users',
        migrateOne: async () => {},
      },
    });
    const m1 = defineMigration({
      id: '20260101_add_name',
      up: {
        table: 'users',
        migrateOne: async () => {},
      },
    });
    const set = defineMigrationSet([m2, m1]);

    expect(set.ids).toEqual(['20260101_add_name', '20260102_add_profile']);
    expect(() =>
      defineMigrationSet([
        m1,
        defineMigration({
          id: '20260101_add_name',
          up: {
            table: 'users',
            migrateOne: async () => {},
          },
        }),
      ])
    ).toThrow(/duplicate migration id/i);
  });

  test('buildMigrationPlan(up) includes only unapplied migrations in ascending id order', () => {
    const set = defineMigrationSet([
      defineMigration({
        id: '20260101_first',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260102_second',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260103_third',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);

    const plan = buildMigrationPlan({
      direction: 'up',
      migrationSet: set,
      appliedState: {
        '20260101_first': {
          applied: true,
          checksum: set.byId['20260101_first'].checksum,
        },
      },
    });

    expect(plan.migrations.map((entry) => entry.id)).toEqual([
      '20260102_second',
      '20260103_third',
    ]);
  });

  test('buildMigrationPlan(down) reverses order and fails when a down step is missing', () => {
    const set = defineMigrationSet([
      defineMigration({
        id: '20260101_first',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
        down: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260102_second',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260103_third',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
        down: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const appliedState = {
      '20260101_first': {
        applied: true,
        checksum: set.byId['20260101_first'].checksum,
      },
      '20260102_second': {
        applied: true,
        checksum: set.byId['20260102_second'].checksum,
      },
      '20260103_third': {
        applied: true,
        checksum: set.byId['20260103_third'].checksum,
      },
    } as const;

    expect(() =>
      buildMigrationPlan({
        direction: 'down',
        migrationSet: set,
        appliedState,
        steps: 2,
      })
    ).toThrow(/missing down migration/i);
  });

  test('detectMigrationDrift catches checksum and manifest drift', () => {
    const set = defineMigrationSet([
      defineMigration({
        id: '20260101_first',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const drift = detectMigrationDrift({
      migrationSet: set,
      appliedState: {
        '20260101_first': {
          applied: true,
          checksum: 'bad-checksum',
        },
        '20251231_legacy': {
          applied: true,
          checksum: 'legacy-checksum',
        },
      },
    });

    expect(drift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'checksum_mismatch',
          migrationId: '20260101_first',
        }),
        expect.objectContaining({
          kind: 'missing_from_manifest',
          migrationId: '20251231_legacy',
        }),
      ])
    );
  });

  test('buildMigrationPlan(down --to) rolls back newer applied migrations only', () => {
    const set = defineMigrationSet([
      defineMigration({
        id: '20260101_first',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
        down: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260102_second',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
        down: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
      defineMigration({
        id: '20260103_third',
        up: {
          table: 'users',
          migrateOne: async () => {},
        },
        down: {
          table: 'users',
          migrateOne: async () => {},
        },
      }),
    ]);
    const appliedState = {
      '20260101_first': {
        applied: true,
        checksum: set.byId['20260101_first'].checksum,
      },
      '20260102_second': {
        applied: true,
        checksum: set.byId['20260102_second'].checksum,
      },
      '20260103_third': {
        applied: true,
        checksum: set.byId['20260103_third'].checksum,
      },
    } as const;

    const plan = buildMigrationPlan({
      direction: 'down',
      migrationSet: set,
      appliedState,
      to: '20260101_first',
    });

    expect(plan.migrations.map((entry) => entry.id)).toEqual([
      '20260103_third',
      '20260102_second',
    ]);
  });
});
