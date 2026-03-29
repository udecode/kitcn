import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import type { HasDefault } from './column-builder';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

export type ConvexTimestampMode = 'date' | 'string';

type ConvexTimestampBuilderConfig<
  TName extends string,
  TMode extends ConvexTimestampMode,
> = {
  name: TName;
  dataType: 'number';
  columnType: 'ConvexTimestamp';
  data: TMode extends 'string' ? string : Date;
  driverParam: number;
  enumValues: undefined;
};

export type ConvexTimestampBuilderInitial<
  TName extends string,
  TMode extends ConvexTimestampMode = 'date',
> = ConvexTimestampBuilder<ConvexTimestampBuilderConfig<TName, TMode>, TMode>;

type ConvexTimestampRuntimeConfig<TMode extends ConvexTimestampMode> = {
  mode: TMode;
};

type ConvexTimestampBuilderArg<TMode extends ConvexTimestampMode> = {
  mode?: TMode;
};

export class ConvexTimestampBuilder<
  T extends ColumnBuilderBaseConfig<'number', 'ConvexTimestamp'>,
  TMode extends ConvexTimestampMode = ConvexTimestampMode,
> extends ConvexColumnBuilder<T, ConvexTimestampRuntimeConfig<TMode>> {
  static override readonly [entityKind]: string = 'ConvexTimestampBuilder';

  constructor(name: T['name'], mode: TMode) {
    super(name, 'number', 'ConvexTimestamp');
    this.config.mode = mode;
  }

  get convexValidator(): Validator<any, any, any> {
    if (
      this.config.notNull &&
      this.config.name === 'createdAt' &&
      typeof this.config.defaultFn === 'function'
    ) {
      return v.optional(v.number());
    }
    if (this.config.notNull) {
      return v.number();
    }
    return v.optional(v.union(v.null(), v.number()));
  }

  defaultNow(): HasDefault<this> {
    if (this.config.mode === 'string') {
      return this.$defaultFn(
        () => new Date().toISOString() as any
      ) as HasDefault<this>;
    }
    return this.$defaultFn(() => new Date() as any) as HasDefault<this>;
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

const normalizeTimestampFactoryArgs = (
  nameOrConfig?: string | ConvexTimestampBuilderArg<ConvexTimestampMode>,
  maybeConfig?: ConvexTimestampBuilderArg<ConvexTimestampMode>
): { name: string; mode: ConvexTimestampMode } => {
  const name = typeof nameOrConfig === 'string' ? nameOrConfig : '';
  const config = typeof nameOrConfig === 'string' ? maybeConfig : nameOrConfig;
  return {
    name,
    mode: config?.mode ?? 'date',
  };
};

export function timestamp(): ConvexTimestampBuilderInitial<'', 'date'>;
export function timestamp<TName extends string>(
  name: TName
): ConvexTimestampBuilderInitial<TName, 'date'>;
export function timestamp<TMode extends ConvexTimestampMode>(
  config: ConvexTimestampBuilderArg<TMode>
): ConvexTimestampBuilderInitial<'', TMode>;
export function timestamp<
  TName extends string,
  TMode extends ConvexTimestampMode,
>(
  name: TName,
  config: ConvexTimestampBuilderArg<TMode>
): ConvexTimestampBuilderInitial<TName, TMode>;
export function timestamp(
  nameOrConfig?: string | ConvexTimestampBuilderArg<ConvexTimestampMode>,
  maybeConfig?: ConvexTimestampBuilderArg<ConvexTimestampMode>
) {
  const { name, mode } = normalizeTimestampFactoryArgs(
    nameOrConfig,
    maybeConfig
  );
  return new ConvexTimestampBuilder(name, mode);
}
