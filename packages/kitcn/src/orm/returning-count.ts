import type { GenericDatabaseWriter } from 'convex/server';
import type { EdgeMetadata } from './extractRelationsConfig';
import { type getOrmContext, getTableName } from './mutation-utils';
import { GelRelationalQuery } from './query';
import type { ConvexTable } from './table';
import {
  INTERNAL_CREATION_TIME_FIELD,
  PUBLIC_CREATED_AT_FIELD,
} from './timestamp-mode';

export type ReturningCountLoader = {
  load(
    row: Record<string, unknown>,
    countSelection: Record<string, unknown>
  ): Promise<Record<string, number>>;
};

/**
 * Builds the `returning({ _count })` reader once per mutation statement.
 *
 * The table config lookup and edge filter are invariant across rows, and — more
 * importantly — the aggregate-index readiness memo lives on the query instance.
 * Constructing a fresh `GelRelationalQuery` per row discarded it, so the
 * readiness probe ran a real indexed collect for every row x counted relation
 * instead of once per (table, index).
 */
export function createReturningCountLoader(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  ormContext: ReturnType<typeof getOrmContext>
): ReturningCountLoader {
  const schema = ormContext?.schema;
  const edgeMetadata = ormContext?.edgeMetadata;
  if (!schema || !edgeMetadata) {
    throw new Error(
      'returning({ _count }) requires orm.db(ctx) configured from createOrm({ schema, ... }).'
    );
  }

  const tableName = getTableName(table);
  const tableConfig = Object.values(schema).find(
    (config) => config.name === tableName
  );
  if (!tableConfig) {
    throw new Error(`Table config for '${tableName}' is not registered.`);
  }
  const tableEdges = edgeMetadata.filter(
    (edge) => edge.sourceTable === tableName
  );
  const countIndexReadiness = new Map<string, Promise<void>>();

  return {
    async load(row, countSelection) {
      // Still one query instance per row. It issues no read of its own now, but
      // an RLS policy expression can embed database state that the next row's
      // write invalidates, so the resolution cache it carries must not outlive
      // this row.
      const query = new GelRelationalQuery(
        schema as any,
        tableConfig as any,
        tableEdges as any,
        db as any,
        {} as any,
        'first',
        edgeMetadata as any,
        ormContext?.rls,
        ormContext?.relationLoading,
        undefined,
        undefined,
        countIndexReadiness
      );

      return await GelRelationalQuery.countRelationsForHeldRow(
        query,
        row,
        countSelection
      );
    },
  };
}

/**
 * True when any edge leaving `tableName` keys on `_creationTime`.
 *
 * The count engine reads an edge's source fields straight off the row it is
 * handed, so a caller that derives that row instead of reading it back has to
 * know whether `_creationTime` is load-bearing — a derived insert post-image
 * cannot have it, and a missing source value counts zero without erroring.
 * Asked of every edge on the table rather than only the counted ones: the
 * count selection varies per statement, the schema does not.
 */
export function countedEdgesReadCreationTime(
  edgeMetadata: EdgeMetadata[] | undefined,
  tableName: string
): boolean {
  return (edgeMetadata ?? []).some((edge) => {
    if (edge.sourceTable !== tableName) {
      return false;
    }
    const sourceFields =
      edge.sourceFields.length > 0 ? edge.sourceFields : [edge.fieldName];
    return sourceFields.some(
      (field) =>
        field === INTERNAL_CREATION_TIME_FIELD ||
        field === PUBLIC_CREATED_AT_FIELD
    );
  });
}
