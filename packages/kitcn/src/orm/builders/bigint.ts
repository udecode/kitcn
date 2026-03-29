/**
 * BigInt Column Builder
 *
 * Creates bigint columns in Convex tables.
 * Maps to Convex v.int64() or v.optional(v.int64()).
 *
 * Note: Convex int64 maps to JavaScript bigint type.
 * For regular numbers (Float64), use integer() instead.
 *
 * @example
 * bigint().notNull() → v.int64()
 * bigint() → v.optional(v.int64())
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

/**
 * Initial type for ConvexBigIntBuilder
 */
export type ConvexBigIntBuilderInitial<TName extends string> =
  ConvexBigIntBuilder<{
    name: TName;
    dataType: 'bigint';
    columnType: 'ConvexBigInt';
    data: bigint;
    driverParam: bigint;
    enumValues: undefined;
  }>;

/**
 * BigInt column builder class
 * Compiles to v.int64() or v.optional(v.int64())
 */
export class ConvexBigIntBuilder<
  T extends ColumnBuilderBaseConfig<'bigint', 'ConvexBigInt'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexBigIntBuilder';

  constructor(name: T['name']) {
    super(name, 'bigint', 'ConvexBigInt');
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.int64();
    }
    return v.optional(v.union(v.null(), v.int64()));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.int64()
   * nullable → v.optional(v.int64())
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * bigint() factory function
 *
 * Creates a bigint column builder (int64 in Convex).
 * For JavaScript bigint values.
 *
 * @example
 * bigint() → unnamed column
 * bigint('col_name') → named column
 */
export function bigint(): ConvexBigIntBuilderInitial<''>;
export function bigint<TName extends string>(
  name: TName
): ConvexBigIntBuilderInitial<TName>;
export function bigint(name?: string) {
  return new ConvexBigIntBuilder(name ?? '');
}
