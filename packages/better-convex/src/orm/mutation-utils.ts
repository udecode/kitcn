import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
  Scheduler,
} from 'convex/server';
import type {
  ColumnBuilder,
  ForeignKeyAction,
} from './builders/column-builder';
import type {
  BinaryExpression,
  ExpressionVisitor,
  FilterExpression,
  LogicalExpression,
  UnaryExpression,
} from './filter-expression';
import { fieldRef, isFieldReference } from './filter-expression';
import { findIndexForColumns, getIndexes } from './index-utils';
import type { TablesRelationalConfig } from './relations';
import type { RlsContext } from './rls/types';
import type {
  OrmDeleteMode,
  OrmRuntimeDefaults,
  OrmTableDeleteConfig,
} from './symbols';
import { Columns, OrmContext, TableDeleteConfig, TableName } from './symbols';
import type { ConvexTable } from './table';
import {
  CREATED_AT_MIGRATION_MESSAGE,
  INTERNAL_CREATION_TIME_FIELD,
  PUBLIC_CREATED_AT_FIELD,
  usesSystemCreatedAtAlias,
} from './timestamp-mode';

type UniqueIndexDefinition = {
  name: string;
  fields: string[];
  nullsNotDistinct: boolean;
};

type CheckDefinition = {
  name: string;
  expression: FilterExpression<boolean>;
};

export type IncomingForeignKeyDefinition = {
  sourceTable: ConvexTable<any>;
  sourceTableName: string;
  sourceColumns: string[];
  targetTableName: string;
  targetColumns: string[];
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export type ForeignKeyGraph = {
  incomingByTable: Map<string, IncomingForeignKeyDefinition[]>;
};

export type OrmContextValue = {
  foreignKeyGraph?: ForeignKeyGraph;
  scheduler?: Scheduler;
  scheduledDelete?: SchedulableFunctionReference;
  scheduledMutationBatch?: SchedulableFunctionReference;
  rls?: RlsContext;
  strict?: boolean;
  defaults?: OrmRuntimeDefaults;
};

export type MutationRunMode = 'sync' | 'async';

const UNDEFINED_SENTINEL_KEY = '__betterConvexUndefined';
const INTERNAL_ID_FIELD = '_id';
const PUBLIC_ID_FIELD = 'id';
const DATE_COLUMN_TYPE = 'ConvexDate';
const TIMESTAMP_COLUMN_TYPE = 'ConvexTimestamp';

type SerializedFieldReference = {
  fieldName: string;
};

type SerializedBinaryExpression = {
  type: 'binary';
  operator: BinaryExpression['operator'];
  field: SerializedFieldReference;
  value: unknown;
};

type SerializedLogicalExpression = {
  type: 'logical';
  operator: LogicalExpression['operator'];
  operands: SerializedFilterExpression[];
};

type SerializedUnaryExpression = {
  type: 'unary';
  operator: UnaryExpression['operator'];
  operand: SerializedFilterExpression | SerializedFieldReference;
};

export type SerializedFilterExpression =
  | SerializedBinaryExpression
  | SerializedLogicalExpression
  | SerializedUnaryExpression;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

type TemporalColumnType =
  | typeof DATE_COLUMN_TYPE
  | typeof TIMESTAMP_COLUMN_TYPE;
type TemporalMode = 'date' | 'string';

export type TemporalColumnDescriptor = {
  name: string;
  columnType: TemporalColumnType;
  mode: TemporalMode;
};

const temporalColumnDescriptorCache = new WeakMap<
  object,
  Map<string, TemporalColumnDescriptor>
>();

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toDateOnlyString = (value: Date): string =>
  value.toISOString().slice(0, 10);

const toDateOnlyDate = (value: string): Date | string =>
  DATE_ONLY_REGEX.test(value) ? new Date(`${value}T00:00:00.000Z`) : value;

const toTimestampMillis = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return value;
};

const readTimestampValue = (value: unknown, mode: TemporalMode): unknown => {
  if (mode === 'date' && typeof value === 'number') {
    return new Date(value);
  }
  if (mode === 'string' && typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return value;
};

const getTemporalDescriptorFromColumn = (
  name: string,
  column: ColumnBuilder<any, any, any>
): TemporalColumnDescriptor | undefined => {
  const config = (column as any)?.config;
  const columnType = config?.columnType;
  if (columnType !== DATE_COLUMN_TYPE && columnType !== TIMESTAMP_COLUMN_TYPE) {
    return;
  }

  if (columnType === DATE_COLUMN_TYPE) {
    return {
      name,
      columnType,
      mode: config?.mode === 'date' ? 'date' : 'string',
    };
  }

  return {
    name,
    columnType,
    mode: config?.mode === 'string' ? 'string' : 'date',
  };
};

const getTemporalColumnDescriptors = (
  table: ConvexTable<any>
): Map<string, TemporalColumnDescriptor> => {
  const cacheKey = table as unknown as object;
  const cached = temporalColumnDescriptorCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const descriptors = new Map<string, TemporalColumnDescriptor>();
  for (const [name, column] of Object.entries(getTableColumns(table))) {
    const descriptor = getTemporalDescriptorFromColumn(name, column);
    if (!descriptor) {
      continue;
    }
    descriptors.set(name, descriptor);
  }

  temporalColumnDescriptorCache.set(cacheKey, descriptors);
  return descriptors;
};

export const getTemporalColumnDescriptor = (
  table: ConvexTable<any>,
  columnName: string
): TemporalColumnDescriptor | undefined => {
  const temporalColumns = getTemporalColumnDescriptors(table);
  const direct = temporalColumns.get(columnName);
  if (direct) {
    return direct;
  }

  const columns = getTableColumns(table);
  for (const descriptor of temporalColumns.values()) {
    const configuredName = (columns[descriptor.name] as any)?.config?.name;
    if (configuredName === columnName) {
      return descriptor;
    }
  }

  return;
};

const normalizeTemporalWriteValue = (
  descriptor: TemporalColumnDescriptor,
  value: unknown
): unknown => {
  if (descriptor.columnType === DATE_COLUMN_TYPE) {
    if (value instanceof Date) {
      return toDateOnlyString(value);
    }
    return value;
  }

  return toTimestampMillis(value);
};

const hydrateTemporalReadValue = (
  descriptor: TemporalColumnDescriptor,
  value: unknown
): unknown => {
  if (descriptor.columnType === DATE_COLUMN_TYPE) {
    if (descriptor.mode === 'date' && typeof value === 'string') {
      return toDateOnlyDate(value);
    }
    return value;
  }

  return readTimestampValue(value, descriptor.mode);
};

export const normalizeTemporalComparableValue = (
  table: ConvexTable<any>,
  fieldName: string,
  value: unknown
): unknown => {
  const descriptor = getTemporalColumnDescriptor(table, fieldName);
  if (!descriptor) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTemporalWriteValue(descriptor, entry));
  }
  return normalizeTemporalWriteValue(descriptor, value);
};

export const normalizePublicSystemFields = <T>(
  value: T,
  options?: {
    useSystemCreatedAtAlias?: boolean;
  }
): T => {
  if (!isPlainObject(value)) {
    return value;
  }
  const hasId = Object.hasOwn(value, INTERNAL_ID_FIELD);
  const hasCreationTime = Object.hasOwn(value, INTERNAL_CREATION_TIME_FIELD);

  if (!hasId && !hasCreationTime) {
    return value;
  }

  const obj = value as Record<string, unknown>;
  const { [INTERNAL_ID_FIELD]: internalId, ...rest } = obj;
  const publicRow: Record<string, unknown> = {
    ...rest,
  };

  if (hasId) {
    publicRow[PUBLIC_ID_FIELD] = internalId;
  }

  if (hasCreationTime) {
    const raw = obj[INTERNAL_CREATION_TIME_FIELD];
    if (options?.useSystemCreatedAtAlias && raw !== undefined) {
      publicRow[PUBLIC_CREATED_AT_FIELD] = raw;
    }
    delete publicRow[INTERNAL_CREATION_TIME_FIELD];
  }

  delete publicRow[INTERNAL_ID_FIELD];

  return publicRow as T;
};

export const normalizeDateFieldsForWrite = <T extends Record<string, unknown>>(
  table: ConvexTable<any>,
  value: T
): T => {
  const useSystemCreatedAt = usesSystemCreatedAtAlias(table);
  const temporalColumns = getTemporalColumnDescriptors(table);
  const result = { ...value } as Record<string, unknown>;

  if (Object.hasOwn(result, INTERNAL_CREATION_TIME_FIELD)) {
    throw new Error(CREATED_AT_MIGRATION_MESSAGE);
  }
  if (useSystemCreatedAt && Object.hasOwn(result, PUBLIC_CREATED_AT_FIELD)) {
    // createdAt is a reserved public alias for system _creationTime.
    // Writes must never set _creationTime explicitly (Convex controls it).
    delete result[PUBLIC_CREATED_AT_FIELD];
  }

  for (const [name, descriptor] of temporalColumns.entries()) {
    if (!Object.hasOwn(result, name)) {
      continue;
    }
    result[name] = normalizeTemporalWriteValue(descriptor, result[name]);
  }

  return result as T;
};

export const hydrateDateFieldsForRead = <T>(
  table: ConvexTable<any>,
  value: T
): T => {
  const rawCreationTime =
    isPlainObject(value) &&
    typeof (value as Record<string, unknown>)[INTERNAL_CREATION_TIME_FIELD] ===
      'number'
      ? (value as Record<string, unknown>)[INTERNAL_CREATION_TIME_FIELD]
      : undefined;
  const useSystemCreatedAt = usesSystemCreatedAtAlias(table);
  const base = normalizePublicSystemFields(value, {
    useSystemCreatedAtAlias: useSystemCreatedAt,
  });
  if (!isPlainObject(base)) {
    return base;
  }
  const result = { ...(base as Record<string, unknown>) };
  const temporalColumns = getTemporalColumnDescriptors(table);

  for (const [name, descriptor] of temporalColumns.entries()) {
    if (
      name === PUBLIC_CREATED_AT_FIELD &&
      result[name] === undefined &&
      rawCreationTime !== undefined
    ) {
      result[name] = hydrateTemporalReadValue(descriptor, rawCreationTime);
      continue;
    }
    result[name] = hydrateTemporalReadValue(descriptor, result[name]);
  }

  return result as T;
};

export const selectReturningRowWithHydration = (
  table: ConvexTable<any>,
  row: Record<string, unknown>,
  fields: Record<string, unknown>
): Record<string, unknown> => {
  const useSystemCreatedAt = usesSystemCreatedAtAlias(table);
  const temporalColumns = getTemporalColumnDescriptors(table);
  const selected: Record<string, unknown> = {};

  for (const [selectedKey, column] of Object.entries(fields)) {
    const columnName = getSelectionColumnName(column);
    let value = row[columnName];

    if (!(columnName === INTERNAL_CREATION_TIME_FIELD && useSystemCreatedAt)) {
      const descriptor = temporalColumns.get(columnName);
      if (descriptor) {
        value = hydrateTemporalReadValue(descriptor, value);
      }
    }

    selected[selectedKey] = value;
  }

  return {
    ...selected,
  };
};

export const encodeUndefinedDeep = (value: unknown): unknown => {
  if (value === undefined) {
    return { [UNDEFINED_SENTINEL_KEY]: true };
  }
  if (Array.isArray(value)) {
    return value.map((item) => encodeUndefinedDeep(item));
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = encodeUndefinedDeep(nested);
    }
    return result;
  }
  return value;
};

export const decodeUndefinedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => decodeUndefinedDeep(item));
  }
  if (isPlainObject(value)) {
    if (
      Object.keys(value).length === 1 &&
      value[UNDEFINED_SENTINEL_KEY] === true
    ) {
      return;
    }
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = decodeUndefinedDeep(nested);
    }
    return result;
  }
  return value;
};

const isSerializedFieldReference = (
  value: unknown
): value is SerializedFieldReference =>
  isPlainObject(value) && typeof value.fieldName === 'string';

const createBinaryExpression = (
  operator: BinaryExpression['operator'],
  fieldName: string,
  value: unknown
): BinaryExpression => {
  const field = fieldRef(fieldName);
  return {
    type: 'binary',
    operator,
    operands: [field, value] as const,
    accept<R>(visitor: ExpressionVisitor<R>): R {
      return visitor.visitBinary(this as BinaryExpression);
    },
  } as BinaryExpression;
};

const createLogicalExpression = (
  operator: LogicalExpression['operator'],
  operands: FilterExpression<boolean>[]
): LogicalExpression =>
  ({
    type: 'logical',
    operator,
    operands,
    accept<R>(visitor: ExpressionVisitor<R>): R {
      return visitor.visitLogical(this as LogicalExpression);
    },
  }) as unknown as LogicalExpression;

const createUnaryExpression = (
  operator: UnaryExpression['operator'],
  operand: FilterExpression<boolean> | ReturnType<typeof fieldRef>
): UnaryExpression =>
  ({
    type: 'unary',
    operator,
    operands: [operand] as const,
    accept<R>(visitor: ExpressionVisitor<R>): R {
      return visitor.visitUnary(this as UnaryExpression);
    },
  }) as UnaryExpression;

export const serializeFilterExpression = (
  expression: FilterExpression<boolean> | undefined
): SerializedFilterExpression | undefined => {
  if (!expression) {
    return;
  }
  if (expression.type === 'binary') {
    const binary = expression as BinaryExpression;
    const [field, value] = binary.operands;
    if (!isFieldReference(field)) {
      throw new Error(
        'Binary expression must have FieldReference as first operand'
      );
    }
    return {
      type: 'binary',
      operator: binary.operator,
      field: { fieldName: field.fieldName },
      value: encodeUndefinedDeep(value),
    };
  }
  if (expression.type === 'logical') {
    const logical = expression as LogicalExpression;
    return {
      type: 'logical',
      operator: logical.operator,
      operands: logical.operands.map((operand) =>
        serializeFilterExpression(operand)
      ) as SerializedFilterExpression[],
    };
  }
  const unary = expression as UnaryExpression;
  const [operand] = unary.operands;
  return {
    type: 'unary',
    operator: unary.operator,
    operand: isFieldReference(operand)
      ? { fieldName: operand.fieldName }
      : (serializeFilterExpression(
          operand as FilterExpression<boolean>
        ) as SerializedFilterExpression),
  };
};

export const deserializeFilterExpression = (
  expression: SerializedFilterExpression | undefined
): FilterExpression<boolean> | undefined => {
  if (!expression) {
    return;
  }
  if (expression.type === 'binary') {
    const binary = expression as SerializedBinaryExpression;
    return createBinaryExpression(
      binary.operator,
      binary.field.fieldName,
      decodeUndefinedDeep(binary.value)
    );
  }
  if (expression.type === 'logical') {
    const logical = expression as SerializedLogicalExpression;
    return createLogicalExpression(
      logical.operator,
      logical.operands
        .map((operand) => deserializeFilterExpression(operand))
        .filter((operand): operand is FilterExpression<boolean> => !!operand)
    );
  }
  const unary = expression as SerializedUnaryExpression;
  const operand = unary.operand;
  if (isSerializedFieldReference(operand)) {
    return createUnaryExpression(unary.operator, fieldRef(operand.fieldName));
  }
  const nested = deserializeFilterExpression(operand);
  if (!nested) {
    throw new Error('Serialized unary operand is missing.');
  }
  return createUnaryExpression(unary.operator, nested);
};

const DEFAULT_MUTATION_BATCH_SIZE = 100;
const DEFAULT_MUTATION_LEAF_BATCH_SIZE = 900;
const DEFAULT_MUTATION_MAX_ROWS = 1000;
const DEFAULT_MUTATION_MAX_BYTES_PER_BATCH = 2_097_152;
const DEFAULT_MUTATION_SCHEDULE_CALL_CAP = 100;
const DEFAULT_MUTATION_ASYNC_DELAY_MS = 0;
const MEASURED_BYTE_SAFETY_MULTIPLIER = 2;

export const estimateMeasuredMutationRowBytes = (
  row: Record<string, unknown>
): number =>
  Buffer.byteLength(JSON.stringify(row), 'utf8') *
  MEASURED_BYTE_SAFETY_MULTIPLIER;

export const takeRowsWithinByteBudget = (
  rows: Record<string, unknown>[],
  maxBytesPerBatch: number
): { rows: Record<string, unknown>[]; hitLimit: boolean } => {
  if (!Number.isInteger(maxBytesPerBatch) || maxBytesPerBatch < 1) {
    throw new Error('mutationMaxBytesPerBatch must be a positive integer.');
  }
  if (rows.length === 0) {
    return { rows, hitLimit: false };
  }

  let bytes = 0;
  const selected: Record<string, unknown>[] = [];
  for (const row of rows) {
    const rowBytes = estimateMeasuredMutationRowBytes(row);
    if (selected.length > 0 && bytes + rowBytes > maxBytesPerBatch) {
      return { rows: selected, hitLimit: true };
    }
    selected.push(row);
    bytes += rowBytes;
  }
  return { rows: selected, hitLimit: false };
};

export const getMutationCollectionLimits = (
  context?: OrmContextValue
): {
  batchSize: number;
  leafBatchSize: number;
  maxRows: number;
  maxBytesPerBatch: number;
  scheduleCallCap: number;
} => {
  const batchSize =
    context?.defaults?.mutationBatchSize ?? DEFAULT_MUTATION_BATCH_SIZE;
  const leafBatchSize =
    context?.defaults?.mutationLeafBatchSize ??
    DEFAULT_MUTATION_LEAF_BATCH_SIZE;
  const maxRows =
    context?.defaults?.mutationMaxRows ?? DEFAULT_MUTATION_MAX_ROWS;
  const maxBytesPerBatch =
    context?.defaults?.mutationMaxBytesPerBatch ??
    DEFAULT_MUTATION_MAX_BYTES_PER_BATCH;
  const scheduleCallCap =
    context?.defaults?.mutationScheduleCallCap ??
    DEFAULT_MUTATION_SCHEDULE_CALL_CAP;

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('mutationBatchSize must be a positive integer.');
  }
  if (!Number.isInteger(leafBatchSize) || leafBatchSize < 1) {
    throw new Error('mutationLeafBatchSize must be a positive integer.');
  }
  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error('mutationMaxRows must be a positive integer.');
  }
  if (!Number.isInteger(maxBytesPerBatch) || maxBytesPerBatch < 1) {
    throw new Error('mutationMaxBytesPerBatch must be a positive integer.');
  }
  if (!Number.isInteger(scheduleCallCap) || scheduleCallCap < 1) {
    throw new Error('mutationScheduleCallCap must be a positive integer.');
  }

  return {
    batchSize,
    leafBatchSize,
    maxRows,
    maxBytesPerBatch,
    scheduleCallCap,
  };
};

type MutationScheduleState = {
  remainingCalls: number;
  callCap: number;
};

const consumeScheduleCall = (state: MutationScheduleState | undefined) => {
  if (!state) {
    return;
  }
  if (state.remainingCalls < 1) {
    throw new Error(
      `Async cascade scheduling exceeded mutationScheduleCallCap (${state.callCap}). ` +
        'Increase defineSchema(..., { defaults: { mutationScheduleCallCap } }) or reduce fan-out per mutation.'
    );
  }
  state.remainingCalls -= 1;
};

export const getMutationExecutionMode = (
  context?: OrmContextValue,
  override?: MutationRunMode
): MutationRunMode =>
  override ?? context?.defaults?.mutationExecutionMode ?? 'sync';

export const getMutationAsyncDelayMs = (
  context?: OrmContextValue,
  override?: number
): number =>
  override ??
  context?.defaults?.mutationAsyncDelayMs ??
  DEFAULT_MUTATION_ASYNC_DELAY_MS;

export const collectMutationRowsBounded = async (
  buildQuery: () => any,
  options: {
    operation: 'update' | 'delete';
    tableName: string;
    batchSize: number;
    maxRows: number;
  }
): Promise<Record<string, unknown>[]> => {
  let cursor: string | null = null;
  const rows: Record<string, unknown>[] = [];

  while (true) {
    const page: {
      page: Record<string, unknown>[];
      continueCursor: string | null;
      isDone: boolean;
    } = await buildQuery().paginate({
      cursor,
      numItems: options.batchSize,
    });
    rows.push(...(page.page as Record<string, unknown>[]));
    if (rows.length > options.maxRows) {
      throw new Error(
        `${options.operation} matched more than ${options.maxRows} rows on "${options.tableName}". ` +
          'Narrow the filter or increase defineSchema(..., { defaults: { mutationMaxRows } }).'
      );
    }
    if (page.isDone) {
      return rows;
    }
    cursor = page.continueCursor;
  }
};

type ForeignKeyDefinition = {
  name?: string;
  columns: string[];
  foreignColumns: string[];
  foreignTableName: string;
  foreignTable?: ConvexTable<any>;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export function getTableName(table: ConvexTable<any>): string {
  const name =
    (table as any).tableName ??
    (table as any)[TableName] ??
    (table as any)?._?.name;
  if (!name) {
    throw new Error('Table is missing a name');
  }
  return name;
}

export function getTableDeleteConfig(
  table: ConvexTable<any>
): OrmTableDeleteConfig | undefined {
  return (table as any)[TableDeleteConfig] as OrmTableDeleteConfig | undefined;
}

export function getUniqueIndexes(
  table: ConvexTable<any>
): UniqueIndexDefinition[] {
  const fromMethod = (table as any).getUniqueIndexes?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).uniqueIndexes;
  return Array.isArray(fromField) ? fromField : [];
}

export function getChecks(table: ConvexTable<any>): CheckDefinition[] {
  const fromMethod = (table as any).getChecks?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).checks;
  return Array.isArray(fromField) ? fromField : [];
}

export function buildForeignKeyGraph(
  schema: TablesRelationalConfig
): ForeignKeyGraph {
  const tableByName = new Map<string, ConvexTable<any>>();
  for (const tableConfig of Object.values(schema)) {
    if (tableConfig?.name && tableConfig.table) {
      tableByName.set(tableConfig.name, tableConfig.table as ConvexTable<any>);
    }
  }

  const incomingByTable = new Map<string, IncomingForeignKeyDefinition[]>();

  for (const tableConfig of Object.values(schema)) {
    const sourceTable = tableConfig.table as ConvexTable<any>;
    const sourceTableName = tableConfig.name;
    const foreignKeys = getForeignKeys(sourceTable);

    for (const foreignKey of foreignKeys) {
      const targetTableName = foreignKey.foreignTableName;
      const targetTable = tableByName.get(targetTableName);
      if (!targetTable) {
        throw new Error(
          `Foreign key from '${sourceTableName}' references missing table '${targetTableName}'.`
        );
      }

      const entry: IncomingForeignKeyDefinition = {
        sourceTable,
        sourceTableName,
        sourceColumns: foreignKey.columns,
        targetTableName,
        targetColumns: foreignKey.foreignColumns,
        onDelete: foreignKey.onDelete,
        onUpdate: foreignKey.onUpdate,
      };

      const list = incomingByTable.get(targetTableName) ?? [];
      list.push(entry);
      incomingByTable.set(targetTableName, list);
    }
  }

  return { incomingByTable };
}

export function getOrmContext(
  db: GenericDatabaseWriter<any> | GenericDatabaseReader<any>
): OrmContextValue | undefined {
  return (db as any)[OrmContext] as OrmContextValue | undefined;
}

export function getForeignKeys(
  table: ConvexTable<any>
): ForeignKeyDefinition[] {
  const fromMethod = (table as any).getForeignKeys?.();
  if (Array.isArray(fromMethod)) {
    return fromMethod;
  }
  const fromField = (table as any).foreignKeys;
  return Array.isArray(fromField) ? fromField : [];
}

export function getColumnName(column: ColumnBuilder<any, any, any>): string {
  const name = (column as any).config?.name ?? (column as any)?._?.name;
  if (!name) {
    throw new Error('Column builder is missing a column name');
  }
  return name;
}

export function getTableColumns(
  table: ConvexTable<any>
): Record<string, ColumnBuilder<any, any, any>> {
  return ((table as any)[Columns] ?? {}) as Record<
    string,
    ColumnBuilder<any, any, any>
  >;
}

function getColumnConfig(
  table: ConvexTable<any>,
  columnName: string
): {
  notNull?: boolean;
  hasDefault?: boolean;
  default?: unknown;
} | null {
  const columns = getTableColumns(table);
  const builder = columns[columnName];
  if (!builder) {
    return null;
  }
  return (builder as any).config ?? null;
}

export function applyDefaults<TValue extends Record<string, unknown>>(
  table: ConvexTable<any>,
  value: TValue
): TValue {
  const columns = (table as any)[Columns] as
    | Record<string, ColumnBuilder<any, any, any>>
    | undefined;
  if (!columns) {
    return value;
  }

  const result = { ...value } as TValue;
  for (const [columnName, builder] of Object.entries(columns)) {
    if ((result as any)[columnName] !== undefined) {
      continue;
    }

    const config = (builder as any).config as
      | {
          hasDefault?: boolean;
          default?: unknown;
          defaultFn?: (() => unknown) | undefined;
          onUpdateFn?: (() => unknown) | undefined;
        }
      | undefined;

    if (!config) {
      continue;
    }

    if (typeof config.defaultFn === 'function') {
      (result as any)[columnName] = config.defaultFn();
      continue;
    }

    if (config.hasDefault) {
      (result as any)[columnName] = config.default;
      continue;
    }

    if (typeof config.onUpdateFn === 'function') {
      (result as any)[columnName] = config.onUpdateFn();
    }
  }
  return result;
}

export async function enforceUniqueIndexes(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  candidate: Record<string, unknown>,
  options?: { currentId?: unknown; changedFields?: Set<string> }
): Promise<void> {
  const uniqueIndexes = getUniqueIndexes(table);
  if (uniqueIndexes.length === 0) {
    return;
  }

  const tableName = getTableName(table);
  const changedFields = options?.changedFields;

  for (const index of uniqueIndexes) {
    if (
      changedFields &&
      !index.fields.some((field) => changedFields.has(field))
    ) {
      continue;
    }

    const entries = index.fields.map((field) => [field, candidate[field]]);
    const hasNullish = entries.some(
      ([, value]) => value === undefined || value === null
    );
    if (hasNullish && !index.nullsNotDistinct) {
      continue;
    }

    const existing = await db
      .query(tableName)
      .withIndex(index.name, (q: any) => {
        let builder = q.eq(entries[0][0], entries[0][1]);
        for (let i = 1; i < entries.length; i++) {
          builder = builder.eq(entries[i][0], entries[i][1]);
        }
        return builder;
      })
      .unique();

    if (
      existing !== null &&
      (options?.currentId === undefined ||
        (existing as any)._id !== options.currentId)
    ) {
      throw new Error(
        `Unique index '${index.name}' violation on '${tableName}'.`
      );
    }
  }
}

export async function enforceForeignKeys(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  candidate: Record<string, unknown>,
  options?: { changedFields?: Set<string> }
): Promise<void> {
  const foreignKeys = getForeignKeys(table);
  if (foreignKeys.length === 0) {
    return;
  }

  const tableName = getTableName(table);
  const changedFields = options?.changedFields;

  for (const foreignKey of foreignKeys) {
    if (
      changedFields &&
      !foreignKey.columns.some((field) => changedFields.has(field))
    ) {
      continue;
    }

    const entries = foreignKey.columns.map(
      (field) => [field, candidate[field]] as [string, unknown]
    );
    const hasNullish = entries.some(
      ([, value]) => value === undefined || value === null
    );
    if (hasNullish) {
      continue;
    }

    if (
      foreignKey.foreignColumns.length === 1 &&
      foreignKey.foreignColumns[0] === '_id'
    ) {
      const foreignId = entries[0]?.[1];
      const existing = await db.get(foreignId as any);
      if (!existing) {
        throw new Error(
          `Foreign key violation on '${tableName}': missing document in '${foreignKey.foreignTableName}'.`
        );
      }
      continue;
    }

    if (!foreignKey.foreignTable) {
      throw new Error(
        `Foreign key on '${tableName}' requires indexed foreign columns on '${foreignKey.foreignTableName}'.`
      );
    }

    const indexName = findIndexForColumns(
      getIndexes(foreignKey.foreignTable),
      foreignKey.foreignColumns
    );

    if (!indexName) {
      throw new Error(
        `Foreign key on '${tableName}' requires index on '${foreignKey.foreignTableName}(${foreignKey.foreignColumns.join(
          ', '
        )})'.`
      );
    }

    const foreignRow = await db
      .query(foreignKey.foreignTableName)
      .withIndex(indexName, (q: any) => {
        let builder = q.eq(foreignKey.foreignColumns[0], entries[0][1]);
        for (let i = 1; i < entries.length; i++) {
          builder = builder.eq(foreignKey.foreignColumns[i], entries[i][1]);
        }
        return builder;
      })
      .first();

    if (!foreignRow) {
      throw new Error(
        `Foreign key violation on '${tableName}': missing document in '${foreignKey.foreignTableName}'.`
      );
    }
  }
}

export type DeleteMode = OrmDeleteMode;
export type CascadeMode = 'hard' | 'soft';

function getIndexForForeignKey(
  foreignKey: IncomingForeignKeyDefinition
): string | null {
  return findIndexForColumns(
    getIndexes(foreignKey.sourceTable),
    foreignKey.sourceColumns
  );
}

function foreignKeyIndexError(foreignKey: IncomingForeignKeyDefinition): Error {
  return new Error(
    `Foreign key on '${foreignKey.sourceTableName}' requires index on '${foreignKey.sourceTableName}(${foreignKey.sourceColumns.join(
      ', '
    )})' for cascading actions.`
  );
}

function buildIndexPredicate(q: any, columns: string[], values: unknown[]) {
  let builder = q.eq(columns[0], values[0]);
  for (let i = 1; i < columns.length; i++) {
    builder = builder.eq(columns[i], values[i]);
  }
  return builder;
}

function buildFilterPredicate(q: any, columns: string[], values: unknown[]) {
  let expr = q.eq(q.field(columns[0]), values[0]);
  for (let i = 1; i < columns.length; i++) {
    expr = q.and(expr, q.eq(q.field(columns[i]), values[i]));
  }
  return expr;
}

export function ensureNullableColumns(
  table: ConvexTable<any>,
  columns: string[],
  context: string
): void {
  for (const columnName of columns) {
    const config = getColumnConfig(table, columnName);
    if (!config) {
      throw new Error(
        `${context}: missing column '${columnName}' in table '${getTableName(
          table
        )}'.`
      );
    }
    if (config.notNull) {
      throw new Error(
        `${context}: column '${columnName}' is not nullable in '${getTableName(
          table
        )}'.`
      );
    }
  }
}

export function ensureDefaultColumns(
  table: ConvexTable<any>,
  columns: string[],
  context: string
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const columnName of columns) {
    const config = getColumnConfig(table, columnName);
    if (!config) {
      throw new Error(
        `${context}: missing column '${columnName}' in table '${getTableName(
          table
        )}'.`
      );
    }
    if (!config.hasDefault) {
      throw new Error(
        `${context}: column '${columnName}' has no default in '${getTableName(
          table
        )}'.`
      );
    }
    defaults[columnName] = config.default;
  }
  return defaults;
}

export function ensureNonNullValues(
  table: ConvexTable<any>,
  values: Record<string, unknown>,
  context: string
): void {
  for (const [columnName, value] of Object.entries(values)) {
    const config = getColumnConfig(table, columnName);
    if (config?.notNull && (value === null || value === undefined)) {
      throw new Error(
        `${context}: column '${columnName}' cannot be null in '${getTableName(
          table
        )}'.`
      );
    }
  }
}

async function collectReferencingRows(
  db: GenericDatabaseWriter<any>,
  foreignKey: IncomingForeignKeyDefinition,
  targetValues: unknown[],
  indexName: string,
  options: {
    operation: 'update' | 'delete';
    batchSize: number;
    maxRows: number;
  }
): Promise<Record<string, unknown>[]> {
  return collectMutationRowsBounded(
    () =>
      db
        .query(foreignKey.sourceTableName)
        .withIndex(indexName, (q: any) =>
          buildIndexPredicate(q, foreignKey.sourceColumns, targetValues)
        ),
    {
      operation: options.operation,
      tableName: foreignKey.sourceTableName,
      batchSize: options.batchSize,
      maxRows: options.maxRows,
    }
  );
}

async function hasReferencingRow(
  db: GenericDatabaseWriter<any>,
  foreignKey: IncomingForeignKeyDefinition,
  targetValues: unknown[],
  indexName?: string | null
): Promise<boolean> {
  const query = db.query(foreignKey.sourceTableName);
  const row = indexName
    ? await query
        .withIndex(indexName, (q: any) =>
          buildIndexPredicate(q, foreignKey.sourceColumns, targetValues)
        )
        .first()
    : await query
        .filter((q: any) =>
          buildFilterPredicate(q, foreignKey.sourceColumns, targetValues)
        )
        .first();
  return row !== null;
}

export async function softDeleteRow(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  row: Record<string, unknown>
): Promise<number> {
  const tableName = getTableName(table);
  const columns = getTableColumns(table);
  if (!('deletionTime' in columns)) {
    throw new Error(
      `Soft delete requires 'deletionTime' field on '${tableName}'.`
    );
  }
  const deletionTime = Date.now();
  await db.patch(tableName, row._id as any, { deletionTime });
  return deletionTime;
}

export async function hardDeleteRow(
  db: GenericDatabaseWriter<any>,
  _tableName: string,
  row: Record<string, unknown>
) {
  await db.delete(row._id as any);
}

export async function applyIncomingForeignKeyActionsOnDelete(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  row: Record<string, unknown>,
  options: {
    graph: ForeignKeyGraph;
    deleteMode: DeleteMode;
    cascadeMode: CascadeMode;
    visited: Set<string>;
    batchSize: number;
    leafBatchSize: number;
    maxRows: number;
    maxBytesPerBatch: number;
    allowFullScan?: boolean;
    strict?: boolean;
    executionMode?: MutationRunMode;
    scheduler?: Scheduler;
    scheduledMutationBatch?: SchedulableFunctionReference;
    scheduleState?: MutationScheduleState;
    delayMs?: number;
  }
): Promise<void> {
  const tableName = getTableName(table);
  const incoming = options.graph.incomingByTable.get(tableName) ?? [];
  if (incoming.length === 0) {
    return;
  }

  for (const foreignKey of incoming) {
    const action = foreignKey.onDelete ?? 'no action';
    const targetValues = foreignKey.targetColumns.map((column) => row[column]);
    if (targetValues.some((value) => value === undefined || value === null)) {
      continue;
    }

    const indexName = getIndexForForeignKey(foreignKey);

    if (action === 'restrict' || action === 'no action') {
      if (!indexName && !options.allowFullScan) {
        throw foreignKeyIndexError(foreignKey);
      }
      if (!indexName && options.strict) {
        console.warn(
          `Foreign key check running without index (allowFullScan: true) on '${foreignKey.sourceTableName}'.`
        );
      }
      if (await hasReferencingRow(db, foreignKey, targetValues, indexName)) {
        throw new Error(
          `Foreign key restrict violation on '${tableName}' from '${foreignKey.sourceTableName}'.`
        );
      }
      continue;
    }

    if (!indexName) {
      if (!options.allowFullScan) {
        throw foreignKeyIndexError(foreignKey);
      }
      if (options.strict) {
        console.warn(
          `Foreign key cascade check running without index (allowFullScan: true) on '${foreignKey.sourceTableName}'.`
        );
      }
      if (await hasReferencingRow(db, foreignKey, targetValues, null)) {
        throw foreignKeyIndexError(foreignKey);
      }
      continue;
    }

    let referencingRows: Record<string, unknown>[];
    if (options.executionMode === 'async') {
      const asyncBatchSize =
        action === 'cascade' ? options.batchSize : options.leafBatchSize;
      const page: {
        page: Record<string, unknown>[];
        continueCursor: string | null;
        isDone: boolean;
      } = await db
        .query(foreignKey.sourceTableName)
        .withIndex(indexName, (q: any) =>
          buildIndexPredicate(q, foreignKey.sourceColumns, targetValues)
        )
        .paginate({ cursor: null, numItems: asyncBatchSize });
      const bounded = takeRowsWithinByteBudget(
        page.page as Record<string, unknown>[],
        options.maxBytesPerBatch
      );
      referencingRows = bounded.rows;
      const needsContinuation = bounded.hitLimit || !page.isDone;
      if (needsContinuation) {
        if (!options.scheduler || !options.scheduledMutationBatch) {
          throw new Error(
            'Async mutation execution requires orm.db(ctx) configured with scheduling (ormFunctions.scheduledMutationBatch).'
          );
        }
        consumeScheduleCall(options.scheduleState);
        await options.scheduler.runAfter(
          options.delayMs ?? 0,
          options.scheduledMutationBatch,
          {
            workType: 'cascade-delete',
            mode: 'async',
            operation: 'delete',
            table: foreignKey.sourceTableName,
            foreignIndexName: indexName,
            foreignSourceColumns: foreignKey.sourceColumns,
            targetValues: encodeUndefinedDeep(targetValues),
            foreignAction: action,
            deleteMode: options.deleteMode,
            cascadeMode: options.cascadeMode,
            cursor: null,
            batchSize: asyncBatchSize,
            maxBytesPerBatch: options.maxBytesPerBatch,
            delayMs: options.delayMs ?? 0,
          }
        );
      }
    } else {
      referencingRows = await collectReferencingRows(
        db,
        foreignKey,
        targetValues,
        indexName,
        {
          operation: 'delete',
          batchSize: options.batchSize,
          maxRows: options.maxRows,
        }
      );
    }
    if (referencingRows.length === 0) {
      continue;
    }

    // Contract: once the root mutation row is authorized, FK fan-out writes
    // execute as system mutations and intentionally bypass child-table RLS.
    if (action === 'set null') {
      ensureNullableColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set null on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        const patch: Record<string, unknown> = {};
        for (const columnName of foreignKey.sourceColumns) {
          patch[columnName] = null;
        }
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patch
        );
      }
      continue;
    }

    if (action === 'set default') {
      const defaults = ensureDefaultColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set default on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          defaults
        );
      }
      continue;
    }

    if (action === 'cascade') {
      for (const referencingRow of referencingRows) {
        const key = `${foreignKey.sourceTableName}:${referencingRow._id}`;
        if (options.visited.has(key)) {
          continue;
        }
        options.visited.add(key);
        await applyIncomingForeignKeyActionsOnDelete(
          db,
          foreignKey.sourceTable,
          referencingRow,
          options
        );
        if (options.cascadeMode === 'soft') {
          await softDeleteRow(db, foreignKey.sourceTable, referencingRow);
        } else {
          await hardDeleteRow(db, foreignKey.sourceTableName, referencingRow);
        }
      }
    }
  }
}

export async function applyIncomingForeignKeyActionsOnUpdate(
  db: GenericDatabaseWriter<any>,
  table: ConvexTable<any>,
  oldRow: Record<string, unknown>,
  newRow: Record<string, unknown>,
  options: {
    graph: ForeignKeyGraph;
    batchSize: number;
    leafBatchSize: number;
    maxRows: number;
    maxBytesPerBatch: number;
    allowFullScan?: boolean;
    strict?: boolean;
    executionMode?: MutationRunMode;
    scheduler?: Scheduler;
    scheduledMutationBatch?: SchedulableFunctionReference;
    scheduleState?: MutationScheduleState;
    delayMs?: number;
  }
): Promise<void> {
  const tableName = getTableName(table);
  const incoming = options.graph.incomingByTable.get(tableName) ?? [];
  if (incoming.length === 0) {
    return;
  }

  for (const foreignKey of incoming) {
    const action = foreignKey.onUpdate ?? 'no action';
    const oldValues = foreignKey.targetColumns.map((column) => oldRow[column]);
    const newValues = foreignKey.targetColumns.map((column) => newRow[column]);

    const changed = oldValues.some(
      (value, index) => !Object.is(value, newValues[index])
    );
    if (!changed) {
      continue;
    }

    if (oldValues.some((value) => value === undefined || value === null)) {
      continue;
    }

    const indexName = getIndexForForeignKey(foreignKey);

    if (action === 'restrict' || action === 'no action') {
      if (!indexName && !options.allowFullScan) {
        throw foreignKeyIndexError(foreignKey);
      }
      if (!indexName && options.strict) {
        console.warn(
          `Foreign key check running without index (allowFullScan: true) on '${foreignKey.sourceTableName}'.`
        );
      }
      if (await hasReferencingRow(db, foreignKey, oldValues, indexName)) {
        throw new Error(
          `Foreign key restrict violation on '${tableName}' from '${foreignKey.sourceTableName}'.`
        );
      }
      continue;
    }

    if (!indexName) {
      if (!options.allowFullScan) {
        throw foreignKeyIndexError(foreignKey);
      }
      if (options.strict) {
        console.warn(
          `Foreign key cascade check running without index (allowFullScan: true) on '${foreignKey.sourceTableName}'.`
        );
      }
      if (await hasReferencingRow(db, foreignKey, oldValues, null)) {
        throw foreignKeyIndexError(foreignKey);
      }
      continue;
    }

    let referencingRows: Record<string, unknown>[];
    if (options.executionMode === 'async') {
      const asyncBatchSize = options.leafBatchSize;
      const page: {
        page: Record<string, unknown>[];
        continueCursor: string | null;
        isDone: boolean;
      } = await db
        .query(foreignKey.sourceTableName)
        .withIndex(indexName, (q: any) =>
          buildIndexPredicate(q, foreignKey.sourceColumns, oldValues)
        )
        .paginate({ cursor: null, numItems: asyncBatchSize });
      const bounded = takeRowsWithinByteBudget(
        page.page as Record<string, unknown>[],
        options.maxBytesPerBatch
      );
      referencingRows = bounded.rows;
      const needsContinuation = bounded.hitLimit || !page.isDone;
      if (needsContinuation) {
        if (!options.scheduler || !options.scheduledMutationBatch) {
          throw new Error(
            'Async mutation execution requires orm.db(ctx) configured with scheduling (ormFunctions.scheduledMutationBatch).'
          );
        }
        consumeScheduleCall(options.scheduleState);
        await options.scheduler.runAfter(
          options.delayMs ?? 0,
          options.scheduledMutationBatch,
          {
            workType: 'cascade-update',
            mode: 'async',
            operation: 'update',
            table: foreignKey.sourceTableName,
            foreignIndexName: indexName,
            foreignSourceColumns: foreignKey.sourceColumns,
            targetValues: encodeUndefinedDeep(oldValues),
            newValues: encodeUndefinedDeep(newValues),
            foreignAction: action,
            cursor: null,
            batchSize: asyncBatchSize,
            maxBytesPerBatch: options.maxBytesPerBatch,
            delayMs: options.delayMs ?? 0,
          }
        );
      }
    } else {
      referencingRows = await collectReferencingRows(
        db,
        foreignKey,
        oldValues,
        indexName,
        {
          operation: 'update',
          batchSize: options.batchSize,
          maxRows: options.maxRows,
        }
      );
    }
    if (referencingRows.length === 0) {
      continue;
    }

    // Contract: once the root mutation row is authorized, FK fan-out writes
    // execute as system mutations and intentionally bypass child-table RLS.
    if (action === 'set null') {
      ensureNullableColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set null on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        const patch: Record<string, unknown> = {};
        for (const columnName of foreignKey.sourceColumns) {
          patch[columnName] = null;
        }
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patch
        );
      }
      continue;
    }

    if (action === 'set default') {
      const defaults = ensureDefaultColumns(
        foreignKey.sourceTable,
        foreignKey.sourceColumns,
        `Foreign key set default on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          defaults
        );
      }
      continue;
    }

    if (action === 'cascade') {
      const patchValues: Record<string, unknown> = {};
      for (let i = 0; i < foreignKey.sourceColumns.length; i++) {
        patchValues[foreignKey.sourceColumns[i]] = newValues[i];
      }
      ensureNonNullValues(
        foreignKey.sourceTable,
        patchValues,
        `Foreign key cascade update on '${foreignKey.sourceTableName}'`
      );
      for (const referencingRow of referencingRows) {
        await db.patch(
          foreignKey.sourceTableName,
          referencingRow._id as any,
          patchValues
        );
      }
    }
  }
}

export function getSelectionColumnName(value: unknown): string {
  if (value && typeof value === 'object') {
    if ('columnName' in (value as any)) {
      return (value as any).columnName as string;
    }
    if ('config' in (value as any) && (value as any).config?.name) {
      return (value as any).config.name as string;
    }
  }
  throw new Error('Returning selection must reference a column');
}

export function selectReturningRow(
  row: Record<string, unknown>,
  selection: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [alias, column] of Object.entries(selection)) {
    const columnName = getSelectionColumnName(column);
    result[alias] = row[columnName];
  }
  return result;
}

function matchLike(
  value: string,
  pattern: string,
  caseInsensitive: boolean
): boolean {
  const targetValue = caseInsensitive ? value.toLowerCase() : value;
  const targetPattern = caseInsensitive ? pattern.toLowerCase() : pattern;

  if (targetPattern.startsWith('%') && targetPattern.endsWith('%')) {
    const substring = targetPattern.slice(1, -1);
    return targetValue.includes(substring);
  }
  if (targetPattern.startsWith('%')) {
    const suffix = targetPattern.slice(1);
    return targetValue.endsWith(suffix);
  }
  if (targetPattern.endsWith('%')) {
    const prefix = targetPattern.slice(0, -1);
    return targetValue.startsWith(prefix);
  }
  return targetValue === targetPattern;
}

export function evaluateFilter(
  row: Record<string, unknown>,
  filter: FilterExpression<boolean>
): boolean {
  if (filter.type === 'binary') {
    const [field, value] = filter.operands;
    if (!isFieldReference(field)) {
      throw new Error(
        'Binary expression must have FieldReference as first operand'
      );
    }

    const fieldName = field.fieldName;
    const fieldValue = row[fieldName];

    switch (filter.operator) {
      case 'like': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return matchLike(fieldValue, pattern, false);
      }
      case 'ilike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return matchLike(fieldValue, pattern, true);
      }
      case 'notLike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return !matchLike(fieldValue, pattern, false);
      }
      case 'notIlike': {
        const pattern = value as string;
        if (typeof fieldValue !== 'string') return false;
        return !matchLike(fieldValue, pattern, true);
      }
      case 'startsWith': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.startsWith(value as string);
      }
      case 'endsWith': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.endsWith(value as string);
      }
      case 'contains': {
        if (typeof fieldValue !== 'string') return false;
        return fieldValue.includes(value as string);
      }
      case 'eq':
        return fieldValue === value;
      case 'ne':
        return fieldValue !== value;
      case 'gt':
        return (fieldValue as any) > value;
      case 'gte':
        return (fieldValue as any) >= value;
      case 'lt':
        return (fieldValue as any) < value;
      case 'lte':
        return (fieldValue as any) <= value;
      case 'inArray': {
        const arr = value as any[];
        return arr.includes(fieldValue as any);
      }
      case 'notInArray': {
        const arr = value as any[];
        return !arr.includes(fieldValue as any);
      }
      case 'arrayContains': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return arr.every((item) => (fieldValue as any[]).includes(item));
      }
      case 'arrayContained': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return (fieldValue as any[]).every((item) => arr.includes(item));
      }
      case 'arrayOverlaps': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = value as any[];
        return (fieldValue as any[]).some((item) => arr.includes(item));
      }
      default:
        throw new Error(`Unsupported post-fetch operator: ${filter.operator}`);
    }
  }

  if (filter.type === 'unary') {
    const [operand] = filter.operands;

    if (isFieldReference(operand)) {
      const fieldName = operand.fieldName;
      const fieldValue = row[fieldName];

      switch (filter.operator) {
        case 'isNull':
          return fieldValue === null || fieldValue === undefined;
        case 'isNotNull':
          return fieldValue !== null && fieldValue !== undefined;
        default:
          throw new Error(`Unsupported unary operator: ${filter.operator}`);
      }
    }

    if (filter.operator === 'not') {
      return !evaluateFilter(row, operand as FilterExpression<boolean>);
    }

    throw new Error(
      'Unary expression must have FieldReference or FilterExpression as operand'
    );
  }

  if (filter.type === 'logical') {
    if (filter.operator === 'and') {
      return filter.operands.every((f) => evaluateFilter(row, f));
    }
    if (filter.operator === 'or') {
      return filter.operands.some((f) => evaluateFilter(row, f));
    }
  }

  throw new Error(`Unsupported filter type for post-fetch: ${filter.type}`);
}

type TriState = true | false | 'unknown';

function triNot(value: TriState): TriState {
  return value === 'unknown' ? 'unknown' : !value;
}

function triAnd(values: TriState[]): TriState {
  if (values.some((value) => value === false)) return false;
  if (values.every((value) => value === true)) return true;
  return 'unknown';
}

function triOr(values: TriState[]): TriState {
  if (values.some((value) => value === true)) return true;
  if (values.every((value) => value === false)) return false;
  return 'unknown';
}

export function evaluateCheckConstraintTriState(
  row: Record<string, unknown>,
  filter: FilterExpression<boolean>
): TriState {
  if (filter.type === 'binary') {
    const [field, value] = filter.operands;
    if (!isFieldReference(field)) {
      throw new Error(
        'Binary expression must have FieldReference as first operand'
      );
    }

    const fieldName = field.fieldName;
    const fieldValue = row[fieldName];
    const compareValue = isFieldReference(value) ? row[value.fieldName] : value;

    const nullish = (entry: unknown) => entry === null || entry === undefined;
    if (nullish(fieldValue) || nullish(compareValue)) {
      return 'unknown';
    }

    switch (filter.operator) {
      case 'like': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return matchLike(fieldValue, compareValue, false);
      }
      case 'ilike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return matchLike(fieldValue, compareValue, true);
      }
      case 'notLike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return !matchLike(fieldValue, compareValue, false);
      }
      case 'notIlike': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return !matchLike(fieldValue, compareValue, true);
      }
      case 'startsWith': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.startsWith(compareValue);
      }
      case 'endsWith': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.endsWith(compareValue);
      }
      case 'contains': {
        if (
          typeof fieldValue !== 'string' ||
          typeof compareValue !== 'string'
        ) {
          return false;
        }
        return fieldValue.includes(compareValue);
      }
      case 'eq':
        return fieldValue === compareValue;
      case 'ne':
        return fieldValue !== compareValue;
      case 'gt':
        return (fieldValue as any) > compareValue;
      case 'gte':
        return (fieldValue as any) >= compareValue;
      case 'lt':
        return (fieldValue as any) < compareValue;
      case 'lte':
        return (fieldValue as any) <= compareValue;
      case 'inArray': {
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return arr.includes(fieldValue as any);
      }
      case 'notInArray': {
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return !arr.includes(fieldValue as any);
      }
      case 'arrayContains': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return arr.every((item) => (fieldValue as any[]).includes(item));
      }
      case 'arrayContained': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return (fieldValue as any[]).every((item) => arr.includes(item));
      }
      case 'arrayOverlaps': {
        if (!Array.isArray(fieldValue)) return false;
        const arr = compareValue as any[];
        if (!Array.isArray(arr)) return false;
        return (fieldValue as any[]).some((item) => arr.includes(item));
      }
      default:
        throw new Error(`Unsupported operator: ${filter.operator}`);
    }
  }

  if (filter.type === 'unary') {
    const [operand] = filter.operands;

    if (isFieldReference(operand)) {
      const fieldName = operand.fieldName;
      const fieldValue = row[fieldName];

      switch (filter.operator) {
        case 'isNull':
          return fieldValue === null || fieldValue === undefined;
        case 'isNotNull':
          return fieldValue !== null && fieldValue !== undefined;
        default:
          throw new Error(`Unsupported unary operator: ${filter.operator}`);
      }
    }

    if (filter.operator === 'not') {
      return triNot(
        evaluateCheckConstraintTriState(
          row,
          operand as FilterExpression<boolean>
        )
      );
    }

    throw new Error(
      'Unary expression must have FieldReference or FilterExpression as operand'
    );
  }

  if (filter.type === 'logical') {
    if (filter.operator === 'and') {
      return triAnd(
        filter.operands.map((operand) =>
          evaluateCheckConstraintTriState(row, operand)
        )
      );
    }
    if (filter.operator === 'or') {
      return triOr(
        filter.operands.map((operand) =>
          evaluateCheckConstraintTriState(row, operand)
        )
      );
    }
  }

  throw new Error(`Unsupported filter type for check: ${filter.type}`);
}

export function enforceCheckConstraints(
  table: ConvexTable<any>,
  candidate: Record<string, unknown>
): void {
  const checks = getChecks(table);
  if (checks.length === 0) {
    return;
  }

  const tableName = getTableName(table);

  for (const check of checks) {
    const result = evaluateCheckConstraintTriState(candidate, check.expression);
    if (result === false) {
      throw new Error(
        `Check constraint '${check.name}' violation on '${tableName}'.`
      );
    }
  }
}

export function toConvexFilter(
  expression: FilterExpression<boolean>
): (q: any) => any {
  const visitor: ExpressionVisitor<(q: any) => any> = {
    visitBinary: (expr: BinaryExpression) => {
      const [field, value] = expr.operands;
      if (!isFieldReference(field)) {
        throw new Error(
          'Binary expression must have FieldReference as first operand'
        );
      }

      const fieldName = field.fieldName;

      switch (expr.operator) {
        case 'eq':
          return (q: any) => q.eq(q.field(fieldName), value);
        case 'ne':
          return (q: any) => q.neq(q.field(fieldName), value);
        case 'gt':
          return (q: any) => q.gt(q.field(fieldName), value);
        case 'gte':
          return (q: any) => q.gte(q.field(fieldName), value);
        case 'lt':
          return (q: any) => q.lt(q.field(fieldName), value);
        case 'lte':
          return (q: any) => q.lte(q.field(fieldName), value);
        case 'inArray': {
          const values = value as any[];
          return (q: any) => {
            if (values.length === 0) {
              return q.eq(q.field('_id'), '__better_convex_never__');
            }
            const conditions = values.map((v) => q.eq(q.field(fieldName), v));
            return conditions.reduce((acc, cond) => q.or(acc, cond));
          };
        }
        case 'notInArray': {
          const values = value as any[];
          return (q: any) => {
            const conditions = values.map((v) => q.neq(q.field(fieldName), v));
            return conditions.reduce((acc, cond) => q.and(acc, cond));
          };
        }
        case 'like':
        case 'ilike':
        case 'notLike':
        case 'notIlike':
        case 'startsWith':
        case 'endsWith':
        case 'contains':
        case 'arrayContains':
        case 'arrayContained':
        case 'arrayOverlaps':
          return () => true;
        default:
          throw new Error(`Unsupported binary operator: ${expr.operator}`);
      }
    },
    visitLogical: (expr: LogicalExpression) => {
      const operandFns = expr.operands.map((op) => op.accept(visitor));

      if (expr.operator === 'and') {
        return (q: any) => {
          let result = operandFns[0](q);
          for (let i = 1; i < operandFns.length; i++) {
            result = q.and(result, operandFns[i](q));
          }
          return result;
        };
      }
      if (expr.operator === 'or') {
        return (q: any) => {
          let result = operandFns[0](q);
          for (let i = 1; i < operandFns.length; i++) {
            result = q.or(result, operandFns[i](q));
          }
          return result;
        };
      }

      throw new Error(`Unsupported logical operator: ${expr.operator}`);
    },
    visitUnary: (expr: UnaryExpression) => {
      const operand = expr.operands[0];

      if (expr.operator === 'not') {
        const operandFn = (operand as FilterExpression<boolean>).accept(
          visitor
        );
        return (q: any) => q.not(operandFn(q));
      }

      if (expr.operator === 'isNull') {
        if (!isFieldReference(operand)) {
          throw new Error('isNull must operate on a field reference');
        }
        const fieldName = operand.fieldName;
        return (q: any) => q.eq(q.field(fieldName), null);
      }

      if (expr.operator === 'isNotNull') {
        if (!isFieldReference(operand)) {
          throw new Error('isNotNull must operate on a field reference');
        }
        const fieldName = operand.fieldName;
        return (q: any) => q.neq(q.field(fieldName), null);
      }

      throw new Error(`Unsupported unary operator: ${expr.operator}`);
    },
  };

  return expression.accept(visitor);
}
