/**
 * Text Enum Column Builder
 *
 * Convex-native enum helper that feels Drizzle-ish.
 * Produces a text() column with a literal union validator.
 *
 * @example
 * textEnum(['active', 'inactive']).notNull()
 */

import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

type EnumValues = readonly [string, ...string[]];

export type ConvexTextEnumBuilderInitial<
  TName extends string,
  TValues extends EnumValues,
> = ConvexTextEnumBuilder<{
  name: TName;
  dataType: 'string';
  columnType: 'ConvexText';
  data: TValues[number];
  driverParam: TValues[number];
  enumValues: TValues[number][];
}>;

export class ConvexTextEnumBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexText'>,
> extends ConvexColumnBuilder<T, { values: string[] }> {
  static override readonly [entityKind]: string = 'ConvexTextEnumBuilder';

  constructor(name: T['name'], values: readonly string[]) {
    super(name, 'string', 'ConvexText');
    this.config.values = [...values];
  }

  private _enumValidator(): Validator<any, any, any> {
    const literals = this.config.values.map((value) => v.literal(value));
    if (literals.length === 1) {
      return literals[0];
    }
    return v.union(...literals);
  }

  get convexValidator(): Validator<any, any, any> {
    const base = this._enumValidator();
    if (this.config.notNull) {
      return base;
    }
    return v.optional(v.union(v.null(), base));
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

export function textEnum<const TValues extends EnumValues>(
  values: TValues
): ConvexTextEnumBuilderInitial<'', TValues> {
  return new ConvexTextEnumBuilder('', values as readonly string[]) as any;
}
