import { type ColumnBuilderBase, entityKind } from './builders/column-builder';

export type ConvexIndexColumn = ColumnBuilderBase;

export interface ConvexIndexConfig<
  TName extends string = string,
  TColumns extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
  TUnique extends boolean = boolean,
> {
  columns: TColumns;
  name: TName;
  unique: TUnique;
  where?: unknown;
}

export interface ConvexSearchIndexConfig<
  TName extends string = string,
  TSearchField extends ConvexIndexColumn = ConvexIndexColumn,
  TFilterFields extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  filterFields: TFilterFields;
  name: TName;
  searchField: TSearchField;
  staged: boolean;
}

export interface ConvexVectorIndexConfig<
  TName extends string = string,
  TVectorField extends ConvexIndexColumn = ConvexIndexColumn,
  TFilterFields extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  dimensions: number;
  filterFields: TFilterFields;
  name: TName;
  staged: boolean;
  vectorField: TVectorField;
}

export interface ConvexAggregateIndexConfig<
  TName extends string = string,
  TColumns extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  avgFields: readonly ConvexIndexColumn[];
  columns: TColumns;
  countFields: readonly ConvexIndexColumn[];
  maxFields: readonly ConvexIndexColumn[];
  minFields: readonly ConvexIndexColumn[];
  name: TName;
  sumFields: readonly ConvexIndexColumn[];
}

export class ConvexIndexBuilderOn<
  TName extends string = string,
  TUnique extends boolean = boolean,
> {
  static readonly [entityKind] = 'ConvexIndexBuilderOn';
  readonly [entityKind] = 'ConvexIndexBuilderOn';

  constructor(
    private name: TName,
    private unique: TUnique
  ) {}

  on<TColumns extends [ConvexIndexColumn, ...ConvexIndexColumn[]]>(
    ...columns: TColumns
  ): ConvexIndexBuilder<TName, TColumns, TUnique> {
    return new ConvexIndexBuilder(this.name, columns, this.unique);
  }
}

export class ConvexIndexBuilder<
  TName extends string = string,
  TColumns extends readonly [ConvexIndexColumn, ...ConvexIndexColumn[]] = [
    ConvexIndexColumn,
    ...ConvexIndexColumn[],
  ],
  TUnique extends boolean = boolean,
> {
  static readonly [entityKind] = 'ConvexIndexBuilder';
  readonly [entityKind] = 'ConvexIndexBuilder';

  declare _: {
    brand: 'ConvexIndexBuilder';
    name: TName;
    columns: TColumns;
    unique: TUnique;
  };

  config: ConvexIndexConfig<TName, TColumns, TUnique>;

  constructor(name: TName, columns: TColumns, unique: TUnique) {
    this.config = {
      name,
      columns,
      unique,
      where: undefined,
    };
  }

  /**
   * Partial index conditions are not supported in Convex.
   * This method is kept for Drizzle API parity.
   */
  where(condition: unknown): this {
    this.config.where = condition;
    return this;
  }
}

export class ConvexSearchIndexBuilderOn<TName extends string = string> {
  static readonly [entityKind] = 'ConvexSearchIndexBuilderOn';
  readonly [entityKind] = 'ConvexSearchIndexBuilderOn';

  constructor(private name: TName) {}

  on<TSearchField extends ConvexIndexColumn>(
    searchField: TSearchField
  ): ConvexSearchIndexBuilder<TName, TSearchField> {
    return new ConvexSearchIndexBuilder(this.name, searchField);
  }
}

export class ConvexSearchIndexBuilder<
  TName extends string = string,
  TSearchField extends ConvexIndexColumn = ConvexIndexColumn,
  TFilterFields extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  static readonly [entityKind] = 'ConvexSearchIndexBuilder';
  readonly [entityKind] = 'ConvexSearchIndexBuilder';

  declare _: {
    brand: 'ConvexSearchIndexBuilder';
    name: TName;
    searchField: TSearchField;
    filterFields: TFilterFields;
  };

  config: ConvexSearchIndexConfig<TName, TSearchField, TFilterFields>;

  constructor(name: TName, searchField: TSearchField) {
    this.config = {
      name,
      searchField,
      filterFields: [] as unknown as TFilterFields,
      staged: false,
    };
  }

  filter<TNextFilterFields extends readonly ConvexIndexColumn[]>(
    ...fields: TNextFilterFields
  ): ConvexSearchIndexBuilder<TName, TSearchField, TNextFilterFields> {
    this.config.filterFields = fields as unknown as TFilterFields;
    return this as unknown as ConvexSearchIndexBuilder<
      TName,
      TSearchField,
      TNextFilterFields
    >;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

type ConvexVectorIndexConfigInternal = Omit<
  ConvexVectorIndexConfig<
    string,
    ConvexIndexColumn,
    readonly ConvexIndexColumn[]
  >,
  'dimensions'
> & { dimensions?: number };

export class ConvexVectorIndexBuilderOn<TName extends string = string> {
  static readonly [entityKind] = 'ConvexVectorIndexBuilderOn';
  readonly [entityKind] = 'ConvexVectorIndexBuilderOn';

  constructor(private name: TName) {}

  on<TVectorField extends ConvexIndexColumn>(
    vectorField: TVectorField
  ): ConvexVectorIndexBuilder<TName, TVectorField> {
    return new ConvexVectorIndexBuilder(this.name, vectorField);
  }
}

export class ConvexAggregateIndexBuilderOn<TName extends string = string> {
  static readonly [entityKind] = 'ConvexAggregateIndexBuilderOn';
  readonly [entityKind] = 'ConvexAggregateIndexBuilderOn';

  constructor(private name: TName) {}

  on<TColumns extends [ConvexIndexColumn, ...ConvexIndexColumn[]]>(
    ...columns: TColumns
  ): ConvexAggregateIndexBuilder<TName, TColumns> {
    return new ConvexAggregateIndexBuilder(this.name, columns);
  }

  all(): ConvexAggregateIndexBuilder<TName, []> {
    return new ConvexAggregateIndexBuilder(this.name, []);
  }
}

export class ConvexAggregateIndexBuilder<
  TName extends string = string,
  TColumns extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  static readonly [entityKind] = 'ConvexAggregateIndexBuilder';
  readonly [entityKind] = 'ConvexAggregateIndexBuilder';

  declare _: {
    brand: 'ConvexAggregateIndexBuilder';
    name: TName;
    columns: TColumns;
  };

  config: ConvexAggregateIndexConfig<TName, TColumns>;

  constructor(name: TName, columns: TColumns) {
    this.config = {
      name,
      columns,
      countFields: [],
      sumFields: [],
      avgFields: [],
      minFields: [],
      maxFields: [],
    };
  }

  count(...fields: readonly ConvexIndexColumn[]): this {
    this.config.countFields = [...this.config.countFields, ...fields];
    return this;
  }

  sum(...fields: readonly ConvexIndexColumn[]): this {
    this.config.sumFields = [...this.config.sumFields, ...fields];
    return this;
  }

  avg(...fields: readonly ConvexIndexColumn[]): this {
    this.config.avgFields = [...this.config.avgFields, ...fields];
    return this;
  }

  min(...fields: readonly ConvexIndexColumn[]): this {
    this.config.minFields = [...this.config.minFields, ...fields];
    return this;
  }

  max(...fields: readonly ConvexIndexColumn[]): this {
    this.config.maxFields = [...this.config.maxFields, ...fields];
    return this;
  }
}

export class ConvexVectorIndexBuilder<
  TName extends string = string,
  TVectorField extends ConvexIndexColumn = ConvexIndexColumn,
  TFilterFields extends readonly ConvexIndexColumn[] = ConvexIndexColumn[],
> {
  static readonly [entityKind] = 'ConvexVectorIndexBuilder';
  readonly [entityKind] = 'ConvexVectorIndexBuilder';

  declare _: {
    brand: 'ConvexVectorIndexBuilder';
    name: TName;
    vectorField: TVectorField;
    filterFields: TFilterFields;
  };

  config: ConvexVectorIndexConfigInternal & {
    name: TName;
    vectorField: TVectorField;
    filterFields: TFilterFields;
  };

  constructor(name: TName, vectorField: TVectorField) {
    this.config = {
      name,
      vectorField,
      dimensions: undefined,
      filterFields: [] as unknown as TFilterFields,
      staged: false,
    };
  }

  dimensions(dimensions: number): this {
    if (!Number.isInteger(dimensions)) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be an integer, got ${dimensions}`
      );
    }
    if (dimensions <= 0) {
      throw new Error(
        `Vector index '${this.config.name}' dimensions must be positive, got ${dimensions}`
      );
    }
    if (dimensions > 10_000) {
      console.warn(
        `Vector index '${this.config.name}' has unusually large dimensions (${dimensions}). Common values: 768, 1536, 3072`
      );
    }
    this.config.dimensions = dimensions;
    return this;
  }

  filter<TNextFilterFields extends readonly ConvexIndexColumn[]>(
    ...fields: TNextFilterFields
  ): ConvexVectorIndexBuilder<TName, TVectorField, TNextFilterFields> {
    this.config.filterFields = fields as unknown as TFilterFields;
    return this as unknown as ConvexVectorIndexBuilder<
      TName,
      TVectorField,
      TNextFilterFields
    >;
  }

  staged(): this {
    this.config.staged = true;
    return this;
  }
}

export function index<TName extends string>(
  name: TName
): ConvexIndexBuilderOn<TName, false> {
  return new ConvexIndexBuilderOn(name, false);
}

export function uniqueIndex<TName extends string>(
  name: TName
): ConvexIndexBuilderOn<TName, true> {
  return new ConvexIndexBuilderOn(name, true);
}

export function searchIndex<TName extends string>(
  name: TName
): ConvexSearchIndexBuilderOn<TName> {
  return new ConvexSearchIndexBuilderOn(name);
}

export function vectorIndex<TName extends string>(
  name: TName
): ConvexVectorIndexBuilderOn<TName> {
  return new ConvexVectorIndexBuilderOn(name);
}

export function aggregateIndex<TName extends string>(
  name: TName
): ConvexAggregateIndexBuilderOn<TName> {
  return new ConvexAggregateIndexBuilderOn(name);
}
