import type { ColumnBuilder } from './builders/column-builder';
import type {
  SystemFieldAliases,
  SystemFields,
} from './builders/system-fields';
import { createSystemFields } from './builders/system-fields';
import { getAggregateIndexes, getIndexes, getRankIndexes } from './index-utils';
import {
  getChecks,
  getForeignKeys,
  getTableName,
  getUniqueIndexes,
} from './mutation-utils';
import type { RlsPolicy } from './rls/policies';
import { Columns, EnableRLS, RlsPolicies } from './symbols';
import type { ConvexTable } from './table';

type AnyColumns = Record<string, ColumnBuilder<any, any, any>>;

function getSystemFields<TTable extends ConvexTable<any>>(
  table: TTable
): SystemFields<TTable['_']['name']> &
  SystemFieldAliases<TTable['_']['name'], TTable[typeof Columns]> {
  if ((table as any).id && (table as any)._creationTime) {
    return {
      id: (table as any).id,
      createdAt: (table as any)._creationTime ?? (table as any).createdAt,
    } as SystemFields<TTable['_']['name']> &
      SystemFieldAliases<TTable['_']['name'], TTable[typeof Columns]>;
  }

  const system = createSystemFields(getTableName(table) as TTable['_']['name']);
  for (const builder of Object.values(system)) {
    (builder as any).config.table = table;
  }
  return {
    id: system.id,
    createdAt: (system as any).createdAt,
  } as SystemFields<TTable['_']['name']> &
    SystemFieldAliases<TTable['_']['name'], TTable[typeof Columns]>;
}

export function getTableColumns<TTable extends ConvexTable<any>>(
  table: TTable
): TTable[typeof Columns] &
  SystemFields<TTable['_']['name']> &
  SystemFieldAliases<TTable['_']['name'], TTable[typeof Columns]> {
  return {
    ...(((table as any)[Columns] ?? {}) as AnyColumns),
    ...getSystemFields(table),
  } as TTable[typeof Columns] &
    SystemFields<TTable['_']['name']> &
    SystemFieldAliases<TTable['_']['name'], TTable[typeof Columns]>;
}

export type TableConfigResult<TTable extends ConvexTable<any>> = {
  name: string;
  columns: ReturnType<typeof getTableColumns<TTable>>;
  indexes: ReturnType<typeof getIndexes>;
  aggregateIndexes: ReturnType<typeof getAggregateIndexes>;
  rankIndexes: ReturnType<typeof getRankIndexes>;
  uniqueIndexes: ReturnType<typeof getUniqueIndexes>;
  foreignKeys: ReturnType<typeof getForeignKeys>;
  checks: ReturnType<typeof getChecks>;
  rls: {
    enabled: boolean;
    policies: RlsPolicy[];
  };
};

export function getTableConfig<TTable extends ConvexTable<any>>(
  table: TTable
): TableConfigResult<TTable> {
  const policies: RlsPolicy[] =
    (table as any).getRlsPolicies?.() ?? (table as any)[RlsPolicies] ?? [];
  const enabled: boolean =
    (table as any).isRlsEnabled?.() ?? (table as any)[EnableRLS] ?? false;

  return {
    name: getTableName(table),
    columns: getTableColumns(table),
    indexes: getIndexes(table),
    aggregateIndexes: getAggregateIndexes(table),
    rankIndexes: getRankIndexes(table),
    uniqueIndexes: getUniqueIndexes(table),
    foreignKeys: getForeignKeys(table),
    checks: getChecks(table),
    rls: { enabled, policies },
  };
}
