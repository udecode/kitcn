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
      ? TData
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

function stripNullUnionMember(validator: AnyValidator): AnyValidator {
  if (validator.kind !== 'union') {
    return validator;
  }

  const members = validator.members.filter((member) => member.kind !== 'null');
  if (members.length === validator.members.length || members.length === 0) {
    return validator;
  }
  if (members.length === 1) {
    return members[0] as AnyValidator;
  }
  return v.union(...members);
}

function toRequiredNonNullBuilderValidator(
  validator: AnyValidator
): AnyValidator {
  return stripNullUnionMember(toRequiredValidator(validator));
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
    return toRequiredNonNullBuilderValidator(
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
 * Creates an object column from a nested shape of validators/builders.
 *
 * Fields in nested objects are always compiled as required validators.
 */
export function objectOf<TShape extends NestedShapeInput>(shape: TShape) {
  if (!isRecord(shape)) {
    throw new Error(formatInvalidInput('objectOf(shape)', shape));
  }

  const validator = objectShapeToValidator(shape, 'objectOf(shape)');
  return custom(validator).$type<InferObjectShape<TShape>>();
}

/**
 * Convenience wrapper for Convex "JSON" values.
 *
 * Note: This is Convex JSON (runtime `v.any()`), not SQL JSON/JSONB.
 */
export function json<T = Value>() {
  return custom(v.any()).$type<T>();
}
