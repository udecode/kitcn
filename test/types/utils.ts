// Type testing utilities from Drizzle pattern
export function Expect<T extends true>() {}

export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

// Enhanced utilities for edge case testing
export type Not<T extends boolean> = T extends true ? false : true;
export type IsAny<T> = 0 extends 1 & T ? true : false;
export type IsNever<T> = [T] extends [never] ? true : false;
