import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import type { GenericId, Value } from 'convex/values';
import { normalizeTemporalComparableValue } from '../mutation-utils';
import { Columns } from '../symbols';
import {
  INTERNAL_CREATION_TIME_FIELD,
  PUBLIC_CREATED_AT_FIELD,
  usesSystemCreatedAtAlias,
} from '../timestamp-mode';
import type { TableRelationalConfig, TablesRelationalConfig } from '../types';
import {
  AGGREGATE_BUCKET_TABLE,
  AGGREGATE_EXTREMA_TABLE,
  AGGREGATE_MEMBER_TABLE,
  AGGREGATE_STATE_TABLE,
} from './schema';

const UNDEFINED_SENTINEL = '__kitcnUndefined';
const FLOAT64_SIGN_BIT = 1n << 63n;
const FLOAT64_MASK = (1n << 64n) - 1n;
const DEFAULT_AGGREGATE_CARTESIAN_MAX_KEYS = 4096;
const DEFAULT_AGGREGATE_WORK_BUDGET = 16_384;
const RANGE_PREFIX_WORK_UNIT_BASE = 2;
const PUBLIC_ID_FIELD = 'id';
const INTERNAL_ID_FIELD = '_id';
export const AGGREGATE_STATE_KIND_METRIC = 'metric';
export const AGGREGATE_STATE_KIND_RANK = 'rank';

export const COUNT_STATUS_BUILDING = 'BUILDING';
export const COUNT_STATUS_READY = 'READY';

export const COUNT_ERROR = {
  FILTER_UNSUPPORTED: 'COUNT_FILTER_UNSUPPORTED',
  NOT_INDEXED: 'COUNT_NOT_INDEXED',
  INDEX_BUILDING: 'COUNT_INDEX_BUILDING',
  RLS_UNSUPPORTED: 'COUNT_RLS_UNSUPPORTED',
} as const;

export const AGGREGATE_ERROR = {
  ARGS_UNSUPPORTED: 'AGGREGATE_ARGS_UNSUPPORTED',
  FILTER_UNSUPPORTED: 'AGGREGATE_FILTER_UNSUPPORTED',
  NOT_INDEXED: 'AGGREGATE_NOT_INDEXED',
  INDEX_BUILDING: 'AGGREGATE_INDEX_BUILDING',
  RLS_UNSUPPORTED: 'AGGREGATE_RLS_UNSUPPORTED',
} as const;

type CountErrorCode = (typeof COUNT_ERROR)[keyof typeof COUNT_ERROR];
type AggregateErrorCode =
  (typeof AGGREGATE_ERROR)[keyof typeof AGGREGATE_ERROR];

type ErrorCodes = {
  FILTER_UNSUPPORTED: string;
  NOT_INDEXED: string;
  INDEX_BUILDING: string;
  RLS_UNSUPPORTED: string;
};

type RangeOperator = 'gt' | 'gte' | 'lt' | 'lte';

type RangeComparison = {
  operator: RangeOperator;
  value: unknown;
};

type FieldConstraint = {
  values?: Map<string, unknown>;
  rangeComparisons?: RangeComparison[];
};

type ConstraintMap = Map<string, FieldConstraint>;

type AggregateMetricRequest =
  | {
      kind: 'count';
    }
  | {
      kind: 'countField' | 'sum' | 'avg' | 'min' | 'max';
      field: string;
    };

type AggregateMetricValues = {
  sumValues: Record<string, number>;
  extremaValues: Record<string, unknown>;
  nonNullCountValues: Record<string, number>;
};

type CountStateRow = {
  _id: GenericId<any>;
  kind: string;
  tableKey: string;
  indexName: string;
  keyDefinitionHash: string;
  metricDefinitionHash: string;
  status: string;
  cursor?: string | null;
  processed: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  lastError?: string | null;
};

export type CountState = {
  _id: GenericId<any>;
  kind?: string;
  tableName: string;
  indexName: string;
  keyDefinitionHash: string;
  metricDefinitionHash: string;
  status: string;
  cursor?: string | null;
  processed: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number | null;
  lastError?: string | null;
};

type CountMemberRow = {
  _id: GenericId<any>;
  kind: string;
  tableKey: string;
  indexName: string;
  docId: string;
  keyHash: string;
  keyParts: unknown[];
  sumValues: Record<string, number>;
  nonNullCountValues: Record<string, number>;
  extremaValues: Record<string, unknown>;
  rankNamespace?: unknown;
  rankKey?: unknown;
  rankSumValue?: number;
};

type CountBucketRow = {
  _id: GenericId<any>;
  tableKey: string;
  indexName: string;
  keyHash: string;
  keyParts: unknown[];
  count: number;
  sumValues: Record<string, number>;
  nonNullCountValues: Record<string, number>;
};

type CountExtremaRow = {
  _id: GenericId<any>;
  tableKey: string;
  indexName: string;
  keyHash: string;
  fieldName: string;
  valueHash: string;
  value: unknown;
  sortKey: string;
  count: number;
};

export type CountIndexDefinition = {
  name: string;
  fields: string[];
};

export type AggregateIndexDefinition = {
  name: string;
  fields: string[];
  countFields: string[];
  sumFields: string[];
  avgFields: string[];
  minFields: string[];
  maxFields: string[];
};

export type CountQueryPlan = {
  tableName: string;
  indexName: string;
  indexFields: string[];
  fieldValues: Record<string, unknown[]>;
  keyCandidates?: unknown[][];
  rangeConstraint: {
    fieldName: string;
    comparisons: RangeComparison[];
    prefixFields: string[];
  } | null;
  postFieldValues: Record<string, unknown[]>;
};

export type AggregateQueryPlan = {
  tableName: string;
  indexName: string;
  indexFields: string[];
  fieldValues: Record<string, unknown[]>;
  keyCandidates?: unknown[][];
  rangeConstraint: {
    fieldName: string;
    comparisons: RangeComparison[];
    prefixFields: string[];
  } | null;
  postFieldValues: Record<string, unknown[]>;
  metric: AggregateMetricRequest;
};

export type PlanBucketReadCache = Map<string, Promise<unknown[]>>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeUndefined(entry));
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeUndefined(entry),
      ])
    );
  }
  if (value === undefined) {
    return {
      [UNDEFINED_SENTINEL]: true,
    };
  }
  return value;
};

const serializeStable = (value: unknown): string =>
  JSON.stringify(normalizeUndefined(value));

const toConstraintSet = (values: unknown[]): Map<string, unknown> => {
  const set = new Map<string, unknown>();
  for (const value of values) {
    set.set(serializeStable(value), value);
  }
  return set;
};

const intersectConstraintSets = (
  left: Map<string, unknown>,
  right: Map<string, unknown>
): Map<string, unknown> => {
  const result = new Map<string, unknown>();
  for (const [key, value] of left.entries()) {
    if (right.has(key)) {
      result.set(key, value);
    }
  }
  return result;
};

const getColumnNames = (tableConfig: TableRelationalConfig): Set<string> => {
  const names = new Set(Object.keys((tableConfig.table as any)[Columns] ?? {}));
  names.add(INTERNAL_ID_FIELD);
  if (usesSystemCreatedAtAlias(tableConfig.table)) {
    names.add(INTERNAL_CREATION_TIME_FIELD);
  }
  return names;
};

const getRelationNames = (tableConfig: TableRelationalConfig): Set<string> =>
  new Set(Object.keys(tableConfig.relations ?? {}));

const normalizeFilterFieldName = (
  tableConfig: TableRelationalConfig,
  fieldName: string
): string => {
  if (fieldName === PUBLIC_ID_FIELD) {
    return INTERNAL_ID_FIELD;
  }
  if (
    fieldName === PUBLIC_CREATED_AT_FIELD &&
    usesSystemCreatedAtAlias(tableConfig.table)
  ) {
    return INTERNAL_CREATION_TIME_FIELD;
  }
  return fieldName;
};

const createError = (code: string, message: string): Error =>
  new Error(`${code}: ${message}`);

const createFilterError = (
  codes: ErrorCodes,
  methodName: string,
  message: string
): Error => createError(codes.FILTER_UNSUPPORTED, `${methodName} ${message}`);

const isRangeComparableValue = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' || typeof value === 'boolean';
};

const withFieldConstraint = (
  target: ConstraintMap,
  fieldName: string
): FieldConstraint => {
  const existing = target.get(fieldName);
  if (existing) {
    return existing;
  }
  const next: FieldConstraint = {};
  target.set(fieldName, next);
  return next;
};

const normalizeAggregateComparableValue = (
  tableConfig: TableRelationalConfig,
  fieldName: string,
  value: unknown
): unknown => {
  if (fieldName === INTERNAL_CREATION_TIME_FIELD) {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (Array.isArray(value)) {
      return value.map((entry) =>
        entry instanceof Date ? entry.getTime() : entry
      );
    }
    return value;
  }

  return normalizeTemporalComparableValue(
    tableConfig.table as any,
    fieldName,
    value
  );
};

const pushConstraint = (
  target: ConstraintMap,
  fieldName: string,
  values: unknown[]
): void => {
  const incoming = toConstraintSet(values);
  const existing = withFieldConstraint(target, fieldName);
  if (!existing.values) {
    existing.values = incoming;
    return;
  }
  existing.values = intersectConstraintSets(existing.values, incoming);
};

const pushRangeComparison = (
  target: ConstraintMap,
  fieldName: string,
  comparison: RangeComparison
): void => {
  const existing = withFieldConstraint(target, fieldName);
  existing.rangeComparisons ??= [];
  existing.rangeComparisons.push(comparison);
};

const matchesRangeComparisons = (
  value: unknown,
  comparisons: RangeComparison[]
): boolean => {
  if (!isRangeComparableValue(value)) {
    return false;
  }
  for (const comparison of comparisons) {
    if (!isRangeComparableValue(comparison.value)) {
      return false;
    }
    const compared = compareSortableValues(value, comparison.value);
    if (comparison.operator === 'gt' && !(compared > 0)) {
      return false;
    }
    if (comparison.operator === 'gte' && !(compared >= 0)) {
      return false;
    }
    if (comparison.operator === 'lt' && !(compared < 0)) {
      return false;
    }
    if (comparison.operator === 'lte' && !(compared <= 0)) {
      return false;
    }
  }
  return true;
};

const normalizeConstraints = (
  constraints: ConstraintMap,
  codes: ErrorCodes,
  methodName: string
): void => {
  for (const [fieldName, constraint] of constraints.entries()) {
    if (constraint.rangeComparisons?.length) {
      for (const comparison of constraint.rangeComparisons) {
        if (!isRangeComparableValue(comparison.value)) {
          throw createFilterError(
            codes,
            methodName,
            `range operators on '${fieldName}' only support finite numbers, strings, and booleans.`
          );
        }
      }
    }

    if (constraint.values && constraint.rangeComparisons?.length) {
      const filtered = new Map<string, unknown>();
      for (const [stableKey, candidate] of constraint.values.entries()) {
        if (matchesRangeComparisons(candidate, constraint.rangeComparisons)) {
          filtered.set(stableKey, candidate);
        }
      }
      constraint.values = filtered;
      constraint.rangeComparisons = undefined;
    }

    if (
      (!constraint.values || constraint.values.size === 0) &&
      (!constraint.rangeComparisons || constraint.rangeComparisons.length === 0)
    ) {
      if (constraint.values && constraint.values.size === 0) {
        continue;
      }
      constraints.delete(fieldName);
    }
  }
};

const parseFieldFilter = (
  tableConfig: TableRelationalConfig,
  fieldName: string,
  value: unknown,
  target: ConstraintMap,
  codes: ErrorCodes,
  methodName: string
): void => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    pushConstraint(target, fieldName, [
      normalizeAggregateComparableValue(tableConfig, fieldName, value),
    ]);
    return;
  }

  const filter = value as Record<string, unknown>;
  if (Object.hasOwn(filter, 'OR') || Object.hasOwn(filter, 'NOT')) {
    throw createFilterError(
      codes,
      methodName,
      `does not support OR/NOT for field '${fieldName}'.`
    );
  }

  if (Object.hasOwn(filter, 'AND')) {
    const andEntries = filter.AND;
    if (!Array.isArray(andEntries)) {
      throw createFilterError(
        codes,
        methodName,
        `field-level AND for '${fieldName}' must be an array.`
      );
    }
    for (const entry of andEntries) {
      parseFieldFilter(
        tableConfig,
        fieldName,
        entry,
        target,
        codes,
        methodName
      );
    }
  }

  let hasRecognizedOperator = false;

  if (Object.hasOwn(filter, 'eq')) {
    hasRecognizedOperator = true;
    pushConstraint(target, fieldName, [
      normalizeAggregateComparableValue(tableConfig, fieldName, filter.eq),
    ]);
  }

  if (Object.hasOwn(filter, 'in')) {
    hasRecognizedOperator = true;
    const inValues = filter.in;
    if (!Array.isArray(inValues)) {
      throw createFilterError(
        codes,
        methodName,
        `field '${fieldName}'.in must be an array.`
      );
    }
    pushConstraint(
      target,
      fieldName,
      normalizeAggregateComparableValue(
        tableConfig,
        fieldName,
        inValues
      ) as unknown[]
    );
  }

  if (Object.hasOwn(filter, 'isNull')) {
    hasRecognizedOperator = true;
    if (filter.isNull !== true) {
      throw createFilterError(
        codes,
        methodName,
        `field '${fieldName}'.isNull only supports true.`
      );
    }
    pushConstraint(target, fieldName, [null]);
  }

  for (const operator of ['gt', 'gte', 'lt', 'lte'] as const) {
    if (!Object.hasOwn(filter, operator)) {
      continue;
    }
    const boundValue = filter[operator];
    if (boundValue === undefined) {
      continue;
    }
    hasRecognizedOperator = true;
    if (
      boundValue === null ||
      Array.isArray(boundValue) ||
      isPlainObject(boundValue)
    ) {
      throw createFilterError(
        codes,
        methodName,
        `field '${fieldName}'.${operator} requires a scalar bound.`
      );
    }
    pushRangeComparison(target, fieldName, {
      operator,
      value: normalizeAggregateComparableValue(
        tableConfig,
        fieldName,
        boundValue
      ),
    });
  }

  const unsupportedOperators = Object.keys(filter).filter(
    (operator) =>
      !['eq', 'in', 'isNull', 'gt', 'gte', 'lt', 'lte', 'AND'].includes(
        operator
      ) && filter[operator] !== undefined
  );
  if (unsupportedOperators.length > 0) {
    throw createFilterError(
      codes,
      methodName,
      `does not support operators [${unsupportedOperators.join(', ')}] on '${fieldName}'.`
    );
  }

  if (!hasRecognizedOperator && !Object.hasOwn(filter, 'AND')) {
    throw createFilterError(
      codes,
      methodName,
      `filter for '${fieldName}' is not supported.`
    );
  }
};

const constraintValuesEqual = (
  left: Map<string, unknown> | undefined,
  right: Map<string, unknown> | undefined
): boolean => {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left.keys()) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
};

const constraintValuesToFilter = (
  values: Map<string, unknown>
): unknown | { in: unknown[] } => {
  if (values.size === 1) {
    return values.values().next().value;
  }
  return {
    in: [...values.values()],
  };
};

const parseFiniteOrBranch = (options: {
  branch: Record<string, unknown>;
  tableConfig: TableRelationalConfig;
  codes: ErrorCodes;
  methodName: string;
}): Map<string, Map<string, unknown>> | null => {
  const { branch, tableConfig, codes, methodName } = options;
  if (
    Object.hasOwn(branch, 'AND') ||
    Object.hasOwn(branch, 'OR') ||
    Object.hasOwn(branch, 'NOT') ||
    Object.hasOwn(branch, 'RAW')
  ) {
    return null;
  }

  const columnNames = getColumnNames(tableConfig);
  const relationNames = getRelationNames(tableConfig);
  const constraints = new Map<string, FieldConstraint>();
  for (const [key, value] of Object.entries(branch)) {
    const normalizedKey = normalizeFilterFieldName(tableConfig, key);
    if (!columnNames.has(normalizedKey)) {
      if (relationNames.has(key)) {
        throw createFilterError(
          codes,
          methodName,
          `does not support relation filters ('${key}') in v1.`
        );
      }
      throw createFilterError(
        codes,
        methodName,
        `filter field '${key}' is not recognized.`
      );
    }
    parseFieldFilter(
      tableConfig,
      normalizedKey,
      value,
      constraints,
      codes,
      methodName
    );
  }

  normalizeConstraints(constraints, codes, methodName);

  const result = new Map<string, Map<string, unknown>>();
  for (const [field, constraint] of constraints.entries()) {
    if (constraint.rangeComparisons?.length) {
      return null;
    }
    if (!constraint.values) {
      continue;
    }
    result.set(field, new Map(constraint.values.entries()));
  }
  return result;
};

const collapseSafeOrBranches = (options: {
  branches: Record<string, unknown>[];
  tableConfig: TableRelationalConfig;
  codes: ErrorCodes;
  methodName: string;
}): Record<string, unknown> | null => {
  const { branches, tableConfig, codes, methodName } = options;
  if (branches.length === 0) {
    return null;
  }

  const branchConstraints = branches
    .map((branch) =>
      parseFiniteOrBranch({
        branch,
        tableConfig,
        codes,
        methodName,
      })
    )
    .filter(
      (entry): entry is Map<string, Map<string, unknown>> => entry !== null
    );

  if (
    branchConstraints.length !== branches.length ||
    branchConstraints.length === 0
  ) {
    return null;
  }

  const fields = new Set<string>();
  for (const branch of branchConstraints) {
    for (const field of branch.keys()) {
      fields.add(field);
    }
  }
  if (fields.size === 0) {
    return null;
  }

  const varyingFields: string[] = [];
  const first = branchConstraints[0]!;
  for (const field of fields) {
    const firstValues = first.get(field);
    const isDifferent = branchConstraints.some(
      (branch) => !constraintValuesEqual(firstValues, branch.get(field))
    );
    if (isDifferent) {
      varyingFields.push(field);
    }
  }

  if (varyingFields.length === 0) {
    const collapsed: Record<string, unknown> = {};
    for (const [field, values] of first.entries()) {
      collapsed[field] = constraintValuesToFilter(values);
    }
    return collapsed;
  }
  if (varyingFields.length !== 1) {
    return null;
  }

  const varyingField = varyingFields[0]!;
  const unionValues = new Map<string, unknown>();
  for (const branch of branchConstraints) {
    const values = branch.get(varyingField);
    if (!values || values.size === 0) {
      return null;
    }
    for (const [key, value] of values.entries()) {
      unionValues.set(key, value);
    }
  }

  const collapsed: Record<string, unknown> = {
    [varyingField]: constraintValuesToFilter(unionValues),
  };
  for (const [field, values] of first.entries()) {
    if (field === varyingField) {
      continue;
    }
    collapsed[field] = constraintValuesToFilter(values);
  }
  return collapsed;
};

const rewriteSafeOrWhere = (options: {
  where: Record<string, unknown>;
  tableConfig: TableRelationalConfig;
  codes: ErrorCodes;
  methodName: string;
}): Record<string, unknown> => {
  const { where, tableConfig, codes, methodName } = options;
  if (Object.hasOwn(where, 'NOT')) {
    throw createFilterError(
      codes,
      methodName,
      'NOT is not supported in no-scan aggregate/count filters.'
    );
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND') {
      if (value === undefined) {
        continue;
      }
      if (!Array.isArray(value)) {
        throw createFilterError(
          codes,
          methodName,
          'AND must be an array of filter objects.'
        );
      }
      normalized.AND = value.map((entry) => {
        if (!isPlainObject(entry)) {
          throw createFilterError(
            codes,
            methodName,
            'AND entries must be objects.'
          );
        }
        return rewriteSafeOrWhere({
          where: entry,
          tableConfig,
          codes,
          methodName,
        });
      });
      continue;
    }
    if (key === 'OR') {
      continue;
    }
    normalized[key] = value;
  }

  if (!Object.hasOwn(where, 'OR')) {
    return normalized;
  }

  const branches = where.OR;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw createFilterError(
      codes,
      methodName,
      'OR must be a non-empty array of filter objects.'
    );
  }

  const normalizedBranches = branches.map((entry) => {
    if (!isPlainObject(entry)) {
      throw createFilterError(codes, methodName, 'OR entries must be objects.');
    }
    return rewriteSafeOrWhere({
      where: entry,
      tableConfig,
      codes,
      methodName,
    });
  });

  const collapsedOr = collapseSafeOrBranches({
    branches: normalizedBranches,
    tableConfig,
    codes,
    methodName,
  });
  if (!collapsedOr) {
    throw createFilterError(
      codes,
      methodName,
      'OR rewrite only supports finite index-plannable branches that differ on one scalar eq/in/isNull field.'
    );
  }

  if (Object.keys(normalized).length === 0) {
    return collapsedOr;
  }

  return {
    AND: [normalized, collapsedOr],
  };
};

const parseWhereObject = (
  where: Record<string, unknown>,
  tableConfig: TableRelationalConfig,
  target: ConstraintMap,
  codes: ErrorCodes,
  methodName: string
): void => {
  if (Object.hasOwn(where, 'OR') || Object.hasOwn(where, 'NOT')) {
    throw createFilterError(
      codes,
      methodName,
      'only supports conjunctions (object fields + AND).'
    );
  }

  if (Object.hasOwn(where, 'RAW')) {
    throw createFilterError(codes, methodName, 'does not support RAW filters.');
  }

  if (Object.hasOwn(where, 'AND')) {
    const andEntries = where.AND;
    if (!Array.isArray(andEntries)) {
      throw createFilterError(
        codes,
        methodName,
        'AND must be an array of filter objects.'
      );
    }
    for (const entry of andEntries) {
      if (!isPlainObject(entry)) {
        throw createFilterError(
          codes,
          methodName,
          'AND entries must be objects.'
        );
      }
      parseWhereObject(entry, tableConfig, target, codes, methodName);
    }
  }

  const columnNames = getColumnNames(tableConfig);
  const relationNames = getRelationNames(tableConfig);

  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND') {
      continue;
    }

    const normalizedKey = normalizeFilterFieldName(tableConfig, key);
    if (columnNames.has(normalizedKey)) {
      parseFieldFilter(
        tableConfig,
        normalizedKey,
        value,
        target,
        codes,
        methodName
      );
      continue;
    }

    if (relationNames.has(key)) {
      throw createFilterError(
        codes,
        methodName,
        `does not support relation filters ('${key}') in v1.`
      );
    }

    throw createFilterError(
      codes,
      methodName,
      `filter field '${key}' is not recognized.`
    );
  }
};

const constraintsToValueRecord = (
  constraints: ConstraintMap
): Record<string, unknown[]> => {
  const record: Record<string, unknown[]> = {};
  for (const [field, constraint] of constraints.entries()) {
    if (!constraint.values) {
      continue;
    }
    record[field] = [...constraint.values.values()];
  }
  return record;
};

export const getAggregateIndexDefinitions = (
  tableConfig: TableRelationalConfig
): AggregateIndexDefinition[] => {
  const aggregateIndexes = (tableConfig.table as any).getAggregateIndexes?.();
  if (!Array.isArray(aggregateIndexes)) {
    return [];
  }
  return aggregateIndexes.map((entry) => ({
    name: entry.name,
    fields: entry.fields ?? [],
    countFields: entry.countFields ?? [],
    sumFields: entry.sumFields ?? [],
    avgFields: entry.avgFields ?? [],
    minFields: entry.minFields ?? [],
    maxFields: entry.maxFields ?? [],
  }));
};

export const getCountIndexDefinitions = (
  tableConfig: TableRelationalConfig
): CountIndexDefinition[] =>
  getAggregateIndexDefinitions(tableConfig).map((entry) => ({
    name: entry.name,
    fields: entry.fields,
  }));

const supportsMetric = (
  index: AggregateIndexDefinition,
  metric: AggregateMetricRequest
): boolean => {
  if (metric.kind === 'count') {
    return true;
  }
  if (metric.kind === 'countField') {
    return index.countFields.includes(metric.field);
  }
  if (metric.kind === 'sum') {
    return (
      index.sumFields.includes(metric.field) ||
      index.avgFields.includes(metric.field)
    );
  }
  if (metric.kind === 'avg') {
    return index.avgFields.includes(metric.field);
  }
  if (metric.kind === 'min') {
    return index.minFields.includes(metric.field);
  }
  return index.maxFields.includes(metric.field);
};

const pickAggregateIndex = (
  indexDefinitions: AggregateIndexDefinition[],
  constrainedFields: Set<string>,
  metric: AggregateMetricRequest
): AggregateIndexDefinition | null => {
  let best: AggregateIndexDefinition | null = null;
  for (const definition of indexDefinitions) {
    const allIndexFieldsConstrained = definition.fields.every((field) =>
      constrainedFields.has(field)
    );
    if (!allIndexFieldsConstrained) {
      continue;
    }

    const indexFieldSet = new Set(definition.fields);
    const hasUnknownConstraint = [...constrainedFields].some(
      (field) => !indexFieldSet.has(field)
    );
    if (hasUnknownConstraint) {
      continue;
    }

    if (!supportsMetric(definition, metric)) {
      continue;
    }

    if (!best || definition.fields.length > best.fields.length) {
      best = definition;
    }
  }
  return best;
};

const pickRangeAggregateIndex = (
  indexDefinitions: AggregateIndexDefinition[],
  constraints: ConstraintMap,
  constrainedFields: Set<string>,
  rangeFieldName: string,
  metric: AggregateMetricRequest
): {
  definition: AggregateIndexDefinition;
  prefixFields: string[];
} | null => {
  let best: {
    definition: AggregateIndexDefinition;
    prefixFields: string[];
  } | null = null;

  for (const definition of indexDefinitions) {
    if (!supportsMetric(definition, metric)) {
      continue;
    }

    const usesImplicitCreationTimeSuffix =
      rangeFieldName === INTERNAL_CREATION_TIME_FIELD;
    const rangeFieldPosition = usesImplicitCreationTimeSuffix
      ? definition.fields.length
      : definition.fields.indexOf(rangeFieldName);
    if (rangeFieldPosition < 0) {
      continue;
    }

    const indexFieldSet = new Set(definition.fields);
    if (usesImplicitCreationTimeSuffix) {
      indexFieldSet.add(INTERNAL_CREATION_TIME_FIELD);
    }
    const hasUnknownConstraint = [...constrainedFields].some(
      (field) => !indexFieldSet.has(field)
    );
    if (hasUnknownConstraint) {
      continue;
    }

    const prefixFields = definition.fields.slice(0, rangeFieldPosition);
    const hasMissingPrefix = prefixFields.some((field) => {
      const fieldConstraint = constraints.get(field);
      return !fieldConstraint?.values;
    });
    if (hasMissingPrefix) {
      continue;
    }

    const hasRangeInPrefix = prefixFields.some((field) => {
      const fieldConstraint = constraints.get(field);
      return Boolean(fieldConstraint?.rangeComparisons?.length);
    });
    if (hasRangeInPrefix) {
      continue;
    }

    if (
      !best ||
      prefixFields.length > best.prefixFields.length ||
      (prefixFields.length === best.prefixFields.length &&
        definition.fields.length > best.definition.fields.length)
    ) {
      best = {
        definition,
        prefixFields,
      };
    }
  }

  return best;
};

const buildCandidateKeys = (
  fields: string[],
  constraints: Record<string, unknown[]>,
  index = 0,
  current: unknown[] = [],
  output: unknown[][] = []
): unknown[][] => {
  if (index >= fields.length) {
    output.push([...current]);
    return output;
  }
  const field = fields[index];
  const values = constraints[field] ?? [];
  for (const value of values) {
    current.push(value);
    buildCandidateKeys(fields, constraints, index + 1, current, output);
    current.pop();
  }
  return output;
};

const getAggregateCartesianMaxKeys = (
  tableConfig: TableRelationalConfig
): number => {
  const value = tableConfig.defaults?.aggregateCartesianMaxKeys;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  return DEFAULT_AGGREGATE_CARTESIAN_MAX_KEYS;
};

const getAggregateWorkBudget = (tableConfig: TableRelationalConfig): number => {
  const value = tableConfig.defaults?.aggregateWorkBudget;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  return DEFAULT_AGGREGATE_WORK_BUDGET;
};

const countCartesianCombinations = (
  fields: string[],
  constraints: Record<string, unknown[]>,
  maxCount: number
): number => {
  if (fields.length === 0) {
    return 1;
  }

  let total = 1;
  for (const field of fields) {
    const values = constraints[field] ?? [];
    if (values.length === 0) {
      return 0;
    }
    const threshold = Math.max(1, maxCount);
    const maxBeforeMultiply = Math.floor(threshold / values.length);
    if (total > maxBeforeMultiply) {
      return threshold + 1;
    }
    total *= values.length;
  }

  return total;
};

const enforceCartesianExpansionGuards = (options: {
  tableConfig: TableRelationalConfig;
  codes: ErrorCodes;
  methodName: string;
  indexName: string;
  fields: string[];
  fieldValues: Record<string, unknown[]>;
  workUnitsPerCombination: number;
  workLabel: string;
}): void => {
  const cartesianMaxKeys = getAggregateCartesianMaxKeys(options.tableConfig);
  const workBudget = getAggregateWorkBudget(options.tableConfig);
  const workUnitsPerCombination = Math.max(1, options.workUnitsPerCombination);
  const maxCombinationsByWork = Math.max(
    1,
    Math.floor(workBudget / workUnitsPerCombination)
  );
  const maxTrackedCombinations = Math.max(
    cartesianMaxKeys,
    maxCombinationsByWork
  );
  const combinations = countCartesianCombinations(
    options.fields,
    options.fieldValues,
    maxTrackedCombinations
  );
  if (combinations === 0) {
    return;
  }

  if (combinations > cartesianMaxKeys) {
    throw createFilterError(
      options.codes,
      options.methodName,
      `expands IN filters to ${combinations} key combinations on aggregateIndex '${options.indexName}', exceeding aggregateCartesianMaxKeys (${cartesianMaxKeys}). Reduce IN list sizes, split the query, add a narrower aggregateIndex, or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
    );
  }

  const estimatedWork = combinations * workUnitsPerCombination;
  if (estimatedWork > workBudget) {
    throw createFilterError(
      options.codes,
      options.methodName,
      `estimated ${options.workLabel} is ${estimatedWork} units on aggregateIndex '${options.indexName}', exceeding aggregateWorkBudget (${workBudget}). Reduce IN fan-out, split the query, or increase defineSchema(..., { defaults: { aggregateWorkBudget } }).`
    );
  }
};

type DnfBranch = Record<string, unknown>[];

const hasLogicalOr = (where: Record<string, unknown>): boolean => {
  if (Object.hasOwn(where, 'OR')) {
    return true;
  }

  const andEntries = where.AND;
  if (!Array.isArray(andEntries)) {
    return false;
  }

  return andEntries.some(
    (entry) => isPlainObject(entry) && hasLogicalOr(entry)
  );
};

const combineDnfBranches = (options: {
  left: DnfBranch[];
  right: DnfBranch[];
  maxBranches: number;
  codes: ErrorCodes;
  methodName: string;
}): DnfBranch[] => {
  const { left, right, maxBranches, codes, methodName } = options;
  if (left.length === 0 || right.length === 0) {
    return [];
  }

  const threshold = Math.max(1, maxBranches);
  const maxBeforeMultiply = Math.floor(threshold / right.length);
  if (left.length > maxBeforeMultiply) {
    const expanded = left.length * right.length;
    throw createFilterError(
      codes,
      methodName,
      `OR rewrite expands to ${expanded} branches, exceeding aggregateCartesianMaxKeys (${threshold}). Reduce OR fan-out, split the query, or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
    );
  }

  const combined: DnfBranch[] = [];
  for (const leftBranch of left) {
    for (const rightBranch of right) {
      combined.push([...leftBranch, ...rightBranch]);
    }
  }
  return combined;
};

const expandWhereToFiniteDnf = (options: {
  where: Record<string, unknown>;
  maxBranches: number;
  codes: ErrorCodes;
  methodName: string;
}): DnfBranch[] => {
  const { where, maxBranches, codes, methodName } = options;
  if (Object.hasOwn(where, 'NOT')) {
    throw createFilterError(
      codes,
      methodName,
      'NOT is not supported in no-scan aggregate/count filters.'
    );
  }
  if (Object.hasOwn(where, 'RAW')) {
    throw createFilterError(codes, methodName, 'does not support RAW filters.');
  }

  const scalarClause: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') {
      continue;
    }
    scalarClause[key] = value;
  }

  let branches: DnfBranch[] = [[]];
  if (Object.keys(scalarClause).length > 0) {
    branches = branches.map((branch) => [...branch, scalarClause]);
  }

  if (Object.hasOwn(where, 'AND')) {
    const andEntries = where.AND;
    if (!Array.isArray(andEntries)) {
      throw createFilterError(
        codes,
        methodName,
        'AND must be an array of filter objects.'
      );
    }
    for (const entry of andEntries) {
      if (!isPlainObject(entry)) {
        throw createFilterError(
          codes,
          methodName,
          'AND entries must be objects.'
        );
      }
      const entryBranches = expandWhereToFiniteDnf({
        where: entry,
        maxBranches,
        codes,
        methodName,
      });
      branches = combineDnfBranches({
        left: branches,
        right: entryBranches,
        maxBranches,
        codes,
        methodName,
      });
    }
  }

  if (Object.hasOwn(where, 'OR')) {
    const orEntries = where.OR;
    if (!Array.isArray(orEntries) || orEntries.length === 0) {
      throw createFilterError(
        codes,
        methodName,
        'OR must be a non-empty array of filter objects.'
      );
    }

    const orBranches: DnfBranch[] = [];
    for (const entry of orEntries) {
      if (!isPlainObject(entry)) {
        throw createFilterError(
          codes,
          methodName,
          'OR entries must be objects.'
        );
      }
      const expanded = expandWhereToFiniteDnf({
        where: entry,
        maxBranches,
        codes,
        methodName,
      });
      orBranches.push(...expanded);
      if (orBranches.length > maxBranches) {
        throw createFilterError(
          codes,
          methodName,
          `OR rewrite expands to ${orBranches.length} branches, exceeding aggregateCartesianMaxKeys (${maxBranches}). Reduce OR fan-out, split the query, or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
        );
      }
    }

    branches = combineDnfBranches({
      left: branches,
      right: orBranches,
      maxBranches,
      codes,
      methodName,
    });
  }

  return branches;
};

const branchToWhere = (branch: DnfBranch): Record<string, unknown> => {
  if (branch.length === 0) {
    return {};
  }
  if (branch.length === 1) {
    return branch[0]!;
  }
  return {
    AND: branch,
  };
};

const compileFiniteOrUnionPlan = (options: {
  tableConfig: TableRelationalConfig;
  where: Record<string, unknown>;
  metric: AggregateMetricRequest;
  aggregateIndexes: AggregateIndexDefinition[];
  codes: ErrorCodes;
  methodName: string;
  throwNotIndexed: () => never;
}): AggregateQueryPlan | null => {
  const {
    tableConfig,
    where,
    metric,
    aggregateIndexes,
    codes,
    methodName,
    throwNotIndexed,
  } = options;
  if (!hasLogicalOr(where)) {
    return null;
  }

  const cartesianMaxKeys = getAggregateCartesianMaxKeys(tableConfig);
  const workBudget = getAggregateWorkBudget(tableConfig);
  const maxBranches = Math.max(1, Math.min(cartesianMaxKeys, workBudget));
  const branches = expandWhereToFiniteDnf({
    where,
    maxBranches,
    codes,
    methodName,
  });

  if (branches.length === 0) {
    throw createFilterError(
      codes,
      methodName,
      'OR must include at least one branch.'
    );
  }

  const dedupedKeyCandidates = new Map<string, unknown[]>();
  let selectedIndexName: string | null = null;
  let selectedIndexFields: string[] | null = null;
  let totalBranchCandidates = 0;

  for (const branch of branches) {
    const branchWhere = branchToWhere(branch);
    const constraints = new Map<string, FieldConstraint>();
    parseWhereObject(branchWhere, tableConfig, constraints, codes, methodName);
    normalizeConstraints(constraints, codes, methodName);

    const rangeFields = [...constraints.entries()]
      .filter(
        ([, constraint]) => (constraint.rangeComparisons?.length ?? 0) > 0
      )
      .map(([field]) => field);
    if (rangeFields.length > 0) {
      throw createFilterError(
        codes,
        methodName,
        'OR rewrite supports finite eq/in/isNull branches only in v1. Range operators inside OR are not supported.'
      );
    }

    const constrainedFields = new Set<string>(constraints.keys());
    const matchedIndex = pickAggregateIndex(
      aggregateIndexes,
      constrainedFields,
      metric
    );
    if (!matchedIndex) {
      throwNotIndexed();
    }
    const exactIndex = matchedIndex!;

    if (selectedIndexName === null || selectedIndexFields === null) {
      selectedIndexName = exactIndex.name;
      selectedIndexFields = exactIndex.fields;
    } else if (
      selectedIndexName !== exactIndex.name ||
      selectedIndexFields.length !== exactIndex.fields.length ||
      selectedIndexFields.some(
        (field, index) => field !== exactIndex.fields[index]
      )
    ) {
      throw createFilterError(
        codes,
        methodName,
        `OR branches must resolve to a single aggregateIndex. Found incompatible branches between '${selectedIndexName}' and '${exactIndex.name}'.`
      );
    }

    const rawFieldValues = constraintsToValueRecord(constraints);
    const fieldValues = Object.fromEntries(
      exactIndex.fields.map((field) => [field, rawFieldValues[field] ?? []])
    );

    enforceCartesianExpansionGuards({
      tableConfig,
      codes,
      methodName,
      indexName: exactIndex.name,
      fields: exactIndex.fields,
      fieldValues,
      workUnitsPerCombination: 1,
      workLabel: 'OR-branch key lookup work',
    });

    if (Object.values(fieldValues).some((values) => values.length === 0)) {
      continue;
    }

    const branchCandidates = buildCandidateKeys(exactIndex.fields, fieldValues);
    totalBranchCandidates += branchCandidates.length;
    for (const keyParts of branchCandidates) {
      dedupedKeyCandidates.set(serializeCountKeyParts(keyParts), keyParts);
    }
  }

  if (!selectedIndexName || !selectedIndexFields) {
    throw createFilterError(
      codes,
      methodName,
      'OR rewrite did not resolve to any index-plannable branch.'
    );
  }

  const uniqueKeyCount = dedupedKeyCandidates.size;
  if (uniqueKeyCount > cartesianMaxKeys) {
    throw createFilterError(
      codes,
      methodName,
      `OR rewrite expands to ${uniqueKeyCount} unique key combinations on aggregateIndex '${selectedIndexName}', exceeding aggregateCartesianMaxKeys (${cartesianMaxKeys}). Reduce OR fan-out, split the query, or increase defineSchema(..., { defaults: { aggregateCartesianMaxKeys } }).`
    );
  }

  const estimatedWork = branches.length + totalBranchCandidates;
  if (estimatedWork > workBudget) {
    throw createFilterError(
      codes,
      methodName,
      `estimated OR rewrite work is ${estimatedWork} units on aggregateIndex '${selectedIndexName}', exceeding aggregateWorkBudget (${workBudget}). Reduce OR fan-out, split the query, or increase defineSchema(..., { defaults: { aggregateWorkBudget } }).`
    );
  }

  return {
    tableName: tableConfig.name,
    indexName: selectedIndexName,
    indexFields: selectedIndexFields,
    fieldValues: {},
    keyCandidates: [...dedupedKeyCandidates.values()],
    rangeConstraint: null,
    postFieldValues: {},
    metric,
  };
};

export const serializeCountKeyParts = (parts: unknown[]): string =>
  serializeStable(parts);

const compileAggregatePlan = (
  tableConfig: TableRelationalConfig,
  where: unknown,
  metric: AggregateMetricRequest,
  codes: ErrorCodes,
  methodName: string
): AggregateQueryPlan => {
  const normalizedWhere = where ?? {};
  if (!isPlainObject(normalizedWhere)) {
    throw createFilterError(
      codes,
      methodName,
      'where must be an object filter.'
    );
  }

  const aggregateIndexes = getAggregateIndexDefinitions(tableConfig);
  const throwNotIndexed = (fieldList: string): never => {
    if (metric.kind === 'count') {
      throw createError(
        codes.NOT_INDEXED,
        `No matching aggregateIndex found for count() on '${tableConfig.name}'. Add an aggregateIndex for [${fieldList}] and run aggregateBackfill.`
      );
    }
    if (metric.kind === 'countField') {
      throw createError(
        codes.NOT_INDEXED,
        `No matching aggregateIndex found for count(select: { ${metric.field}: true }) on '${tableConfig.name}'. Declare aggregateIndex(...).on(...).count(...) and run aggregateBackfill.`
      );
    }
    if (metric.kind === 'avg') {
      throw createError(
        codes.NOT_INDEXED,
        `No matching aggregateIndex found for avg('${metric.field}') on '${tableConfig.name}'. Declare aggregateIndex(...).on(...).avg(...) (or .all() for unfiltered) and run aggregateBackfill.`
      );
    }
    throw createError(
      codes.NOT_INDEXED,
      `No matching aggregateIndex found for ${metric.kind}('${metric.field}') on '${tableConfig.name}'. Declare aggregateIndex(...).on(...).${metric.kind}(...) (or .all() for unfiltered) and run aggregateBackfill.`
    );
  };

  const finiteOrUnionPlan = compileFiniteOrUnionPlan({
    tableConfig,
    where: normalizedWhere,
    metric,
    aggregateIndexes,
    codes,
    methodName,
    throwNotIndexed: () => throwNotIndexed('OR branches'),
  });
  if (finiteOrUnionPlan) {
    return finiteOrUnionPlan;
  }

  const constraints = new Map<string, FieldConstraint>();
  const rewrittenWhere = rewriteSafeOrWhere({
    where: normalizedWhere,
    tableConfig,
    codes,
    methodName,
  });
  parseWhereObject(rewrittenWhere, tableConfig, constraints, codes, methodName);
  normalizeConstraints(constraints, codes, methodName);

  const constrainedFields = new Set<string>(constraints.keys());
  const rangeFields = [...constraints.entries()]
    .filter(([, constraint]) => (constraint.rangeComparisons?.length ?? 0) > 0)
    .map(([field]) => field);

  if (rangeFields.length > 1) {
    throw createFilterError(
      codes,
      methodName,
      `supports range operators on at most one field in v1. Found [${rangeFields.join(', ')}].`
    );
  }
  const fieldList = [...constrainedFields].join(', ');

  if (rangeFields.length === 0) {
    const matchedIndex = pickAggregateIndex(
      aggregateIndexes,
      constrainedFields,
      metric
    );
    if (!matchedIndex) {
      throwNotIndexed(fieldList);
    }
    const exactIndex = matchedIndex!;

    const rawFieldValues = constraintsToValueRecord(constraints);
    const fieldValues = Object.fromEntries(
      exactIndex.fields.map((field) => [field, rawFieldValues[field] ?? []])
    );

    enforceCartesianExpansionGuards({
      tableConfig,
      codes,
      methodName,
      indexName: exactIndex.name,
      fields: exactIndex.fields,
      fieldValues,
      workUnitsPerCombination: 1,
      workLabel: 'key lookup work',
    });

    for (const values of Object.values(fieldValues)) {
      if (values.length === 0) {
        return {
          tableName: tableConfig.name,
          indexName: exactIndex.name,
          indexFields: exactIndex.fields,
          fieldValues,
          rangeConstraint: null,
          postFieldValues: {},
          metric,
        };
      }
    }

    return {
      tableName: tableConfig.name,
      indexName: exactIndex.name,
      indexFields: exactIndex.fields,
      fieldValues,
      rangeConstraint: null,
      postFieldValues: {},
      metric,
    };
  }

  const rangeFieldName = rangeFields[0]!;
  const rangeComparisons =
    constraints.get(rangeFieldName)?.rangeComparisons ?? [];
  const matchedRangeIndex = pickRangeAggregateIndex(
    aggregateIndexes,
    constraints,
    constrainedFields,
    rangeFieldName,
    metric
  );
  if (!matchedRangeIndex) {
    throwNotIndexed(fieldList);
  }
  const rangeIndex = matchedRangeIndex!;

  const prefixFieldValues = Object.fromEntries(
    rangeIndex.prefixFields.map((field) => [
      field,
      [...(constraints.get(field)?.values?.values() ?? [])],
    ])
  ) as Record<string, unknown[]>;

  const postFieldValues: Record<string, unknown[]> = {};
  for (const field of rangeIndex.definition.fields) {
    if (field === rangeFieldName || rangeIndex.prefixFields.includes(field)) {
      continue;
    }
    const values = constraints.get(field)?.values;
    if (!values) {
      continue;
    }
    postFieldValues[field] = [...values.values()];
  }

  const rangeWorkUnits =
    RANGE_PREFIX_WORK_UNIT_BASE + Object.keys(postFieldValues).length;
  enforceCartesianExpansionGuards({
    tableConfig,
    codes,
    methodName,
    indexName: rangeIndex.definition.name,
    fields: rangeIndex.prefixFields,
    fieldValues: prefixFieldValues,
    workUnitsPerCombination: rangeWorkUnits,
    workLabel: 'range-prefix work',
  });

  return {
    tableName: tableConfig.name,
    indexName: rangeIndex.definition.name,
    indexFields: rangeIndex.definition.fields,
    fieldValues: prefixFieldValues,
    rangeConstraint: {
      fieldName: rangeFieldName,
      comparisons: rangeComparisons,
      prefixFields: rangeIndex.prefixFields,
    },
    postFieldValues,
    metric,
  };
};

export const compileCountQueryPlan = (
  tableConfig: TableRelationalConfig,
  where: unknown
): CountQueryPlan => {
  const plan = compileAggregatePlan(
    tableConfig,
    where,
    { kind: 'count' },
    COUNT_ERROR,
    'count()'
  );
  return {
    tableName: plan.tableName,
    indexName: plan.indexName,
    indexFields: plan.indexFields,
    fieldValues: plan.fieldValues,
    keyCandidates: plan.keyCandidates,
    rangeConstraint: plan.rangeConstraint,
    postFieldValues: plan.postFieldValues,
  };
};

export const compileCountFieldQueryPlan = (
  tableConfig: TableRelationalConfig,
  where: unknown,
  field: string
): AggregateQueryPlan =>
  compileAggregatePlan(
    tableConfig,
    where,
    { kind: 'countField', field },
    COUNT_ERROR,
    `count(select: { ${field}: true })`
  );

export const compileAggregateQueryPlan = (
  tableConfig: TableRelationalConfig,
  where: unknown,
  metric: AggregateMetricRequest
): AggregateQueryPlan =>
  compileAggregatePlan(
    tableConfig,
    where,
    metric,
    AGGREGATE_ERROR,
    (() => {
      if (metric.kind === 'countField') {
        return `count(select: { ${metric.field}: true })`;
      }
      if (metric.kind === 'avg') {
        return `avg('${metric.field}')`;
      }
      return `${metric.kind}()`;
    })()
  );

const deepEquals = (left: unknown, right: unknown): boolean =>
  serializeStable(left) === serializeStable(right);

const normalizeSumValues = (
  values: Record<string, number>
): Record<string, number> => {
  const output: Record<string, number> = {};
  for (const [field, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[field] = value;
    }
  }
  return output;
};

const normalizeNonNullCountValues = (
  values: Record<string, number>
): Record<string, number> => {
  const output: Record<string, number> = {};
  for (const [field, value] of Object.entries(values)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[field] = value;
    }
  }
  return output;
};

const normalizeExtremaValues = (
  values: Record<string, unknown>
): Record<string, unknown> => ({ ...values });

const mergeSumValues = (
  baseValues: Record<string, number>,
  deltaValues: Record<string, number>
): Record<string, number> => {
  const merged: Record<string, number> = {
    ...baseValues,
  };
  for (const [field, delta] of Object.entries(deltaValues)) {
    const current = merged[field] ?? 0;
    const next = current + delta;
    if (next === 0) {
      delete merged[field];
      continue;
    }
    merged[field] = next;
  }
  return merged;
};

const mergeCountValues = (
  baseValues: Record<string, number>,
  deltaValues: Record<string, number>
): Record<string, number> => {
  const merged: Record<string, number> = {
    ...baseValues,
  };
  for (const [field, delta] of Object.entries(deltaValues)) {
    const current = merged[field] ?? 0;
    const next = current + delta;
    if (next === 0) {
      delete merged[field];
      continue;
    }
    merged[field] = next;
  }
  return merged;
};

const negateSumValues = (
  values: Record<string, number>
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(values).map(([field, value]) => [field, -value])
  );

const negateCountValues = (
  values: Record<string, number>
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(values).map(([field, value]) => [field, -value])
  );

const listBucketsByHash = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyHash: string
): Promise<CountBucketRow[]> =>
  (await db
    .query(AGGREGATE_BUCKET_TABLE)
    .withIndex('by_table_index_hash', (q: any) =>
      q
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
        .eq('keyHash', keyHash)
    )
    .collect()) as CountBucketRow[];

const getBucketByKey = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyParts: unknown[]
): Promise<CountBucketRow | null> => {
  const keyHash = serializeCountKeyParts(keyParts);
  const buckets = await listBucketsByHash(db, tableName, indexName, keyHash);
  return (
    buckets.find((bucket) => deepEquals(bucket.keyParts, keyParts)) ?? null
  );
};

const listBucketsByHashPrefix = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  prefixStart: string,
  prefixEnd: string
): Promise<CountBucketRow[]> =>
  (await db
    .query(AGGREGATE_BUCKET_TABLE)
    .withIndex('by_table_index_hash', (q: any) =>
      q
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
        .gte('keyHash', prefixStart)
        .lt('keyHash', prefixEnd)
    )
    .collect()) as CountBucketRow[];

const getExtremaByValue = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyHash: string,
  fieldName: string,
  value: unknown
): Promise<CountExtremaRow | null> => {
  const valueHash = serializeStable(value);
  const rows = (await db
    .query(AGGREGATE_EXTREMA_TABLE)
    .withIndex('by_table_index_hash_field_value', (q: any) =>
      q
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
        .eq('keyHash', keyHash)
        .eq('fieldName', fieldName)
        .eq('valueHash', valueHash)
    )
    .collect()) as CountExtremaRow[];
  return rows.find((row) => deepEquals(row.value, value)) ?? null;
};

const listMembersForIndex = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<CountMemberRow[]> =>
  (await db
    .query(AGGREGATE_MEMBER_TABLE)
    .withIndex('by_kind_table_index', (q: any) =>
      q
        .eq('kind', AGGREGATE_STATE_KIND_METRIC)
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
    )
    .collect()) as CountMemberRow[];

const listBucketsForIndex = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<CountBucketRow[]> =>
  (await db
    .query(AGGREGATE_BUCKET_TABLE)
    .withIndex('by_table_index', (q: any) =>
      q.eq('tableKey', tableName).eq('indexName', indexName)
    )
    .collect()) as CountBucketRow[];

const listExtremaForIndex = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<CountExtremaRow[]> =>
  (await db
    .query(AGGREGATE_EXTREMA_TABLE)
    .withIndex('by_table_index', (q: any) =>
      q.eq('tableKey', tableName).eq('indexName', indexName)
    )
    .collect()) as CountExtremaRow[];

const applyBucketDelta = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyParts: unknown[],
  deltaCount: number,
  deltaSums: Record<string, number>,
  deltaNonNullCounts: Record<string, number>
): Promise<void> => {
  if (
    deltaCount === 0 &&
    Object.keys(deltaSums).length === 0 &&
    Object.keys(deltaNonNullCounts).length === 0
  ) {
    return;
  }

  const existing = await getBucketByKey(db, tableName, indexName, keyParts);
  const now = Date.now();

  if (!existing) {
    if (deltaCount < 0) {
      return;
    }
    await db.insert(AGGREGATE_BUCKET_TABLE, {
      tableKey: tableName,
      indexName,
      keyHash: serializeCountKeyParts(keyParts),
      keyParts,
      count: deltaCount,
      sumValues: deltaSums,
      nonNullCountValues: deltaNonNullCounts,
      updatedAt: now,
    });
    return;
  }

  const nextCount = existing.count + deltaCount;
  if (nextCount <= 0) {
    await db.delete(AGGREGATE_BUCKET_TABLE, existing._id as any);
    return;
  }

  const nextSumValues = mergeSumValues(
    normalizeSumValues(existing.sumValues),
    deltaSums
  );
  const nextNonNullCountValues = mergeCountValues(
    normalizeNonNullCountValues(existing.nonNullCountValues),
    deltaNonNullCounts
  );

  await db.patch(AGGREGATE_BUCKET_TABLE, existing._id as any, {
    count: nextCount,
    sumValues: nextSumValues,
    nonNullCountValues: nextNonNullCountValues,
    updatedAt: now,
  });
};

const encodeNumberSortKey = (value: number): string => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  let bits = view.getBigUint64(0);
  if ((bits & FLOAT64_SIGN_BIT) !== 0n) {
    bits = ~bits & FLOAT64_MASK;
  } else {
    bits |= FLOAT64_SIGN_BIT;
  }
  return bits.toString(16).padStart(16, '0');
};

const toComparableSortKey = (value: unknown): string => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw createError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `Aggregate min/max only support finite numbers, strings, and booleans. Received ${String(value)}.`
      );
    }
    return `n:${encodeNumberSortKey(value)}`;
  }
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'boolean') {
    return `b:${value ? '1' : '0'}`;
  }
  throw createError(
    AGGREGATE_ERROR.FILTER_UNSUPPORTED,
    `Aggregate min/max only support finite numbers, strings, and booleans. Received '${typeof value}'.`
  );
};

const compareSortableValues = (left: unknown, right: unknown): number => {
  const leftKey = toComparableSortKey(left);
  const rightKey = toComparableSortKey(right);
  if (leftKey < rightKey) {
    return -1;
  }
  if (leftKey > rightKey) {
    return 1;
  }
  return 0;
};

const applyExtremaDelta = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyHash: string,
  fieldName: string,
  value: unknown,
  deltaCount: number
): Promise<void> => {
  if (deltaCount === 0) {
    return;
  }

  const existing = await getExtremaByValue(
    db,
    tableName,
    indexName,
    keyHash,
    fieldName,
    value
  );
  const now = Date.now();

  if (!existing) {
    if (deltaCount < 0) {
      return;
    }
    await db.insert(AGGREGATE_EXTREMA_TABLE, {
      tableKey: tableName,
      indexName,
      keyHash,
      fieldName,
      valueHash: serializeStable(value),
      value,
      sortKey: toComparableSortKey(value),
      count: deltaCount,
      updatedAt: now,
    });
    return;
  }

  const nextCount = existing.count + deltaCount;
  if (nextCount <= 0) {
    await db.delete(AGGREGATE_EXTREMA_TABLE, existing._id as any);
    return;
  }

  await db.patch(AGGREGATE_EXTREMA_TABLE, existing._id as any, {
    count: nextCount,
    updatedAt: now,
  });
};

const applyExtremaValuesDelta = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  keyHash: string,
  values: Record<string, unknown>,
  delta: number
): Promise<void> => {
  if (delta === 0) {
    return;
  }
  for (const [fieldName, value] of Object.entries(values)) {
    await applyExtremaDelta(
      db,
      tableName,
      indexName,
      keyHash,
      fieldName,
      value,
      delta
    );
  }
};

const buildKeyHashPrefixBounds = (
  prefixParts: unknown[]
): { start: string; end: string } => {
  if (prefixParts.length === 0) {
    return {
      start: '[',
      end: '[\uffff',
    };
  }
  const serialized = serializeCountKeyParts(prefixParts);
  const start = `${serialized.slice(0, -1)},`;
  return {
    start,
    end: `${start}\uffff`,
  };
};

const matchesKeyPrefix = (
  keyParts: unknown[],
  prefixParts: unknown[]
): boolean =>
  prefixParts.every((value, index) => deepEquals(keyParts[index], value));

export const readPlanBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: CountQueryPlan | AggregateQueryPlan
): Promise<CountBucketRow[]> => {
  if (!plan.rangeConstraint) {
    const keyCandidates =
      plan.keyCandidates ??
      buildCandidateKeys(plan.indexFields, plan.fieldValues);
    const matched: CountBucketRow[] = [];

    for (const keyParts of keyCandidates) {
      const bucket = await getBucketByKey(
        db,
        plan.tableName,
        plan.indexName,
        keyParts
      );
      if (!bucket) {
        continue;
      }
      matched.push(bucket);
    }

    return matched;
  }

  const prefixCandidates = buildCandidateKeys(
    plan.rangeConstraint.prefixFields,
    plan.fieldValues
  );
  const rangeFieldIndex = plan.indexFields.indexOf(
    plan.rangeConstraint.fieldName
  );
  if (rangeFieldIndex < 0) {
    return [];
  }

  const postFieldSets = Object.fromEntries(
    Object.entries(plan.postFieldValues).map(([field, values]) => [
      field,
      toConstraintSet(values),
    ])
  ) as Record<string, Map<string, unknown>>;

  const matchedById = new Map<string, CountBucketRow>();
  for (const prefixParts of prefixCandidates) {
    const { start, end } = buildKeyHashPrefixBounds(prefixParts);
    const buckets = await listBucketsByHashPrefix(
      db,
      plan.tableName,
      plan.indexName,
      start,
      end
    );

    for (const bucket of buckets) {
      if (!matchesKeyPrefix(bucket.keyParts, prefixParts)) {
        continue;
      }
      const rangeValue = bucket.keyParts[rangeFieldIndex];
      if (
        !matchesRangeComparisons(rangeValue, plan.rangeConstraint.comparisons)
      ) {
        continue;
      }

      let matchesPostFields = true;
      for (const [field, allowedValues] of Object.entries(postFieldSets)) {
        const fieldIndex = plan.indexFields.indexOf(field);
        if (fieldIndex < 0) {
          matchesPostFields = false;
          break;
        }
        const value = bucket.keyParts[fieldIndex];
        if (!allowedValues.has(serializeStable(value))) {
          matchesPostFields = false;
          break;
        }
      }
      if (!matchesPostFields) {
        continue;
      }

      matchedById.set(String(bucket._id), bucket);
    }
  }

  return [...matchedById.values()];
};

const sortFieldValueRecord = (
  values: Record<string, unknown[]>
): Record<string, unknown[]> =>
  Object.fromEntries(
    Object.keys(values)
      .sort()
      .map((field) => [field, values[field] ?? []])
  );

const getPlanBucketCacheKey = (
  plan: CountQueryPlan | AggregateQueryPlan
): string =>
  serializeStable({
    tableName: plan.tableName,
    indexName: plan.indexName,
    indexFields: plan.indexFields,
    fieldValues: sortFieldValueRecord(plan.fieldValues),
    keyCandidates: plan.keyCandidates ?? null,
    rangeConstraint: plan.rangeConstraint
      ? {
          fieldName: plan.rangeConstraint.fieldName,
          comparisons: [...plan.rangeConstraint.comparisons],
          prefixFields: plan.rangeConstraint.prefixFields,
        }
      : null,
    postFieldValues: sortFieldValueRecord(plan.postFieldValues),
  });

const readPlanBucketsWithCache = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: CountQueryPlan | AggregateQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<CountBucketRow[]> => {
  if (!bucketCache) {
    return await readPlanBuckets(db, plan);
  }

  const cacheKey = getPlanBucketCacheKey(plan);
  const existing = bucketCache.get(cacheKey);
  if (existing) {
    return (await existing) as CountBucketRow[];
  }

  const pending = readPlanBuckets(db, plan) as Promise<unknown[]>;
  bucketCache.set(cacheKey, pending);

  try {
    return (await pending) as CountBucketRow[];
  } catch (error) {
    bucketCache.delete(cacheKey);
    throw error;
  }
};

export const readCountFromBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: CountQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<number> => {
  const buckets = await readPlanBucketsWithCache(db, plan, bucketCache);
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
};

export const readSumFromBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: AggregateQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<number | null> => {
  if (plan.metric.kind !== 'sum') {
    throw new Error('readSumFromBuckets() requires a sum aggregate plan.');
  }

  let total = 0;
  let totalNonNull = 0;

  const buckets = await readPlanBucketsWithCache(db, plan, bucketCache);
  for (const bucket of buckets) {
    const sumValues = normalizeSumValues(bucket.sumValues);
    const countValues = normalizeNonNullCountValues(bucket.nonNullCountValues);
    total += sumValues[plan.metric.field] ?? 0;
    totalNonNull += countValues[plan.metric.field] ?? 0;
  }

  if (totalNonNull === 0) {
    return null;
  }

  return total;
};

export const readCountFieldFromBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: AggregateQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<number> => {
  if (plan.metric.kind !== 'countField') {
    throw new Error(
      'readCountFieldFromBuckets() requires a countField aggregate plan.'
    );
  }

  let total = 0;

  const buckets = await readPlanBucketsWithCache(db, plan, bucketCache);
  for (const bucket of buckets) {
    const countValues = normalizeNonNullCountValues(bucket.nonNullCountValues);
    total += countValues[plan.metric.field] ?? 0;
  }

  return total;
};

export const readAverageFromBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: AggregateQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<number | null> => {
  if (plan.metric.kind !== 'avg') {
    throw new Error('readAverageFromBuckets() requires an avg aggregate plan.');
  }

  let totalSum = 0;
  let totalNonNull = 0;

  const buckets = await readPlanBucketsWithCache(db, plan, bucketCache);
  for (const bucket of buckets) {
    const sumValues = normalizeSumValues(bucket.sumValues);
    const countValues = normalizeNonNullCountValues(bucket.nonNullCountValues);
    totalSum += sumValues[plan.metric.field] ?? 0;
    totalNonNull += countValues[plan.metric.field] ?? 0;
  }

  if (totalNonNull === 0) {
    return null;
  }
  return totalSum / totalNonNull;
};

const readKeyExtrema = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  params: {
    tableName: string;
    indexName: string;
    keyHash: string;
    fieldName: string;
    kind: 'min' | 'max';
  }
): Promise<unknown | null> => {
  let query = (db.query(AGGREGATE_EXTREMA_TABLE) as any).withIndex(
    'by_table_index_hash_field_sort',
    (q: any) =>
      q
        .eq('tableKey', params.tableName)
        .eq('indexName', params.indexName)
        .eq('keyHash', params.keyHash)
        .eq('fieldName', params.fieldName)
  );

  if (params.kind === 'max') {
    query = query.order('desc');
  }

  const rows = (await query.take(1)) as CountExtremaRow[];
  const row = rows[0];
  return row?.value ?? null;
};

export const readExtremaFromBuckets = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  plan: AggregateQueryPlan,
  bucketCache?: PlanBucketReadCache
): Promise<unknown | null> => {
  if (plan.metric.kind !== 'min' && plan.metric.kind !== 'max') {
    throw new Error(
      'readExtremaFromBuckets() requires a min/max aggregate plan.'
    );
  }

  let selected: unknown | null = null;

  const buckets = await readPlanBucketsWithCache(db, plan, bucketCache);
  for (const bucket of buckets) {
    const value = await readKeyExtrema(db, {
      tableName: plan.tableName,
      indexName: plan.indexName,
      keyHash: bucket.keyHash,
      fieldName: plan.metric.field,
      kind: plan.metric.kind,
    });
    if (value === null || value === undefined) {
      continue;
    }
    if (selected === null) {
      selected = value;
      continue;
    }

    const comparison = compareSortableValues(value, selected);
    if (plan.metric.kind === 'min' && comparison < 0) {
      selected = value;
      continue;
    }
    if (plan.metric.kind === 'max' && comparison > 0) {
      selected = value;
    }
  }

  return selected;
};

const getMemberByDoc = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  docId: string
): Promise<CountMemberRow | null> => {
  const rows = (await db
    .query(AGGREGATE_MEMBER_TABLE)
    .withIndex('by_kind_table_index_doc', (q: any) =>
      q
        .eq('kind', AGGREGATE_STATE_KIND_METRIC)
        .eq('tableKey', tableName)
        .eq('indexName', indexName)
        .eq('docId', docId)
    )
    .collect()) as CountMemberRow[];
  return rows[0] ?? null;
};

const isComparableAggregateValue = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return typeof value === 'string' || typeof value === 'boolean';
};

export const computeAggregateMetricValues = (
  doc: Record<string, unknown>,
  definition: AggregateIndexDefinition
): AggregateMetricValues => {
  const sumValues: Record<string, number> = {};
  for (const field of [...definition.sumFields, ...definition.avgFields]) {
    const value = doc[field];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw createError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `aggregateIndex '${definition.name}' sum('${field}') requires finite number values.`
      );
    }
    sumValues[field] = value;
  }

  const nonNullCountValues: Record<string, number> = {};
  for (const field of [
    ...definition.countFields,
    ...definition.sumFields,
    ...definition.avgFields,
  ]) {
    const value = doc[field];
    if (value === null || value === undefined) {
      continue;
    }
    nonNullCountValues[field] = 1;
  }

  const extremaFields = new Set([
    ...definition.minFields,
    ...definition.maxFields,
  ]);
  const extremaValues: Record<string, unknown> = {};
  for (const field of extremaFields) {
    const value = doc[field];
    if (value === null || value === undefined) {
      continue;
    }
    if (!isComparableAggregateValue(value)) {
      throw createError(
        AGGREGATE_ERROR.FILTER_UNSUPPORTED,
        `aggregateIndex '${definition.name}' ${field} must be a finite number, string, or boolean for min/max.`
      );
    }
    extremaValues[field] = value;
  }

  return {
    sumValues,
    extremaValues,
    nonNullCountValues,
  };
};

export const reconcileAggregateMembership = async (
  db: GenericDatabaseWriter<any>,
  params: {
    tableName: string;
    indexName: string;
    docId: string;
    keyParts: unknown[] | null;
    metricValues: AggregateMetricValues | null;
  }
): Promise<void> => {
  const { tableName, indexName, docId, keyParts, metricValues } = params;
  const existing = await getMemberByDoc(db, tableName, indexName, docId);

  if (!keyParts || !metricValues) {
    if (existing) {
      await applyBucketDelta(
        db,
        tableName,
        indexName,
        existing.keyParts,
        -1,
        negateSumValues(normalizeSumValues(existing.sumValues)),
        negateCountValues(
          normalizeNonNullCountValues(existing.nonNullCountValues)
        )
      );
      await applyExtremaValuesDelta(
        db,
        tableName,
        indexName,
        existing.keyHash,
        normalizeExtremaValues(existing.extremaValues),
        -1
      );
      await db.delete(AGGREGATE_MEMBER_TABLE, existing._id as any);
    }
    return;
  }

  const normalizedKeyParts = keyParts.map((part) => normalizeUndefined(part));
  const keyHash = serializeCountKeyParts(normalizedKeyParts);
  const now = Date.now();

  const normalizedNextSumValues = normalizeSumValues(metricValues.sumValues);
  const normalizedNextNonNullCountValues = normalizeNonNullCountValues(
    metricValues.nonNullCountValues
  );
  const normalizedNextExtremaValues = normalizeExtremaValues(
    metricValues.extremaValues
  );

  if (
    existing &&
    existing.keyHash === keyHash &&
    deepEquals(existing.keyParts, normalizedKeyParts) &&
    deepEquals(
      normalizeSumValues(existing.sumValues),
      normalizedNextSumValues
    ) &&
    deepEquals(
      normalizeNonNullCountValues(existing.nonNullCountValues),
      normalizedNextNonNullCountValues
    ) &&
    deepEquals(
      normalizeExtremaValues(existing.extremaValues),
      normalizedNextExtremaValues
    )
  ) {
    await db.patch(AGGREGATE_MEMBER_TABLE, existing._id as any, {
      updatedAt: now,
    });
    return;
  }

  if (existing) {
    await applyBucketDelta(
      db,
      tableName,
      indexName,
      existing.keyParts,
      -1,
      negateSumValues(normalizeSumValues(existing.sumValues)),
      negateCountValues(
        normalizeNonNullCountValues(existing.nonNullCountValues)
      )
    );
    await applyExtremaValuesDelta(
      db,
      tableName,
      indexName,
      existing.keyHash,
      normalizeExtremaValues(existing.extremaValues),
      -1
    );
  }

  await applyBucketDelta(
    db,
    tableName,
    indexName,
    normalizedKeyParts,
    1,
    normalizedNextSumValues,
    normalizedNextNonNullCountValues
  );
  await applyExtremaValuesDelta(
    db,
    tableName,
    indexName,
    keyHash,
    normalizedNextExtremaValues,
    1
  );

  if (existing) {
    await db.patch(AGGREGATE_MEMBER_TABLE, existing._id as any, {
      kind: AGGREGATE_STATE_KIND_METRIC,
      keyHash,
      keyParts: normalizedKeyParts,
      sumValues: normalizedNextSumValues,
      nonNullCountValues: normalizedNextNonNullCountValues,
      extremaValues: normalizedNextExtremaValues,
      updatedAt: now,
    });
    return;
  }

  await db.insert(AGGREGATE_MEMBER_TABLE, {
    kind: AGGREGATE_STATE_KIND_METRIC,
    tableKey: tableName,
    indexName,
    docId,
    keyHash,
    keyParts: normalizedKeyParts,
    sumValues: normalizedNextSumValues,
    nonNullCountValues: normalizedNextNonNullCountValues,
    extremaValues: normalizedNextExtremaValues,
    updatedAt: now,
  });
};

export const computeCountKeyParts = (
  doc: Record<string, unknown>,
  fields: string[]
): unknown[] => fields.map((field) => normalizeUndefined(doc[field]));

export const applyAggregateIndexesForChange = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  aggregateIndexes: AggregateIndexDefinition[],
  change:
    | {
        operation: 'insert';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'update';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'delete';
        id: GenericId<any> | string;
      }
): Promise<void> => {
  const docId = String(change.id);
  for (const aggregateIndex of aggregateIndexes) {
    const keyParts =
      change.operation === 'delete'
        ? null
        : computeCountKeyParts(change.newDoc, aggregateIndex.fields);
    const metricValues =
      change.operation === 'delete'
        ? null
        : computeAggregateMetricValues(change.newDoc, aggregateIndex);

    await reconcileAggregateMembership(db, {
      tableName,
      indexName: aggregateIndex.name,
      docId,
      keyParts,
      metricValues,
    });
  }
};

export const applyCountIndexesForChange = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  countIndexes: CountIndexDefinition[],
  change:
    | {
        operation: 'insert';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'update';
        id: GenericId<any> | string;
        newDoc: Record<string, unknown>;
      }
    | {
        operation: 'delete';
        id: GenericId<any> | string;
      }
): Promise<void> => {
  await applyAggregateIndexesForChange(
    db,
    tableName,
    countIndexes.map((entry) => ({
      name: entry.name,
      fields: entry.fields,
      countFields: [],
      sumFields: [],
      avgFields: [],
      minFields: [],
      maxFields: [],
    })),
    change
  );
};

export const getCountState = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  kind: string = AGGREGATE_STATE_KIND_METRIC
): Promise<CountState | null> => {
  const states = (await db
    .query(AGGREGATE_STATE_TABLE)
    .withIndex('by_kind_table_index', (q: any) =>
      q.eq('kind', kind).eq('tableKey', tableName).eq('indexName', indexName)
    )
    .collect()) as CountStateRow[];
  const state = states[0];
  if (!state) {
    return null;
  }
  const { tableKey, ...rest } = state;
  return {
    ...rest,
    tableName: tableKey,
  };
};

export const setCountState = async (
  db: GenericDatabaseWriter<any>,
  nextState: Omit<CountState, '_id'>,
  kind: string = AGGREGATE_STATE_KIND_METRIC
): Promise<void> => {
  const existing = await getCountState(
    db,
    nextState.tableName,
    nextState.indexName,
    kind
  );
  const payload = {
    kind,
    tableKey: nextState.tableName,
    indexName: nextState.indexName,
    keyDefinitionHash: nextState.keyDefinitionHash,
    metricDefinitionHash: nextState.metricDefinitionHash,
    status: nextState.status,
    cursor: nextState.cursor ?? null,
    processed: nextState.processed,
    startedAt: nextState.startedAt,
    updatedAt: nextState.updatedAt,
    completedAt: nextState.completedAt ?? null,
    lastError: nextState.lastError ?? null,
  };
  if (!existing) {
    await db.insert(AGGREGATE_STATE_TABLE, payload as any);
    return;
  }
  await db.patch(AGGREGATE_STATE_TABLE, existing._id as any, payload as any);
};

export const setCountStateError = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  error: unknown,
  kind: string = AGGREGATE_STATE_KIND_METRIC
): Promise<void> => {
  const now = Date.now();
  const existing = await getCountState(db, tableName, indexName, kind);
  const message = error instanceof Error ? error.message : String(error);

  if (!existing) {
    throw new Error(
      `Missing count state for '${tableName}.${indexName}' while recording backfill error.`
    );
  }

  await db.patch(AGGREGATE_STATE_TABLE, existing._id as any, {
    status: COUNT_STATUS_BUILDING,
    updatedAt: now,
    keyDefinitionHash: existing.keyDefinitionHash,
    metricDefinitionHash: existing.metricDefinitionHash,
    lastError: message,
  });
};

export const clearCountIndexData = async (
  db: GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<void> => {
  const members = await listMembersForIndex(db, tableName, indexName);
  for (const member of members) {
    await db.delete(AGGREGATE_MEMBER_TABLE, member._id as any);
  }
  const buckets = await listBucketsForIndex(db, tableName, indexName);
  for (const bucket of buckets) {
    await db.delete(AGGREGATE_BUCKET_TABLE, bucket._id as any);
  }
  const extrema = await listExtremaForIndex(db, tableName, indexName);
  for (const entry of extrema) {
    await db.delete(AGGREGATE_EXTREMA_TABLE, entry._id as any);
  }
};

export const listCountStates = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>
): Promise<CountState[]> => {
  const rows = (await db
    .query(AGGREGATE_STATE_TABLE)
    .collect()) as CountStateRow[];
  return rows
    .filter((row) => row.kind === AGGREGATE_STATE_KIND_METRIC)
    .map((row) => {
      const { tableKey, ...rest } = row;
      return {
        ...rest,
        tableName: tableKey,
      };
    });
};

export const createCountError = (
  code: CountErrorCode,
  message: string
): Error => createError(code, message);

export const createAggregateError = (
  code: AggregateErrorCode,
  message: string
): Error => createError(code, message);

const assertAggregateAllowedForRls = (
  tableConfig: TableRelationalConfig,
  rlsMode: 'skip' | 'default' | undefined,
  code: string,
  methodName: string
): void => {
  const enabled =
    typeof (tableConfig.table as any).isRlsEnabled === 'function'
      ? (tableConfig.table as any).isRlsEnabled()
      : false;

  if (enabled && rlsMode !== 'skip') {
    throw createError(
      code,
      `${methodName} is not available for table '${tableConfig.name}' in RLS-restricted contexts in v1.`
    );
  }
};

export const ensureCountAllowedForRls = (
  tableConfig: TableRelationalConfig,
  rlsMode: 'skip' | 'default' | undefined
): void => {
  assertAggregateAllowedForRls(
    tableConfig,
    rlsMode,
    COUNT_ERROR.RLS_UNSUPPORTED,
    'count()'
  );
};

export const ensureAggregateAllowedForRls = (
  tableConfig: TableRelationalConfig,
  rlsMode: 'skip' | 'default' | undefined,
  methodName: string
): void => {
  assertAggregateAllowedForRls(
    tableConfig,
    rlsMode,
    AGGREGATE_ERROR.RLS_UNSUPPORTED,
    methodName
  );
};

const ensureIndexReady = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string,
  code: string,
  indexLabel: 'aggregateIndex'
): Promise<void> => {
  const state = await getCountState(db, tableName, indexName);
  if (!state || state.status !== COUNT_STATUS_READY) {
    throw createError(
      code,
      `${indexLabel} '${tableName}.${indexName}' is BUILDING. Run aggregateBackfill until READY.`
    );
  }
};

export const ensureCountIndexReady = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<void> =>
  ensureIndexReady(
    db,
    tableName,
    indexName,
    COUNT_ERROR.INDEX_BUILDING,
    'aggregateIndex'
  );

export const ensureAggregateIndexReady = async (
  db: GenericDatabaseReader<any> | GenericDatabaseWriter<any>,
  tableName: string,
  indexName: string
): Promise<void> =>
  ensureIndexReady(
    db,
    tableName,
    indexName,
    AGGREGATE_ERROR.INDEX_BUILDING,
    'aggregateIndex'
  );

export const listSchemaAggregateIndexes = (
  schema: TablesRelationalConfig
): Array<{
  tableName: string;
  indexName: string;
  fields: string[];
  countFields: string[];
  sumFields: string[];
  avgFields: string[];
  minFields: string[];
  maxFields: string[];
}> => {
  const entries: Array<{
    tableName: string;
    indexName: string;
    fields: string[];
    countFields: string[];
    sumFields: string[];
    avgFields: string[];
    minFields: string[];
    maxFields: string[];
  }> = [];

  for (const tableConfig of Object.values(schema)) {
    const aggregateIndexes = getAggregateIndexDefinitions(tableConfig);
    for (const aggregateIndex of aggregateIndexes) {
      entries.push({
        tableName: tableConfig.name,
        indexName: aggregateIndex.name,
        fields: aggregateIndex.fields,
        countFields: aggregateIndex.countFields,
        sumFields: aggregateIndex.sumFields,
        avgFields: aggregateIndex.avgFields,
        minFields: aggregateIndex.minFields,
        maxFields: aggregateIndex.maxFields,
      });
    }
  }

  return entries;
};

export const listSchemaCountIndexes = (
  schema: TablesRelationalConfig
): Array<{ tableName: string; indexName: string; fields: string[] }> =>
  listSchemaAggregateIndexes(schema).map((entry) => ({
    tableName: entry.tableName,
    indexName: entry.indexName,
    fields: entry.fields,
  }));

export const parseCountWhere = (
  tableConfig: TableRelationalConfig,
  where: unknown
): CountQueryPlan => compileCountQueryPlan(tableConfig, where);

export const parseAggregateWhere = (
  tableConfig: TableRelationalConfig,
  where: unknown,
  metric: AggregateMetricRequest
): AggregateQueryPlan => compileAggregateQueryPlan(tableConfig, where, metric);

export const isIndexCountZero = (plan: CountQueryPlan): boolean =>
  (Array.isArray(plan.keyCandidates) && plan.keyCandidates.length === 0) ||
  [
    ...Object.values(plan.fieldValues),
    ...Object.values(plan.postFieldValues),
  ].some((values) => values.length === 0);

export const isAggregatePlanZero = (plan: AggregateQueryPlan): boolean =>
  (Array.isArray(plan.keyCandidates) && plan.keyCandidates.length === 0) ||
  [
    ...Object.values(plan.fieldValues),
    ...Object.values(plan.postFieldValues),
  ].some((values) => values.length === 0);

export const getCountIndexValuesForFields = (
  fields: string[],
  values: Record<string, unknown[]>
): Record<string, unknown[]> =>
  Object.fromEntries(fields.map((field) => [field, values[field] ?? []]));

export const asUnknownArray = (value: Value): unknown[] => value as unknown[];
