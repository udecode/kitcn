/* eslint-disable */
/**
 * Generated `api` utility with precise source types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `better-convex codegen`.
 * @module
 */

import type * as generated_auth from "../generated/auth.js";
import type * as messages from "../messages.js";

import type {
  AnyComponents,
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  "generated/auth": typeof generated_auth,
  "messages": typeof messages,
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: AnyComponents;
