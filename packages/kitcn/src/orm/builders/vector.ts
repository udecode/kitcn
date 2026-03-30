/**
 * Vector Column Builder
 *
 * Creates vector columns in Convex tables.
 * Maps to Convex v.array(v.float64()) or v.optional(v.array(v.float64())).
 *
 * @example
 * vector(1536).notNull() → v.array(v.float64())
 * vector('embedding', 768) → v.optional(v.array(v.float64()))
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

const MAX_VECTOR_DIMENSIONS = 10_000;

function validateVectorDimensions(
  dimensions: number,
  columnName: string
): void {
  if (!Number.isInteger(dimensions)) {
    throw new Error(
      `Vector column '${columnName}' dimensions must be an integer, got ${dimensions}`
    );
  }
  if (dimensions <= 0) {
    throw new Error(
      `Vector column '${columnName}' dimensions must be positive, got ${dimensions}`
    );
  }
  if (dimensions > MAX_VECTOR_DIMENSIONS) {
    console.warn(
      `Vector column '${columnName}' has unusually large dimensions (${dimensions}). Common values: 768, 1536, 3072`
    );
  }
}

/**
 * Initial type for ConvexVectorBuilder
 */
export type ConvexVectorBuilderInitial<TName extends string> =
  ConvexVectorBuilder<{
    name: TName;
    dataType: 'vector';
    columnType: 'ConvexVector';
    data: number[];
    driverParam: number[];
    enumValues: undefined;
  }>;

/**
 * Vector column builder class
 * Compiles to v.array(v.float64()) or v.optional(v.array(v.float64()))
 */
export class ConvexVectorBuilder<
  T extends ColumnBuilderBaseConfig<'vector', 'ConvexVector'>,
> extends ConvexColumnBuilder<T, { dimensions: number }> {
  static override readonly [entityKind]: string = 'ConvexVectorBuilder';

  constructor(name: T['name'], dimensions: number) {
    super(name, 'vector', 'ConvexVector');
    validateVectorDimensions(dimensions, name || 'vector');
    this.config.dimensions = dimensions;
  }

  get dimensions(): number {
    return this.config.dimensions;
  }

  /**
   * Expose Convex validator for schema integration
   */
  get convexValidator(): Validator<any, any, any> {
    const validator = v.array(v.float64());
    if (this.config.notNull) {
      return validator;
    }
    return v.optional(v.union(v.null(), validator));
  }

  /**
   * Compile to Convex validator
   * .notNull() → v.array(v.float64())
   * nullable → v.optional(v.array(v.float64()))
   */
  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

/**
 * vector() factory function
 *
 * Creates a vector column builder with fixed dimensions.
 *
 * @example
 * vector(1536) → unnamed column
 * vector('embedding', 1536) → named column
 */
export function vector(dimensions: number): ConvexVectorBuilderInitial<''>;
export function vector<TName extends string>(
  name: TName,
  dimensions: number
): ConvexVectorBuilderInitial<TName>;
export function vector(a: string | number, b?: number) {
  if (typeof a === 'string') {
    if (b === undefined) {
      throw new Error(
        'vector(name, dimensions) requires a dimensions number as the second argument'
      );
    }
    return new ConvexVectorBuilder(a, b);
  }
  return new ConvexVectorBuilder('', a);
}
