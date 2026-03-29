/**
 * Convex Column Builder - Convex-specific base class
 *
 * Extends ColumnBuilder with Convex-specific functionality:
 * - Compiles to Convex validators (v.string(), v.number(), etc.)
 * - Handles optional vs required via .notNull()
 *
 * @example
 * text().notNull() → v.string()
 * text() → v.optional(v.string())
 */

import type { Validator } from 'convex/values';
import {
  ColumnBuilder,
  type ColumnBuilderBaseConfig,
  type ColumnDataType,
  entityKind,
} from './column-builder';

export type { ColumnBuilderBaseConfig } from './column-builder';
// Re-export for use by specific builders
export { entityKind } from './column-builder';

/**
 * Convex-specific column builder base class
 *
 * All Convex column builders (ConvexTextBuilder, ConvexIntegerBuilder, etc.)
 * inherit from this class.
 */
export abstract class ConvexColumnBuilder<
  T extends ColumnBuilderBaseConfig<
    ColumnDataType,
    string
  > = ColumnBuilderBaseConfig<ColumnDataType, string>,
  TRuntimeConfig extends object = object,
> extends ColumnBuilder<T, TRuntimeConfig, { dialect: 'convex' }> {
  static override readonly [entityKind]: string = 'ConvexColumnBuilder';

  /**
   * Build method - compiles builder to Convex validator
   *
   * Subclasses implement this to produce the correct validator:
   * - text() → v.string() or v.optional(v.string())
   * - integer() → v.number() or v.optional(v.number())
   * - etc.
   *
   * @returns Convex validator for this column
   */
  abstract override build(): Validator<any, any, any>;
}
