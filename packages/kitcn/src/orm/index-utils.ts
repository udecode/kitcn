import type { ConvexTable } from './table';

export type TableIndex = { name: string; fields: string[] };
export type TableAggregateIndex = {
  name: string;
  fields: string[];
  countFields: string[];
  sumFields: string[];
  avgFields: string[];
  minFields: string[];
  maxFields: string[];
};
export type TableRankIndex = {
  name: string;
  partitionFields: string[];
  orderFields: Array<{
    field: string;
    direction: 'asc' | 'desc';
  }>;
  sumField?: string;
};
export type TableSearchIndex = {
  name: string;
  searchField: string;
  filterFields: string[];
};
export type TableVectorIndex = {
  name: string;
  vectorField: string;
  dimensions: number;
  filterFields: string[];
};

export function getIndexes(
  table: ConvexTable<any>
): { name: string; fields: string[] }[] {
  const indexes = (table as any).getIndexes?.();
  return Array.isArray(indexes) ? indexes : [];
}

export function getAggregateIndexes(
  table: ConvexTable<any>
): TableAggregateIndex[] {
  const indexes = (table as any).getAggregateIndexes?.();
  return Array.isArray(indexes) ? indexes : [];
}

export function getRankIndexes(table: ConvexTable<any>): TableRankIndex[] {
  const indexes = (table as any).getRankIndexes?.();
  return Array.isArray(indexes) ? indexes : [];
}

export function getSearchIndexes(table: ConvexTable<any>): TableSearchIndex[] {
  const indexes = (table as any).getSearchIndexes?.();
  return Array.isArray(indexes) ? indexes : [];
}

export function findSearchIndexByName(
  table: ConvexTable<any>,
  indexName: string
): TableSearchIndex | null {
  return (
    getSearchIndexes(table).find((index) => index.name === indexName) ?? null
  );
}

export function getVectorIndexes(table: ConvexTable<any>): TableVectorIndex[] {
  const indexes = (table as any).getVectorIndexes?.();
  return Array.isArray(indexes) ? indexes : [];
}

export function findVectorIndexByName(
  table: ConvexTable<any>,
  indexName: string
): TableVectorIndex | null {
  return (
    getVectorIndexes(table).find((index) => index.name === indexName) ?? null
  );
}

export function findIndexForColumns(
  indexes: TableIndex[],
  columns: string[]
): string | null {
  for (const index of indexes) {
    if (index.fields.length < columns.length) {
      continue;
    }
    let matches = true;
    for (let i = 0; i < columns.length; i++) {
      if (index.fields[i] !== columns[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return index.name;
    }
  }
  return null;
}

export function findRelationIndexOrThrow(
  table: ConvexTable<any>,
  columns: string[],
  relationName: string,
  targetTableName: string,
  allowFullScan = false
): string {
  const index = findRelationIndex(
    table,
    columns,
    relationName,
    targetTableName,
    true,
    allowFullScan
  );
  if (!index) {
    throw new Error(
      `Relation ${relationName} requires index on '${targetTableName}(${columns.join(
        ', '
      )})'. Set allowFullScan: true to override.`
    );
  }
  return index;
}

export function findRelationIndex(
  table: ConvexTable<any>,
  columns: string[],
  relationName: string,
  targetTableName: string,
  strict = true,
  allowFullScan = false
): string | null {
  const index = findIndexForColumns(getIndexes(table), columns);
  if (!index && !allowFullScan) {
    throw new Error(
      `Relation ${relationName} requires index on '${targetTableName}(${columns.join(
        ', '
      )})'. Set allowFullScan: true to override.`
    );
  }
  if (!index && strict) {
    console.warn(
      `Relation ${relationName} running without index (allowFullScan: true).`
    );
  }
  return index;
}
