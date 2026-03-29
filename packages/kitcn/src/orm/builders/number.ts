/**
 * Number Column Builders
 *
 * Creates number columns in Convex tables.
 * Maps to Convex v.number() or v.optional(v.number()).
 *
 * Provides integer() for Drizzle parity.
 * Note: Convex v.number() is Float64 under the hood.
 *
 * @example
 * integer() → v.optional(v.number())
 * integer().default(0) → v.optional(v.number()) with default
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

/**
 * Initial type for ConvexNumberBuilder
 */
export type ConvexNumberBuilderInitial<TName extends string> =
  ConvexNumberBuilder<{
    name: TName;
    dataType: 'number';
    columnType: 'ConvexNumber';
    data: number;
    driverParam: number;
    enumValues: undefined;
  }>;

/**
 * Number column builder class
 * Compiles to v.number() or v.optional(v.number())
 */
export class ConvexNumberBuilder<
  T extends ColumnBuilderBaseConfig<'number', 'ConvexNumber'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexNumberBuilder';

  constructor(name: T['name']) {
    super(name, 'number', 'ConvexNumber');
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.number();
    }
    return v.optional(v.union(v.null(), v.number()));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.number()
   * nullable → v.optional(v.number())
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * integer() factory function
 *
 * Drizzle-parity numeric builder.
 * In Convex this maps to v.number() (Float64).
 *
 * @example
 * integer() → unnamed column
 * integer('col_name') → named column
 */
export function integer(): ConvexNumberBuilderInitial<''>;
export function integer<TName extends string>(
  name: TName
): ConvexNumberBuilderInitial<TName>;
export function integer(name?: string) {
  return new ConvexNumberBuilder(name ?? '');
}
