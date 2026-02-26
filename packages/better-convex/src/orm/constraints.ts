import {
  type ColumnBuilderBase,
  entityKind,
  type ForeignKeyAction,
} from './builders/column-builder';
import type { FilterExpression } from './filter-expression';

export type ConvexConstraintColumn = ColumnBuilderBase;

export type ConvexForeignKeyColumns = [
  ConvexConstraintColumn,
  ...ConvexConstraintColumn[],
];

export interface ConvexUniqueConstraintConfig {
  columns: ConvexConstraintColumn[];
  name?: string;
  nullsNotDistinct: boolean;
}

export interface ConvexForeignKeyConfig<
  TColumns extends ConvexForeignKeyColumns = ConvexForeignKeyColumns,
> {
  columns: TColumns;
  foreignColumns: { [K in keyof TColumns]: ConvexConstraintColumn };
  name?: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
}

export class ConvexUniqueConstraintBuilderOn {
  static readonly [entityKind] = 'ConvexUniqueConstraintBuilderOn';
  readonly [entityKind] = 'ConvexUniqueConstraintBuilderOn';

  constructor(private name?: string) {}

  on(
    ...columns: [ConvexConstraintColumn, ...ConvexConstraintColumn[]]
  ): ConvexUniqueConstraintBuilder {
    return new ConvexUniqueConstraintBuilder(this.name, columns);
  }
}

export class ConvexUniqueConstraintBuilder {
  static readonly [entityKind] = 'ConvexUniqueConstraintBuilder';
  readonly [entityKind] = 'ConvexUniqueConstraintBuilder';

  declare _: {
    brand: 'ConvexUniqueConstraintBuilder';
  };

  config: ConvexUniqueConstraintConfig;

  constructor(name: string | undefined, columns: ConvexConstraintColumn[]) {
    this.config = {
      name,
      columns,
      nullsNotDistinct: false,
    };
  }

  nullsNotDistinct(): this {
    this.config.nullsNotDistinct = true;
    return this;
  }
}

export class ConvexForeignKeyBuilder {
  static readonly [entityKind] = 'ConvexForeignKeyBuilder';
  readonly [entityKind] = 'ConvexForeignKeyBuilder';

  declare _: {
    brand: 'ConvexForeignKeyBuilder';
  };

  config: ConvexForeignKeyConfig;

  constructor(config: ConvexForeignKeyConfig) {
    this.config = {
      ...config,
      onDelete: config.onDelete,
      onUpdate: config.onUpdate,
    };
  }

  onUpdate(action: ForeignKeyAction): this {
    this.config.onUpdate = action;
    return this;
  }

  onDelete(action: ForeignKeyAction): this {
    this.config.onDelete = action;
    return this;
  }
}

export function unique(name?: string): ConvexUniqueConstraintBuilderOn {
  return new ConvexUniqueConstraintBuilderOn(name);
}

export function foreignKey<TColumns extends ConvexForeignKeyColumns>(
  config: ConvexForeignKeyConfig<TColumns>
): ConvexForeignKeyBuilder {
  return new ConvexForeignKeyBuilder(config);
}

export interface ConvexCheckConfig {
  expression: FilterExpression<boolean>;
  name: string;
}

export class ConvexCheckBuilder {
  static readonly [entityKind] = 'ConvexCheckBuilder';
  readonly [entityKind] = 'ConvexCheckBuilder';

  declare _: {
    brand: 'ConvexCheckBuilder';
  };

  config: ConvexCheckConfig;

  constructor(name: string, expression: FilterExpression<boolean>) {
    this.config = { name, expression };
  }
}

export function check(
  name: string,
  expression: FilterExpression<boolean>
): ConvexCheckBuilder {
  return new ConvexCheckBuilder(name, expression);
}
