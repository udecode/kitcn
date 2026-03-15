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

function createApi(pathParts = []) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "string") {
          return createApi([...pathParts, prop]);
        }
        if (prop === functionName) {
          if (pathParts.length < 2) {
            const found = ["api", ...pathParts].join(".");
            throw new Error(
              "API path is expected to be of the form `api.moduleName.functionName`. Found: `" + found + "`",
            );
          }
          const modulePath = pathParts.slice(0, -1).join("/");
          const exportName = pathParts[pathParts.length - 1];
          return exportName === "default" ? modulePath : modulePath + ":" + exportName;
        }
        if (prop === Symbol.toStringTag) {
          return "FunctionReference";
        }
        return undefined;
      },
    },
  );
}

function createComponents(pathParts = []) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop === "string") {
          return createComponents([...pathParts, prop]);
        }
        if (prop === toReferencePath) {
          if (pathParts.length < 1) {
            const found = ["components", ...pathParts].join(".");
            throw new Error(
              "API path is expected to be of the form `components.childComponent.functionName`. Found: `" + found + "`",
            );
          }
          return "_reference/childComponent/" + pathParts.join("/");
        }
        return undefined;
      },
    },
  );
}

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api = createApi();
export const internal = createApi();
export const components = createComponents();
