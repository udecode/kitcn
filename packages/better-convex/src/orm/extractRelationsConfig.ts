/**
 * Relations extraction for v1 defineRelations config
 *
 * Converts Relations config into EdgeMetadata for query builder.
 */

import type { One, Relation, TablesRelationalConfig } from './relations';

/**
 * M2-M3 CONTRACT: EdgeMetadata interface
 * Consumed by query builder for relation traversal
 */
export interface EdgeMetadata {
  /** Alias for disambiguation (v1 rename of relationName) */
  alias?: string;
  /** Cardinality: one-to-one/many-to-one or one-to-many */
  cardinality: 'one' | 'many';
  /** Relation field name on source */
  edgeName: string;
  /** Primary source field name (best-effort) */
  fieldName: string;
  /** Index fields for compound indexes */
  indexFields: string[];
  /** Index name for efficient lookups */
  indexName: string;
  /** Inverse edge if bidirectional relation */
  inverseEdge?: EdgeMetadata;
  /** Relation optional (one only) */
  optional: boolean;
  /** Source field names (from) */
  sourceFields: string[];
  /**
   * True when the FK columns on the source side are nullable (i.e. the relation
   * can be absent). Used to avoid rejecting optional/self-referencing relations
   * as "circular dependencies".
   */
  sourceNullable: boolean;
  /** Source table name (ts name) */
  sourceTable: string;
  /** Target field names (to) */
  targetFields: string[];
  /** Target table name (ts name) */
  targetTable: string;
  /** Many-to-many through info */
  through?: {
    table: string;
    sourceFields: string[];
    targetFields: string[];
  };
}

/**
 * Extract relations configuration from defineRelations output
 */
export function extractRelationsConfig(
  schema: TablesRelationalConfig
): EdgeMetadata[] {
  const edgeMetadata: EdgeMetadata[] = [];
  const tableNames = new Set<string>(Object.keys(schema));

  for (const [tableKey, tableConfig] of Object.entries(schema)) {
    for (const [relationName, relationValue] of Object.entries(
      tableConfig.relations
    )) {
      const relation = relationValue as Relation<any>;
      const targetTableName = relation.targetTableName;

      if (!tableNames.has(targetTableName)) {
        throw new Error(
          `Relation ${tableKey}.${relationName} references undefined table '${targetTableName}'`
        );
      }

      const sourceFields = (relation.sourceColumns ?? []).map(getColumnName);
      const targetFields = (relation.targetColumns ?? []).map(getColumnName);

      const fieldName = sourceFields[0] ?? `${relationName}Id`;

      const sourceNullable = isOne(relation)
        ? (relation.sourceColumns ?? []).some(isNullableColumn)
        : true;

      const edge: EdgeMetadata = {
        sourceTable: tableKey,
        edgeName: relationName,
        targetTable: targetTableName,
        cardinality: relation.relationType,
        fieldName,
        sourceFields,
        targetFields,
        sourceNullable,
        indexName: `${fieldName}_idx`,
        indexFields: [fieldName, '_creationTime'],
        optional: isOne(relation) ? relation.optional : true,
        alias: relation.alias,
        through:
          relation.throughTable && relation.through
            ? {
                table:
                  (relation.throughTable as any).tableName ??
                  (relation.throughTable as any).name ??
                  'unknown',
                sourceFields: relation.through.source.map((c) => c._.key),
                targetFields: relation.through.target.map((c) => c._.key),
              }
            : undefined,
      };

      edgeMetadata.push(edge);
    }
  }

  detectInverseRelations(edgeMetadata);
  detectCircularDependencies(edgeMetadata);

  return edgeMetadata;
}

/**
 * Detect and link inverse relations
 */
function detectInverseRelations(edges: EdgeMetadata[]): void {
  const edgesByTable = new Map<string, EdgeMetadata[]>();

  for (const edge of edges) {
    const bucket = edgesByTable.get(edge.sourceTable) ?? [];
    bucket.push(edge);
    edgesByTable.set(edge.sourceTable, bucket);
  }

  for (const edge of edges) {
    if (edge.inverseEdge) continue;

    const targetTableEdges = edgesByTable.get(edge.targetTable) ?? [];

    const reverseRelations = targetTableEdges.filter(
      (candidate) =>
        candidate !== edge &&
        ((edge.alias && candidate.alias === edge.alias) ||
          (!edge.alias && candidate.targetTable === edge.sourceTable))
    );

    if (reverseRelations.length > 1) {
      throw new Error(
        `Multiple relations found from "${edge.targetTable}" to "${edge.sourceTable}". ` +
          'Add alias to disambiguate.'
      );
    }

    if (reverseRelations.length === 1) {
      const inverse = reverseRelations[0];
      const isManyToMany =
        edge.cardinality === 'many' && inverse.cardinality === 'many';
      const validPairing =
        (edge.cardinality === 'one' && inverse.cardinality === 'many') ||
        (edge.cardinality === 'many' && inverse.cardinality === 'one') ||
        (edge.cardinality === 'one' && inverse.cardinality === 'one') ||
        (isManyToMany && isManyToManyInversePair(edge, inverse));

      if (!validPairing) {
        if (isManyToMany) {
          throw new Error(
            `Invalid many-to-many inverse: ${edge.sourceTable}.${edge.edgeName} <-> ${inverse.sourceTable}.${inverse.edgeName}. ` +
              'Many-to-many inverses must both use .through() with the same junction table and swapped junction columns.'
          );
        }
        throw new Error(
          `Invalid cardinality: ${edge.sourceTable}.${edge.edgeName} (${edge.cardinality}) ` +
            `cannot pair with ${inverse.sourceTable}.${inverse.edgeName} (${inverse.cardinality}).`
        );
      }

      edge.inverseEdge = inverse;
      inverse.inverseEdge = edge;
    }
  }
}

/**
 * Detect circular dependencies in relation graph
 * Only checks one() relations
 */
function detectCircularDependencies(edges: EdgeMetadata[]): void {
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    // Only required (non-nullable) one() relations participate in cycle checks.
    // Nullable FKs break dependency cycles and are common for self-references.
    if (edge.cardinality === 'one' && !edge.sourceNullable) {
      if (!graph.has(edge.sourceTable)) {
        graph.set(edge.sourceTable, new Set());
      }
      graph.get(edge.sourceTable)!.add(edge.targetTable);
    }
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) return true;
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const table of graph.keys()) {
    if (!visited.has(table) && hasCycle(table)) {
      throw new Error(
        'Circular dependency detected in required one() relations. ' +
          'Make at least one foreign key nullable (omit .notNull()) to break the cycle.'
      );
    }
  }
}

function getColumnName(column: any): string {
  const name = column?.config?.name ?? column?.name;
  if (typeof name === 'string') return name;
  return 'unknown';
}

function isNullableColumn(column: unknown): boolean {
  // ColumnBuilder has a protected runtime `config`, but we can still inspect it.
  // Treat unknown/missing as nullable to avoid false "required cycle" errors.
  const notNull = (column as any)?.config?.notNull;
  return notNull !== true;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isManyToManyInversePair(a: EdgeMetadata, b: EdgeMetadata): boolean {
  if (a.cardinality !== 'many' || b.cardinality !== 'many') return false;
  if (!a.through || !b.through) return false;
  if (a.through.table !== b.through.table) return false;
  return (
    arraysEqual(a.through.sourceFields, b.through.targetFields) &&
    arraysEqual(a.through.targetFields, b.through.sourceFields)
  );
}

function isOne(relation: Relation<any>): relation is One<any, any> {
  return relation.relationType === 'one';
}
