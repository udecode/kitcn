/**
 * Bytes Column Builder
 *
 * Creates bytes columns in Convex tables.
 * Maps to Convex v.bytes() or v.optional(v.bytes()).
 *
 * @example
 * bytes().notNull() → v.bytes()
 * bytes() → v.optional(v.bytes())
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

export type ConvexBytesBuilderInitial<TName extends string> =
  ConvexBytesBuilder<{
    name: TName;
    dataType: 'bytes';
    columnType: 'ConvexBytes';
    data: ArrayBuffer;
    driverParam: ArrayBuffer;
    enumValues: undefined;
  }>;

export class ConvexBytesBuilder<
  T extends ColumnBuilderBaseConfig<'bytes', 'ConvexBytes'>,
> extends ConvexColumnBuilder<T> {
  static override readonly [entityKind]: string = 'ConvexBytesBuilder';

  constructor(name: T['name']) {
    super(name, 'bytes', 'ConvexBytes');
  }

  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.bytes();
    }
    return v.optional(v.union(v.null(), v.bytes()));
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

export function bytes(): ConvexBytesBuilderInitial<''>;
export function bytes<TName extends string>(
  name: TName
): ConvexBytesBuilderInitial<TName>;
export function bytes(name?: string) {
  return new ConvexBytesBuilder(name ?? '');
}
