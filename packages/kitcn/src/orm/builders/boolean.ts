/**
 * Boolean Column Builder
 *
 * Creates boolean columns in Convex tables.
 * Maps to Convex v.boolean() or v.optional(v.boolean()).
 *
 * @example
 * boolean().notNull() → v.boolean()
 * boolean() → v.optional(v.boolean())
 * boolean().default(false) → v.optional(v.boolean()) with default
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

/**
 * Initial type for ConvexBooleanBuilder
 */
export type ConvexBooleanBuilderInitial<TName extends string> =
  ConvexBooleanBuilder<{
    name: TName;
    dataType: 'boolean';
    columnType: 'ConvexBoolean';
    data: boolean;
    driverParam: boolean;
    enumValues: undefined;
  }>;

/**
 * Boolean column builder class
 * Compiles to v.boolean() or v.optional(v.boolean())
 */
export class ConvexBooleanBuilder<
  T extends ColumnBuilderBaseConfig<'boolean', 'ConvexBoolean'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexBooleanBuilder';

  constructor(name: T['name']) {
    super(name, 'boolean', 'ConvexBoolean');
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.boolean();
    }
    return v.optional(v.union(v.null(), v.boolean()));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.boolean()
   * nullable → v.optional(v.boolean())
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * boolean() factory function
 *
 * Creates a boolean column builder.
 *
 * @example
 * boolean() → unnamed column
 * boolean('col_name') → named column
 */
export function boolean(): ConvexBooleanBuilderInitial<''>;
export function boolean<TName extends string>(
  name: TName
): ConvexBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
  return new ConvexBooleanBuilder(name ?? '');
}
