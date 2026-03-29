/**
 * OrderBy - Type-safe ordering helpers
 *
 * Pattern from Drizzle: drizzle-orm/sql/expressions/order-by.ts
 * Provides asc() and desc() helpers for field ordering
 */

import type { ColumnBuilder } from './builders/column-builder';
import { column } from './filter-expression';
import type { OrderByClause } from './types';

/**
 * Create ascending order clause
 * Following Drizzle pattern for type-safe ordering
 *
 * @example
 * const posts = await db.query.posts.findMany({
 *   orderBy: asc(posts._creationTime),
 * });
 */
export function asc<TBuilder extends ColumnBuilder<any, any, any>>(
  builder: TBuilder
): OrderByClause<TBuilder> {
  // Extract column name from builder's config
  const columnName = (builder as any).config?.name || '';

  return {
    column: column(builder, columnName),
    direction: 'asc',
  };
}

/**
 * Create descending order clause
 * Following Drizzle pattern for type-safe ordering
 *
 * @example
 * const posts = await db.query.posts.findMany({
 *   orderBy: desc(posts._creationTime),
 * });
 */
export function desc<TBuilder extends ColumnBuilder<any, any, any>>(
  builder: TBuilder
): OrderByClause<TBuilder> {
  // Extract column name from builder's config
  const columnName = (builder as any).config?.name || '';

  return {
    column: column(builder, columnName),
    direction: 'desc',
  };
}
