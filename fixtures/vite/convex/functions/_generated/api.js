/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx concave codegen`.
 * @module
 */

const functionName = Symbol.for("functionName");
const toReferencePath = Symbol.for("toReferencePath");

function makeFunctionReference(name) {
  return {
    [functionName]: name,
    [Symbol.toStringTag]: "FunctionReference",
  };
}

function makeComponentReference(referencePath) {
  return {
    [toReferencePath]: referencePath,
    [Symbol.toStringTag]: "FunctionReference",
  };
}

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api = {

};

export const internal = {

};

export const components = {};
