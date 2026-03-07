/**
 * Custom Column Builder
 *
 * Wraps an arbitrary Convex validator so you can use object/array validators
 * as ORM columns with full TypeScript inference.
 *
 * @example
 * custom(v.object({ key: v.string() })).notNull()
 */

import type { Validator, Value } from 'convex/values';
import { v } from 'convex/values';
import { vRequired } from '../../internal/upstream/validators';
import type { ColumnBuilder } from './column-builder';
import {
  type ColumnBuilderBaseConfig,
  ConvexColumnBuilder,
  entityKind,
} from './convex-column-builder';

type AnyValidator = Validator<any, any, any>;
type AnyColumnBuilder = ColumnBuilder<any, any, any>;
interface NestedShapeInput {
  [key: string]: NestedInput;
}
type NestedInput = AnyValidator | AnyColumnBuilder | NestedShapeInput;

type InferBuilderNestedValue<TBuilder extends AnyColumnBuilder> =
  TBuilder['_'] extends {
    $type: infer TType;
  }
    ? TType
    : TBuilder['_'] extends { data: infer TData }
      ? TBuilder['_'] extends { notNull: true }
        ? TData
        : TData | null
      : never;

type InferValidatorNestedValue<TValidator extends AnyValidator> = Exclude<
  TValidator['type'],
  undefined
>;

type InferNestedValue<TInput extends NestedInput> =
  TInput extends AnyColumnBuilder
    ? InferBuilderNestedValue<TInput>
    : TInput extends AnyValidator
      ? InferValidatorNestedValue<TInput>
      : TInput extends NestedShapeInput
        ? InferObjectShape<TInput>
        : never;

type InferObjectShape<TShape extends NestedShapeInput> = {
  [K in keyof TShape]: InferNestedValue<TShape[K]>;
};

type InferObjectValue<TInput extends NestedInput> = TInput extends
  | AnyColumnBuilder
  | AnyValidator
  ? Record<string, InferNestedValue<TInput>>
  : TInput extends NestedShapeInput
    ? InferObjectShape<TInput>
    : never;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidator(value: unknown): value is AnyValidator {
  return (
    isRecord(value) &&
    typeof value.kind === 'string' &&
    typeof value.isOptional === 'string'
  );
}

function isColumnBuilder(value: unknown): value is AnyColumnBuilder {
  return isRecord(value) && (value as any)[entityKind] === 'ColumnBuilder';
}

function toRequiredValidator(validator: AnyValidator): AnyValidator {
  return validator.isOptional === 'optional'
    ? (vRequired(validator as any) as AnyValidator)
    : validator;
}

function toRequiredBuilderValidator(validator: AnyValidator): AnyValidator {
  const requiredValidator = toRequiredValidator(validator);

  if (requiredValidator.kind !== 'union') {
    return requiredValidator;
  }

  const nonNullMembers = requiredValidator.members.filter(
    (member) => member.kind !== 'null'
  );

  if (nonNullMembers.length !== 1) {
    return requiredValidator;
  }

  const [member] = nonNullMembers;
  if (member.kind === 'object' || member.kind === 'array') {
    return member as AnyValidator;
  }

  return requiredValidator;
}

function formatInvalidInput(path: string, value: unknown): string {
  const valueType = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value;
  return `${path} expected a column builder, Convex validator, or nested object shape. Got ${valueType}.`;
}

function objectShapeToValidator(
  shape: NestedShapeInput,
  path: string
): AnyValidator {
  const fields: Record<string, AnyValidator> = {};
  for (const [key, value] of Object.entries(shape)) {
    fields[key] = nestedInputToValidator(
      value as NestedInput,
      `${path}.${key}`
    );
  }
  return v.object(fields);
}

function nestedInputToValidator(
  input: NestedInput,
  path: string
): AnyValidator {
  if (isColumnBuilder(input)) {
    return toRequiredBuilderValidator(
      (input as any).convexValidator as AnyValidator
    );
  }

  if (isValidator(input)) {
    return toRequiredValidator(input);
  }

  if (isRecord(input)) {
    return objectShapeToValidator(input as NestedShapeInput, path);
  }

  throw new Error(formatInvalidInput(path, input));
}

export type ConvexCustomBuilderInitial<
  TName extends string,
  TValidator extends AnyValidator,
> = ConvexCustomBuilder<
  {
    name: TName;
    dataType: 'any';
    columnType: 'ConvexCustom';
    data: TValidator['type'];
    driverParam: TValidator['type'];
    enumValues: undefined;
  },
  TValidator
>;

export class ConvexCustomBuilder<
  T extends ColumnBuilderBaseConfig<'any', 'ConvexCustom'>,
  TValidator extends AnyValidator,
> extends ConvexColumnBuilder<T, { validator: TValidator }> {
  static override readonly [entityKind]: string = 'ConvexCustomBuilder';

  constructor(name: T['name'], validator: TValidator) {
    super(name, 'any', 'ConvexCustom');
    this.config.validator = validator;
  }

  get convexValidator(): Validator<any, any, any> {
    const validator = this.config.validator;
    if (this.config.notNull) {
      return validator;
    }
    return v.optional(v.union(v.null(), validator));
  }

  override build(): Validator<any, any, any> {
    return this.convexValidator;
  }
}

export function custom<TValidator extends AnyValidator>(
  validator: TValidator
): ConvexCustomBuilderInitial<'', TValidator>;
export function custom<TName extends string, TValidator extends AnyValidator>(
  name: TName,
  validator: TValidator
): ConvexCustomBuilderInitial<TName, TValidator>;
export function custom(a: string | AnyValidator, b?: AnyValidator) {
  if (b !== undefined) {
    return new ConvexCustomBuilder(a as string, b);
  }
  return new ConvexCustomBuilder('', a as AnyValidator);
}

/**
 * Creates an array column from a nested validator or builder.
 *
 * Values in nested arrays are always compiled as required validators.
 */
export function arrayOf<TElement extends NestedInput>(element: TElement) {
  const validator = v.array(
    nestedInputToValidator(element, 'arrayOf(element)')
  );
  return custom(validator).$type<InferNestedValue<TElement>[]>();
}

/**
 * Creates a union column from validators/builders without dropping to `v.union(...)`.
 */
export function unionOf<
  const TMembers extends readonly [NestedInput, NestedInput, ...NestedInput[]],
>(...members: TMembers) {
  const validators = members.map((member, index) =>
    nestedInputToValidator(member, `unionOf(members[${index}])`)
  );
  return custom(
    v.union(...(validators as [AnyValidator, AnyValidator, ...AnyValidator[]]))
  ).$type<InferNestedValue<TMembers[number]>>();
}

/**
 * Creates an object column from either:
 * - a nested shape of validators/builders, or
 * - a validator/builder describing homogeneous record values
 *
 * Fields in nested objects are always compiled as required validators.
 */
export function objectOf<TInput extends NestedInput>(input: TInput) {
  if (isColumnBuilder(input) || isValidator(input)) {
    return custom(
      v.record(v.string(), nestedInputToValidator(input, 'objectOf(value)'))
    ).$type<InferObjectValue<TInput>>();
  }

  if (!isRecord(input)) {
    throw new Error(formatInvalidInput('objectOf(shape)', input));
  }

  const validator = objectShapeToValidator(
    input as NestedShapeInput,
    'objectOf(shape)'
  );
  return custom(validator).$type<InferObjectValue<TInput>>();
}

/**
 * Convenience wrapper for Convex "JSON" values.
 *
 * Note: This is Convex JSON (runtime `v.any()`), not SQL JSON/JSONB.
 */
export function json<T = Value>() {
  return custom(v.any()).$type<T>();
}
