/**
 * Text Column Builder
 *
 * Creates string columns in Convex tables.
 * Maps to Convex v.string() or v.optional(v.string()).
 *
 * @example
 * text().notNull() → v.string()
 * text() → v.optional(v.string())
 * text().default('draft') → v.optional(v.string()) with default
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

/**
 * Initial type for ConvexTextBuilder
 * Used in factory function return types
 * Matches Drizzle's pattern with all required properties
 */
export type ConvexTextBuilderInitial<TName extends string> = ConvexTextBuilder<{
  name: TName;
  dataType: 'string';
  columnType: 'ConvexText';
  data: string;
  driverParam: string;
  enumValues: undefined;
}>;

/**
 * Text column builder class
 * Compiles to v.string() or v.optional(v.string())
 */
export class ConvexTextBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexText'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexTextBuilder';

  constructor(name: T['name']) {
    super(name, 'string', 'ConvexText');
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.string();
    }
    return v.optional(v.union(v.null(), v.string()));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.string()
   * nullable → v.optional(v.string())
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * text() factory function
 *
 * Creates a text column builder.
 * Supports both named and unnamed columns (for later binding).
 *
 * @example
 * text() → unnamed column
 * text('col_name') → named column
 */
export function text(): ConvexTextBuilderInitial<''>;
export function text<TName extends string>(
  name: TName
): ConvexTextBuilderInitial<TName>;
export function text(name?: string) {
  return new ConvexTextBuilder(name ?? '');
}
