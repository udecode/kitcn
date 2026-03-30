/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx concave codegen`.
 * @module
 */

import type * as functions from "../functions.js";
import type * as generated_auth from "../generated/auth.js";
import type * as generated_server from "../generated/server.js";
import type * as shared_api from "../shared/api.js";
import type * as types from "../types.js";

import type {
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
  "functions": typeof functions;
  "generated/auth": typeof generated_auth;
  "generated/server": typeof generated_server;
  "shared/api": typeof shared_api;
  "types": typeof types;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
