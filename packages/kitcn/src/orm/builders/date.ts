import type { Validator } from 'convex/values';
import { v } from 'convex/values';
import type { HasDefault } from './column-builder';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

export type ConvexDateMode = 'string' | 'date';

type ConvexDateBuilderConfig<
  TName extends string,
  TMode extends ConvexDateMode,
> = {
  name: TName;
  dataType: 'string';
  columnType: 'ConvexDate';
  data: TMode extends 'date' ? Date : string;
  driverParam: string;
  enumValues: undefined;
};

export type ConvexDateBuilderInitial<
  TName extends string,
  TMode extends ConvexDateMode = 'string',
> = ConvexDateBuilder<ConvexDateBuilderConfig<TName, TMode>, TMode>;

type ConvexDateRuntimeConfig<TMode extends ConvexDateMode> = {
  mode: TMode;
};

type ConvexDateBuilderArg<TMode extends ConvexDateMode> = {
  mode?: TMode;
};

const toDateOnlyIsoString = (value: Date): string =>
  value.toISOString().slice(0, 10);

export class ConvexDateBuilder<
  T extends ColumnBuilderBaseConfig<'string', 'ConvexDate'>,
  TMode extends ConvexDateMode = ConvexDateMode,
> extends ConvexColumnBuilder<T, ConvexDateRuntimeConfig<TMode>> {
  static override readonly [entityKind]: string = 'ConvexDateBuilder';

  constructor(name: T['name'], mode: TMode) {
    super(name, 'string', 'ConvexDate');
    this.config.mode = mode;
  }

  get convexValidator(): Validator<any, any, any> {
    if (this.config.notNull) {
      return v.string();
    }
    return v.optional(v.union(v.null(), v.string()));
  }

  defaultNow(): HasDefault<this> {
    if (this.config.mode === 'date') {
      return this.$defaultFn(() => new Date() as any) as HasDefault<this>;
    }
    return this.$defaultFn(
      () => toDateOnlyIsoString(new Date()) as any
    ) as HasDefault<this>;
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

const normalizeDateFactoryArgs = (
  nameOrConfig?: string | ConvexDateBuilderArg<ConvexDateMode>,
  maybeConfig?: ConvexDateBuilderArg<ConvexDateMode>
): { name: string; mode: ConvexDateMode } => {
  const name = typeof nameOrConfig === 'string' ? nameOrConfig : '';
  const config = typeof nameOrConfig === 'string' ? maybeConfig : nameOrConfig;
  return {
    name,
    mode: config?.mode ?? 'string',
  };
};

export function date(): ConvexDateBuilderInitial<'', 'string'>;
export function date<TName extends string>(
  name: TName
): ConvexDateBuilderInitial<TName, 'string'>;
export function date<TMode extends ConvexDateMode>(
  config: ConvexDateBuilderArg<TMode>
): ConvexDateBuilderInitial<'', TMode>;
export function date<TName extends string, TMode extends ConvexDateMode>(
  name: TName,
  config: ConvexDateBuilderArg<TMode>
): ConvexDateBuilderInitial<TName, TMode>;
export function date(
  nameOrConfig?: string | ConvexDateBuilderArg<ConvexDateMode>,
  maybeConfig?: ConvexDateBuilderArg<ConvexDateMode>
) {
  const { name, mode } = normalizeDateFactoryArgs(nameOrConfig, maybeConfig);
  return new ConvexDateBuilder(name, mode);
}
