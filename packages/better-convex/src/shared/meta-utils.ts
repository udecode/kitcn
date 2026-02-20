/**
 * Shared utilities for meta lookup and file filtering.
 * Used by codegen and runtime proxies.
 */

import type { FunctionReference } from 'convex/server';

/** Metadata for a single function */
export type FnMeta = {
  type?: 'query' | 'mutation' | 'action';
  auth?: 'required' | 'optional';
  [key: string]: unknown;
};

/** Metadata for all functions in a module */
export type ModuleMeta = Record<string, FnMeta>;

/** Metadata for all modules - from generated `@convex/api` */
export type Meta = Record<string, ModuleMeta> & {
  _http?: Record<string, { path: string; method: string }>;
};

const metaCache = new WeakMap<object, Meta>();
const nonMetaLeafKeys = new Set(['functionRef', 'ref']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFunctionType(
  value: unknown
): value is 'query' | 'mutation' | 'action' {
  return value === 'query' || value === 'mutation' || value === 'action';
}

function isMetaScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function extractLeafMeta(value: Record<string, unknown>): FnMeta | undefined {
  const type = value.type;
  if (!isFunctionType(type)) {
    return;
  }

  const result: FnMeta = { type };
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'type' || nonMetaLeafKeys.has(key) || key.startsWith('_')) {
      continue;
    }
    if (entry === undefined) {
      continue;
    }
    if (isMetaScalar(entry)) {
      result[key] = entry;
    }
  }
  return result;
}

export function getHttpRoutes(
  api: Record<string, unknown>
): Meta['_http'] | undefined {
  const routes = api._http;
  if (!isRecord(routes)) {
    return;
  }

  const normalized: Record<string, { path: string; method: string }> = {};
  for (const [routeKey, routeValue] of Object.entries(routes)) {
    if (!isRecord(routeValue)) continue;
    const routePath = routeValue.path;
    const routeMethod = routeValue.method;
    if (typeof routePath === 'string' && typeof routeMethod === 'string') {
      normalized[routeKey] = { path: routePath, method: routeMethod };
    }
  }
  return normalized;
}

/**
 * Build a metadata index from merged API leaves.
 * Supports both generated `api` objects and plain metadata fixtures.
 */
export function buildMetaIndex(api: Record<string, unknown>): Meta {
  const cached = metaCache.get(api);
  if (cached) {
    return cached;
  }

  const meta: Meta = {};
  const httpRoutes = getHttpRoutes(api);
  if (httpRoutes) {
    meta._http = httpRoutes;
  }

  const walk = (node: Record<string, unknown>, path: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('_')) {
        continue;
      }
      if (!isRecord(value)) {
        continue;
      }

      const leafMeta = extractLeafMeta(value);
      if (leafMeta) {
        if (path.length === 0) {
          continue;
        }
        const namespace = path.join('/');
        meta[namespace] ??= {};
        meta[namespace]![key] = leafMeta;
        continue;
      }

      walk(value, [...path, key]);
    }
  };

  walk(api, []);
  metaCache.set(api, meta);
  return meta;
}

/** Files to exclude from meta generation */
const EXCLUDED_FILES = new Set([
  'schema.ts',
  'generated.ts',
  'convex.config.ts',
  'auth.config.ts',
]);

/**
 * Check if a file path should be included in meta generation.
 * Filters out private files/directories (prefixed with _) and config files.
 */
export function isValidConvexFile(file: string): boolean {
  // Skip private files/directories (prefixed with _)
  if (file.startsWith('_') || file.includes('/_')) return false;

  // Skip known config files
  const basename = file.split('/').pop() ?? '';
  if (EXCLUDED_FILES.has(basename)) return false;

  return true;
}

/**
 * Get a function reference from the API object by traversing the path.
 */
export function getFuncRef(
  api: Record<string, unknown>,
  path: string[]
): FunctionReference<'query' | 'mutation' | 'action'> {
  let current: unknown = api;

  for (const key of path) {
    if (current && typeof current === 'object') {
      const next = (current as Record<string, unknown>)[key];
      if (next === undefined) {
        throw new Error(`Invalid path: ${path.join('.')}`);
      }
      current = next;
    } else {
      throw new Error(`Invalid path: ${path.join('.')}`);
    }
  }

  if (current && typeof current === 'object') {
    const maybeFunctionRef = (current as Record<string, unknown>).functionRef;
    if (maybeFunctionRef && typeof maybeFunctionRef === 'object') {
      return maybeFunctionRef as FunctionReference<
        'query' | 'mutation' | 'action'
      >;
    }
  }

  if (!current || typeof current !== 'object') {
    throw new Error(`Invalid function reference at path: ${path.join('.')}`);
  }

  return current as FunctionReference<'query' | 'mutation' | 'action'>;
}

/**
 * Get function type from meta using path.
 * Supports nested paths like ['items', 'queries', 'list'] → namespace='items/queries', fn='list'
 *
 * @param path - Path segments like ['todos', 'create'] or ['items', 'queries', 'list']
 * @param meta - The meta object from codegen
 * @returns Function type or 'query' as default
 */
export function getFunctionType(
  path: string[],
  source: Meta | Record<string, unknown>
): 'query' | 'mutation' | 'action' {
  if (path.length < 2) return 'query';
  const meta = buildMetaIndex(source as Record<string, unknown>);

  // Last segment is function name, rest is namespace joined by '/'
  const fnName = path.at(-1)!;
  const namespace = path.slice(0, -1).join('/');

  const fnType = meta[namespace]?.[fnName]?.type;
  if (fnType === 'query' || fnType === 'mutation' || fnType === 'action') {
    return fnType;
  }

  return 'query';
}

/**
 * Get function metadata from meta using path.
 * Supports nested paths like ['items', 'queries', 'list'] → namespace='items/queries', fn='list'
 *
 * @param path - Path segments like ['todos', 'create'] or ['items', 'queries', 'list']
 * @param meta - The meta object from codegen
 * @returns Function metadata or undefined
 */
export function getFunctionMeta(
  path: string[],
  source: Meta | Record<string, unknown>
): FnMeta | undefined {
  if (path.length < 2) return;
  const meta = buildMetaIndex(source as Record<string, unknown>);

  const fnName = path.at(-1)!;
  const namespace = path.slice(0, -1).join('/');

  return meta[namespace]?.[fnName];
}
