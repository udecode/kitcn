import type { GenericDatabaseWriter } from 'convex/server';
import type { OrmWriter } from '../database';
import type { TableRelationalConfig, TablesRelationalConfig } from '../relations';
import type { InferSelectModel } from '../types';

const MIGRATION_ID_RE = /^[a-zA-Z0-9_:-]+$/;
const FUNCTION_SOURCE_WHITESPACE_RE = /\s+/g;
const FUNCTION_SOURCE_PUNCTUATION_SPACE_RE = /\s*([{}();,:])\s*/g;

export type MigrationDirection = 'up' | 'down';
export type MigrationRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'dry_run'
  | 'noop';
export type MigrationWriteMode = 'safe_bypass' | 'normal';

export type MigrationTableName<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  [K in keyof TSchema]-?: TSchema[K] extends TableRelationalConfig
    ? TSchema[K]['name']
    : never;
}[keyof TSchema] &
  string;

type MigrationTableConfigByName<
  TSchema extends TablesRelationalConfig,
  TTableName extends MigrationTableName<TSchema>,
> = {
  [K in keyof TSchema]-?: TSchema[K] extends TableRelationalConfig
    ? TSchema[K]['name'] extends TTableName
      ? TSchema[K]
      : never
    : never;
}[keyof TSchema];

export type MigrationDoc<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableName extends MigrationTableName<TSchema> = MigrationTableName<TSchema>,
> = MigrationTableConfigByName<TSchema, TTableName> extends TableRelationalConfig
  ? Partial<
      InferSelectModel<MigrationTableConfigByName<TSchema, TTableName>['table']>
    > &
      Record<string, unknown>
  : Record<string, unknown>;

export type MigrationDocContext<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  db: GenericDatabaseWriter<any>;
  orm: OrmWriter<TSchema>;
  migrationId: string;
  runId: string;
  direction: MigrationDirection;
  dryRun: boolean;
  writeMode: MigrationWriteMode;
};

export type MigrationMigrateOne<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableName extends MigrationTableName<TSchema> = MigrationTableName<TSchema>,
> = (
  ctx: MigrationDocContext<TSchema>,
  doc: MigrationDoc<TSchema, TTableName>
) => Promise<unknown> | unknown;

type MigrationStepByTable<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
  TTableName extends MigrationTableName<TSchema> = MigrationTableName<TSchema>,
> = {
  table: TTableName;
  batchSize?: number;
  writeMode?: MigrationWriteMode;
  migrateOne: MigrationMigrateOne<TSchema, TTableName>;
};

export type MigrationStep<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  [TTableName in MigrationTableName<TSchema>]: MigrationStepByTable<
    TSchema,
    TTableName
  >;
}[MigrationTableName<TSchema>];

export type MigrationDefinition<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  id: string;
  name?: string;
  description?: string;
  up: MigrationStep<TSchema>;
  down?: MigrationStep<TSchema>;
  checksum?: string;
};

export type MigrationManifestEntry<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = MigrationDefinition<TSchema> & {
  checksum: string;
};

export type MigrationSet<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  migrations: readonly MigrationManifestEntry<TSchema>[];
  ids: readonly string[];
  byId: Readonly<Record<string, MigrationManifestEntry<TSchema>>>;
};

export type MigrationAppliedState = {
  applied: boolean;
  checksum?: string;
  cursor?: string | null;
  processed?: number;
};

export type MigrationStateMap = Readonly<Record<string, MigrationAppliedState>>;

export type MigrationDriftIssue =
  | {
      kind: 'missing_from_manifest';
      migrationId: string;
      message: string;
    }
  | {
      kind: 'checksum_mismatch';
      migrationId: string;
      message: string;
      expectedChecksum: string;
      actualChecksum: string;
    };

export type MigrationPlan<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
> = {
  direction: MigrationDirection;
  migrations: readonly MigrationManifestEntry<TSchema>[];
};

export function defineMigration<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
>(migration: MigrationDefinition<TSchema>): MigrationDefinition<TSchema> {
  validateMigrationId(migration.id);
  validateMigrationStep('up', migration.up);
  if (migration.down) {
    validateMigrationStep('down', migration.down);
  }
  return migration;
}

export function defineMigrationSet<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
>(migrations: readonly MigrationDefinition<TSchema>[]): MigrationSet<TSchema> {
  const normalized = [...migrations].map((migration) => {
    const defined = defineMigration(migration);
    return {
      ...defined,
      checksum: defined.checksum ?? computeMigrationChecksum(defined),
    } as MigrationManifestEntry<TSchema>;
  });

  normalized.sort((a, b) => a.id.localeCompare(b.id));

  const byId: Record<string, MigrationManifestEntry<TSchema>> = {};
  for (const migration of normalized) {
    if (byId[migration.id]) {
      throw new Error(
        `defineMigrationSet received duplicate migration id '${migration.id}'.`
      );
    }
    byId[migration.id] = migration;
  }

  return {
    migrations: normalized,
    ids: normalized.map((migration) => migration.id),
    byId,
  };
}

export function detectMigrationDrift<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
>(params: {
  migrationSet: MigrationSet<TSchema>;
  appliedState: MigrationStateMap;
}): MigrationDriftIssue[] {
  const { migrationSet, appliedState } = params;
  const issues: MigrationDriftIssue[] = [];

  for (const [migrationId, state] of Object.entries(appliedState)) {
    if (!state.applied) {
      continue;
    }
    const migration = migrationSet.byId[migrationId];
    if (!migration) {
      issues.push({
        kind: 'missing_from_manifest',
        migrationId,
        message: `Applied migration '${migrationId}' is missing from the current migration manifest.`,
      });
      continue;
    }
    if (state.checksum && state.checksum !== migration.checksum) {
      issues.push({
        kind: 'checksum_mismatch',
        migrationId,
        expectedChecksum: migration.checksum,
        actualChecksum: state.checksum,
        message: `Applied migration '${migrationId}' checksum drift detected.`,
      });
    }
  }

  return issues;
}

export function buildMigrationPlan<
  TSchema extends TablesRelationalConfig = TablesRelationalConfig,
>(params: {
  direction: MigrationDirection;
  migrationSet: MigrationSet<TSchema>;
  appliedState: MigrationStateMap;
  steps?: number;
  to?: string;
}): MigrationPlan<TSchema> {
  const { direction, migrationSet, appliedState, steps, to } = params;
  if (direction === 'up') {
    return {
      direction,
      migrations: migrationSet.migrations.filter(
        (migration) => !appliedState[migration.id]?.applied
      ),
    };
  }

  if (steps !== undefined && to !== undefined) {
    throw new Error('Use either down steps or down to, not both.');
  }

  const appliedInOrder = migrationSet.migrations.filter(
    (migration) => appliedState[migration.id]?.applied
  );

  const ensureDownSteps = (
    selected: MigrationManifestEntry<TSchema>[]
  ): MigrationManifestEntry<TSchema>[] => {
    const missingDown = selected.find((migration) => !migration.down);
    if (missingDown) {
      throw new Error(
        `Cannot execute down migration for '${missingDown.id}': missing down migration handler.`
      );
    }
    return selected;
  };

  if (to) {
    const targetIndex = migrationSet.ids.indexOf(to);
    if (targetIndex === -1) {
      throw new Error(`Unknown migration id '${to}' for down --to.`);
    }
    return {
      direction,
      migrations: ensureDownSteps(
        appliedInOrder.filter((migration) => {
          const migrationIndex = migrationSet.ids.indexOf(migration.id);
          return migrationIndex > targetIndex;
        })
      ).reverse(),
    };
  }

  const resolvedSteps = steps ?? 1;
  if (!Number.isInteger(resolvedSteps) || resolvedSteps < 1) {
    throw new Error('Down steps must be a positive integer.');
  }

  return {
    direction,
    migrations: ensureDownSteps(appliedInOrder.slice(-resolvedSteps).reverse()),
  };
}

function validateMigrationId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new Error('Migration id must be a non-empty string.');
  }
  if (!MIGRATION_ID_RE.test(id)) {
    throw new Error(
      `Migration id '${id}' is invalid. Use alphanumeric characters, '_' ':' or '-'.`
    );
  }
}

function validateMigrationStep<TSchema extends TablesRelationalConfig>(
  direction: string,
  step: MigrationStep<TSchema>
): void {
  if (!step || typeof step !== 'object') {
    throw new Error(`Migration ${direction} step must be an object.`);
  }
  if (!step.table || typeof step.table !== 'string') {
    throw new Error(`Migration ${direction} step.table must be a string.`);
  }
  if (typeof step.migrateOne !== 'function') {
    throw new Error(
      `Migration ${direction} step.migrateOne must be a function.`
    );
  }
  if (
    step.batchSize !== undefined &&
    (!Number.isInteger(step.batchSize) || step.batchSize < 1)
  ) {
    throw new Error(
      `Migration ${direction} step.batchSize must be a positive integer.`
    );
  }
  if (
    step.writeMode !== undefined &&
    step.writeMode !== 'safe_bypass' &&
    step.writeMode !== 'normal'
  ) {
    throw new Error(
      `Migration ${direction} step.writeMode must be 'safe_bypass' or 'normal'.`
    );
  }
}

function computeMigrationChecksum<TSchema extends TablesRelationalConfig>(
  migration: MigrationDefinition<TSchema>
): string {
  const normalized = JSON.stringify({
    id: migration.id,
    name: migration.name ?? null,
    description: migration.description ?? null,
    up: serializeStep(migration.up),
    down: migration.down ? serializeStep(migration.down) : null,
  });
  return simpleStableHash(normalized);
}

function serializeStep<TSchema extends TablesRelationalConfig>(
  step: MigrationStep<TSchema>
) {
  return {
    table: step.table,
    batchSize: step.batchSize ?? null,
    writeMode: step.writeMode ?? 'safe_bypass',
    source: normalizeFunctionSource(step.migrateOne),
  };
}

function normalizeFunctionSource(fn: Function): string {
  return fn
    .toString()
    .replace(FUNCTION_SOURCE_WHITESPACE_RE, ' ')
    .replace(FUNCTION_SOURCE_PUNCTUATION_SPACE_RE, '$1')
    .trim();
}

function simpleStableHash(value: string): string {
  let hashA = 0x81_1c_9d_c5;
  let hashB = 0x01_00_01_93;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01_00_01_93);

    hashB ^= code + i;
    hashB = Math.imul(hashB, 0x85_eb_ca_6b);
  }
  const a = (hashA >>> 0).toString(16).padStart(8, '0');
  const b = (hashB >>> 0).toString(16).padStart(8, '0');
  return `m_${a}${b}`;
}
