import {
  HttpRouter,
  httpActionGeneric,
  type RoutableMethod,
} from 'convex/server';
import type { Hono } from 'hono';
import type { CRPCHonoHandler, HttpProcedure } from './http-types';

// =============================================================================
// Router Types (tRPC-style)
// =============================================================================

/**
 * Recursive router record - can contain procedures or nested routers
 */
export interface HttpRouterRecord {
  [key: string]: HttpProcedure | HttpRouterRecord | CRPCHttpRouter<any>;
}

/**
 * Router definition - stores both flat procedures and hierarchical record
 */
export interface HttpRouterDef<TRecord extends HttpRouterRecord> {
  router: true;
  /** Flat map with dot-notation keys (e.g., "todos.get") for lookup */
  procedures: Record<string, HttpProcedure>;
  /** Hierarchical structure for type inference */
  record: TRecord;
}

/**
 * HTTP Router - like tRPC's BuiltRouter
 */
export interface CRPCHttpRouter<TRecord extends HttpRouterRecord> {
  _def: HttpRouterDef<TRecord>;
}

/**
 * Check if an export is a cRPC HTTP procedure
 * Note: Procedures are functions with attached properties, not plain objects
 */
function isCRPCHttpProcedure(value: unknown): value is HttpProcedure {
  return (
    typeof value === 'function' &&
    'isHttp' in value &&
    (value as any).isHttp === true &&
    '_crpcHttpRoute' in value
  );
}

/**
 * Check if a value is a cRPC HTTP router
 */
function isCRPCHttpRouter(value: unknown): value is CRPCHttpRouter<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_def' in value &&
    (value as any)._def?.router === true
  );
}

// =============================================================================
// Hono-based HTTP Router (extends Convex HttpRouter)
// =============================================================================

/**
 * HTTP Router that wraps a Hono app for use with Convex.
 * Internal class - use `createHttpRouter()` factory instead.
 */
export class HttpRouterWithHono extends HttpRouter {
  private _app: Hono;
  private _handler: ReturnType<typeof httpActionGeneric>;

  constructor(app: Hono) {
    super();
    this._app = app;
    // Create a single httpAction that delegates all requests to Hono
    this._handler = httpActionGeneric(async (ctx, request) => {
      // Pass Convex ctx as Hono's env, accessible via c.env in handlers
      return await app.fetch(request, ctx);
    });

    // Save reference to parent methods before overriding
    const parentGetRoutes = this.getRoutes.bind(this);
    const parentLookup = this.lookup.bind(this);

    /**
     * Get routes from the Hono app for Convex dashboard display.
     * Returns route definitions in the format expected by Convex.
     */
    this.getRoutes = (): [
      string,
      RoutableMethod,
      ReturnType<typeof httpActionGeneric>,
    ][] => {
      // Get parent routes first (traditional http.route() calls)
      const parentRoutes = parentGetRoutes();

      // Extract routes from Hono app
      const honoRoutes: [
        string,
        RoutableMethod,
        ReturnType<typeof httpActionGeneric>,
      ][] = [];

      for (const route of this._app.routes) {
        // Hono stores methods in uppercase
        const method = route.method.toUpperCase() as RoutableMethod;
        // Skip internal Hono methods like ALL
        if (
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(
            method
          )
        ) {
          honoRoutes.push([route.path, method, this._handler]);
        }
      }

      return [
        ...parentRoutes.map(
          (r) =>
            [...r] as [
              string,
              RoutableMethod,
              ReturnType<typeof httpActionGeneric>,
            ]
        ),
        ...honoRoutes,
      ];
    };

    /**
     * Look up the handler for a given path and method.
     * Checks traditional routes first, then delegates to Hono's router.
     */
    this.lookup = (
      path: string,
      method: RoutableMethod | 'HEAD'
    ):
      | readonly [ReturnType<typeof httpActionGeneric>, RoutableMethod, string]
      | null => {
      // Check parent routes first (traditional http.route() calls)
      const parentMatch = parentLookup(path, method);
      if (parentMatch !== null) {
        return parentMatch;
      }

      // Normalize method
      const normalizedMethod = method === 'HEAD' ? 'GET' : method;

      // Try to match using Hono's router
      const matchResult = this._app.router.match(normalizedMethod, path);

      if (matchResult && matchResult[0].length > 0) {
        return [this._handler, normalizedMethod, path] as const;
      }

      return null;
    };
  }
}

// =============================================================================
// Router Factory (tRPC-style c.router)
// =============================================================================

/**
 * Create a router factory function (like tRPC's createRouterFactory)
 *
 * @example
 * ```ts
 * // In crpc.ts
 * export const router = c.router;
 *
 * // In api/todos.ts
 * export const todosRouter = router({
 *   get: publicRoute.get('/api/todos/:id')...,
 *   create: authRoute.post('/api/todos')...,
 * });
 *
 * // In http.ts
 * export const httpRouter = router({
 *   todos: todosRouter,
 *   health,
 * });
 * export type AppRouter = typeof httpRouter;
 * ```
 */
export function createHttpRouterFactory() {
  return function router<TRecord extends HttpRouterRecord>(
    record: TRecord
  ): CRPCHttpRouter<TRecord> {
    const procedures: Record<string, HttpProcedure> = {};

    /**
     * Recursively flatten procedures with dot-notation paths
     * Like tRPC's step() function in router.ts
     */
    function step(obj: HttpRouterRecord, path: string[] = []) {
      for (const [key, value] of Object.entries(obj)) {
        const newPath = [...path, key];
        const pathKey = newPath.join('.');

        if (isCRPCHttpProcedure(value)) {
          // Store procedure with flattened path
          procedures[pathKey] = value;
        } else if (isCRPCHttpRouter(value)) {
          // Nested router - flatten its procedures
          for (const [procPath, proc] of Object.entries(
            value._def.procedures
          )) {
            procedures[`${pathKey}.${procPath}`] = proc;
          }
        } else if (typeof value === 'object' && value !== null) {
          // Plain object - recurse
          step(value as HttpRouterRecord, newPath);
        }
      }
    }

    step(record);

    return {
      _def: {
        router: true,
        procedures,
        record,
      },
    };
  };
}

/**
 * Create an HTTP router with cRPC routes registered.
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { cors } from 'hono/cors';
 * import { createHttpRouter } from 'better-convex/server';
 *
 * const app = new Hono();
 * app.use('/api/*', cors({ origin: process.env.SITE_URL, credentials: true }));
 *
 * export default createHttpRouter(app, httpRouter);
 * ```
 */
export function createHttpRouter<TRecord extends HttpRouterRecord>(
  app: Hono,
  router: CRPCHttpRouter<TRecord>
): HttpRouterWithHono {
  // Register cRPC routes to Hono
  for (const procedure of Object.values(router._def.procedures)) {
    const { path, method } = procedure._crpcHttpRoute;
    const honoHandler = (procedure as any)._honoHandler as
      | CRPCHonoHandler
      | undefined;

    if (!honoHandler) {
      console.warn(
        `Procedure at ${path} does not have a Hono handler. ` +
          'Make sure you are using the latest version of better-convex.'
      );
      continue;
    }

    switch (method) {
      case 'GET':
        app.get(path, honoHandler);
        break;
      case 'POST':
        app.post(path, honoHandler);
        break;
      case 'PUT':
        app.put(path, honoHandler);
        break;
      case 'PATCH':
        app.patch(path, honoHandler);
        break;
      case 'DELETE':
        app.delete(path, honoHandler);
        break;
    }
  }

  return new HttpRouterWithHono(app);
}

/**
 * Extract route map from procedures for client runtime
 *
 * @example
 * ```ts
 * export const httpRoutes = extractRouteMap(httpRouter._def.procedures);
 * ```
 */
export function extractRouteMap<T extends Record<string, HttpProcedure>>(
  procedures: T
): { [K in keyof T]: { path: string; method: string } } {
  const result: Record<string, { path: string; method: string }> = {};

  for (const [name, proc] of Object.entries(procedures)) {
    if (isCRPCHttpProcedure(proc)) {
      result[name] = {
        path: proc._crpcHttpRoute.path,
        method: proc._crpcHttpRoute.method,
      };
    }
  }

  return result as { [K in keyof T]: { path: string; method: string } };
}
