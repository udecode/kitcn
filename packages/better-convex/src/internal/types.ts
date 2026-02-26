/**
 * Useful utility types for Convex + TanStack Query integration.
 * Inspired by tRPC's internal types.
 */

/** @public */
export type Maybe<TType> = TType | null | undefined;

/**
 * Check if two types are exactly equal.
 * Pattern from Drizzle ORM and type-challenges.
 * Uses conditional type distribution to detect exact equality.
 *
 * @example
 * Equal<string, string> // true
 * Equal<string, number> // false
 * Equal<string, string | number> // false (string extends string | number but not equal)
 * @public
 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

/**
 * Filter object type to only known keys from reference type.
 * Pattern from Drizzle ORM: drizzle-orm/src/utils.ts:151-156
 *
 * Prevents extra properties from widening inferred types.
 *
 * @example
 * type Config = { name: string; age: number };
 * type Input = { name: string; age: number; extra: boolean };
 * type Filtered = KnownKeysOnly<Input, Config>; // { name: string; age: number }
 * @public
 */
export type KnownKeysOnly<T, K> = {
  [P in keyof T]: P extends keyof K ? T[P] : never;
};

/**
 * Deep variant of KnownKeysOnly.
 * Unknown nested keys are mapped to never to preserve strictness
 * even through generic inference.
 */
export type KnownKeysOnlyDeep<T, K> = T extends (...args: any[]) => any
  ? T
  : T extends readonly (infer TItem)[]
    ? K extends readonly (infer KItem)[]
      ? readonly KnownKeysOnlyDeep<TItem, KItem>[]
      : never
    : T extends object
      ? K extends object
        ? {
            [P in keyof T]: P extends keyof K
              ? KnownKeysOnlyDeep<T[P], K[P]>
              : never;
          }
        : never
      : T;

/**
 * Deep exact type check.
 * Rejects unknown nested keys by mapping them to never.
 */
export type Exact<TExpected, TActual> = TActual extends TExpected
  ? TExpected extends (...args: any[]) => any
    ? TActual
    : TExpected extends readonly (infer TExpectedItem)[]
      ? TActual extends readonly (infer TActualItem)[]
        ? readonly Exact<TExpectedItem, TActualItem>[]
        : never
      : TExpected extends object
        ? TActual extends object
          ? {
              [K in keyof TActual]: K extends keyof TExpected
                ? Exact<TExpected[K], TActual[K]>
                : never;
            } & {
              [K in Exclude<keyof TExpected, keyof TActual>]?: never;
            }
          : never
        : TActual
  : never;

/**
 * Narrow a type to an expected shape without losing inference.
 * Pattern from Drizzle ORM: drizzle-orm/src/utils.ts
 * @public
 */
export type Assume<T, U> = T extends U ? T : U;

/**
 * Extract return type if function, otherwise use the value type.
 * Pattern from Drizzle ORM: drizzle-orm/src/relations.ts
 * @public
 */
export type ReturnTypeOrValue<T> = T extends (...args: any[]) => infer R
  ? R
  : T;

/**
 * Simplify complex type intersections for better IDE display.
 * Pattern from Drizzle ORM: The & {} intersection "seals" the type to prevent
 * distributive conditional behavior that can cause union widening.
 * @see https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/utils.ts#L144-L149
 */
export type Simplify<TType> = TType extends any[] | Date
  ? TType
  : { [K in keyof TType]: TType[K] } & {};

/** @public */
export type MaybePromise<TType> = Promise<TType> | TType;

/**
 * Omit keys without removing a potential union.
 * Unlike standard Omit, this preserves union types.
 */
export type DistributiveOmit<TObj, TKey extends keyof any> = TObj extends any
  ? Omit<TObj, TKey>
  : never;

/** Makes the object recursively optional */
export type DeepPartial<TObject> = TObject extends object
  ? { [P in keyof TObject]?: DeepPartial<TObject[P]> }
  : TObject;

/** Unwrap return type if function, else use type as is */
export type Unwrap<TType> = TType extends (...args: any[]) => infer R
  ? Awaited<R>
  : TType;
