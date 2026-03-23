import type { GenericActionCtx, GenericDataModel } from 'convex/server';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  type DataTransformerOptions,
  getTransformer,
} from '../crpc/transformer';
import { CRPCError } from './error';
import type {
  CRPCHonoHandler,
  HttpHandlerOpts,
  HttpMethod,
  HttpProcedure,
  HttpProcedureBuilderDef,
  ProcedureMeta,
} from './http-types';
import type {
  AnyMiddleware,
  GetRawInputFn,
  MiddlewareBuilder,
  MiddlewareFunction,
  Overwrite,
  UnsetMarker,
} from './types';

// Extract path parameter names from a path template
export function extractPathParams(path: string): string[] {
  const matches = path.match(/:([a-zA-Z_][a-zA-Z0-9_]*)/g);
  return matches ? matches.map((m) => m.slice(1)) : [];
}

// Match URL pathname against a template and extract params
export function matchPathParams(
  template: string,
  pathname: string
): Record<string, string> | null {
  const templateParts = template.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (templateParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < templateParts.length; i++) {
    const templatePart = templateParts[i];
    const pathPart = pathParts[i];

    if (templatePart.startsWith(':')) {
      params[templatePart.slice(1)] = decodeURIComponent(pathPart);
    } else if (templatePart !== pathPart) {
      return null;
    }
  }

  return params;
}

// Convert CRPCError to HTTP Response
export function handleHttpError(error: unknown): Response {
  if (error instanceof CRPCError) {
    const statusMap: Record<string, number> = {
      BAD_REQUEST: 400,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      METHOD_NOT_SUPPORTED: 405,
      CONFLICT: 409,
      UNPROCESSABLE_CONTENT: 422,
      TOO_MANY_REQUESTS: 429,
      INTERNAL_SERVER_ERROR: 500,
    };

    const status = statusMap[error.code] ?? 500;
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status }
    );
  }

  console.error('Unhandled HTTP error:', error);
  return Response.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    },
    { status: 500 }
  );
}

// Helper to get base schema type (unwrap Optional/Nullable/Default wrappers)
function getBaseSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  // Only unwrap Optional and Nullable - NOT arrays (which also have unwrap())
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getBaseSchema(schema.unwrap() as z.ZodTypeAny);
  }
  // ZodDefault - use _def.innerType
  if (schema instanceof z.ZodDefault) {
    return getBaseSchema((schema as any)._def.innerType);
  }
  return schema;
}

// Helper to check if schema expects array
function isArraySchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodArray;
}

// Helper to check if schema expects number
function isNumberSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodNumber;
}

// Helper to check if schema expects boolean
function isBooleanSchema(schema: z.ZodTypeAny): boolean {
  return getBaseSchema(schema) instanceof z.ZodBoolean;
}

// Parse query parameters from URL
// Auto-coerces values based on schema: arrays, numbers, booleans
function parseQueryParams(
  url: URL,
  schema?: z.ZodTypeAny
): Record<string, string | string[] | number | boolean> {
  const params: Record<string, string | string[] | number | boolean> = {};
  const keys = new Set(url.searchParams.keys());

  // Get shape from schema if it's a ZodObject
  const shape =
    schema instanceof z.ZodObject
      ? (schema.shape as Record<string, z.ZodTypeAny>)
      : {};

  for (const key of keys) {
    const values = url.searchParams.getAll(key);
    const fieldSchema = shape[key];

    if (fieldSchema) {
      if (isArraySchema(fieldSchema)) {
        // Always return array for array schemas
        params[key] = values;
      } else if (isNumberSchema(fieldSchema)) {
        // Coerce to number
        params[key] = Number(values[0]);
      } else if (isBooleanSchema(fieldSchema)) {
        // Coerce to boolean (handle "true"/"false"/"1"/"0")
        const val = values[0].toLowerCase();
        params[key] = val === 'true' || val === '1';
      } else {
        // Single value: return string, multiple: return array
        params[key] = values.length === 1 ? values[0] : values;
      }
    } else {
      // No schema info - return raw string(s)
      params[key] = values.length === 1 ? values[0] : values;
    }
  }
  return params;
}

// Type aliases for any-typed versions (used internally)
type AnyHttpProcedureBuilderDef = HttpProcedureBuilderDef<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

/**
 * HttpProcedureBuilder - Fluent builder for HTTP endpoints
 *
 * Uses tRPC-style interface + factory pattern for proper generic type preservation:
 * - Interface declares full generics with explicit return types
 * - Factory function creates implementation objects
 * - This preserves literal types like 'GET' through method chains
 */
export interface HttpProcedureBuilder<
  TInitialCtx,
  TCtx,
  TInput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TOutput extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TParams extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TQuery extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
  TMeta extends ProcedureMeta = ProcedureMeta,
  TMethod extends HttpMethod = HttpMethod,
  TForm extends UnsetMarker | z.ZodTypeAny = UnsetMarker,
> {
  _def: HttpProcedureBuilderDef<
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;

  /** DELETE endpoint (Hono-style) */
  delete(
    path: string
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    'DELETE',
    TForm
  >;

  /** Define form data schema (for multipart/form-data uploads) */
  form<TSchema extends z.ZodTypeAny>(
    schema: TSchema
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TSchema
  >;

  /** GET endpoint (Hono-style) */
  get(
    path: string
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    'GET',
    TForm
  >;

  /** Define request body schema (for POST/PUT/PATCH) */
  input<TSchema extends z.ZodTypeAny>(
    schema: TSchema
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TSchema,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;

  /** Set procedure metadata (shallow merged when chained) */
  meta(
    value: TMeta
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;

  /**
   * Define the handler for POST/PUT/PATCH/DELETE endpoints (maps to useMutation on client).
   * Handler receives Hono Context `c` for Response helpers (c.json, c.body, c.text).
   * Return Response for custom responses, or plain object for auto JSON serialization.
   */
  mutation<TResult>(
    handler: (
      opts: HttpHandlerOpts<TCtx, TInput, TParams, TQuery, TForm>
    ) => Promise<
      Response | (TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult)
    >
  ): HttpProcedure<TInput, TOutput, TParams, TQuery, TMethod, TForm>;

  /** Define response schema */
  output<TSchema extends z.ZodTypeAny>(
    schema: TSchema
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TSchema,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;

  /** Define path parameter schema (for :param in path) */
  params<TSchema extends z.ZodTypeAny>(
    schema: TSchema
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TSchema,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;

  /** PATCH endpoint (Hono-style) */
  patch(
    path: string
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    'PATCH',
    TForm
  >;

  /** POST endpoint (Hono-style) */
  post(
    path: string
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    'POST',
    TForm
  >;

  /** PUT endpoint (Hono-style) */
  put(
    path: string
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    'PUT',
    TForm
  >;

  /**
   * Define the handler for GET endpoints (maps to useQuery on client).
   * Handler receives Hono Context `c` for Response helpers (c.json, c.body, c.text).
   * Return Response for custom responses, or plain object for auto JSON serialization.
   */
  query<TResult>(
    handler: (
      opts: HttpHandlerOpts<TCtx, TInput, TParams, TQuery, TForm>
    ) => Promise<
      Response | (TOutput extends z.ZodTypeAny ? z.infer<TOutput> : TResult)
    >
  ): HttpProcedure<TInput, TOutput, TParams, TQuery, TMethod, TForm>;

  /** Define the route path and HTTP method */
  route<M extends HttpMethod>(
    path: string,
    method: M
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    M,
    TForm
  >;

  /** Define query parameter schema (?key=value) */
  searchParams<TSchema extends z.ZodTypeAny>(
    schema: TSchema
  ): HttpProcedureBuilder<
    TInitialCtx,
    TCtx,
    TInput,
    TOutput,
    TParams,
    TSchema,
    TMeta,
    TMethod,
    TForm
  >;

  /** Add middleware to the procedure */
  use<$ContextOverridesOut extends object>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TCtx,
          TMeta,
          UnsetMarker,
          $ContextOverridesOut,
          unknown
        >
      | MiddlewareBuilder<
          any, // Allow reusable middleware with any context
          TMeta,
          $ContextOverridesOut,
          unknown
        >
  ): HttpProcedureBuilder<
    TInitialCtx,
    Overwrite<TCtx, $ContextOverridesOut>,
    TInput,
    TOutput,
    TParams,
    TQuery,
    TMeta,
    TMethod,
    TForm
  >;
}

// Any-typed builder for internal use
type AnyHttpProcedureBuilder = HttpProcedureBuilder<
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

/** Factory function to create a new builder with merged def */
function createNewHttpBuilder(
  def1: AnyHttpProcedureBuilderDef,
  def2: Partial<AnyHttpProcedureBuilderDef>
): AnyHttpProcedureBuilder {
  return createHttpBuilder({ ...def1, ...def2 });
}

/** Internal method to create the HTTP procedure */
function createProcedure(
  def: AnyHttpProcedureBuilderDef,
  handler: (opts: any) => Promise<any>,
  _type: 'query' | 'mutation'
): HttpProcedure<any, any, any, any, any> {
  if (!def.route) {
    throw new Error(
      'Route must be defined before action. Use .route(path, method) first.'
    );
  }

  /**
   * Hono-compatible handler function.
   * When used with HttpRouterWithHono, Convex ctx is passed via c.env.
   */
  const honoHandler: CRPCHonoHandler = async (
    c: Context
  ): Promise<Response> => {
    // Convex ctx passed via app.fetch(request, ctx) as env
    const convexCtx = c.env as GenericActionCtx<GenericDataModel>;
    const request = c.req.raw;

    try {
      const url = new URL(request.url);

      // Extract path params from Hono's param() if available, fallback to manual extraction
      const pathParams =
        c.req.param() ?? matchPathParams(def.route!.path, url.pathname) ?? {};

      // Create base context
      let ctx = def.functionConfig.createContext(convexCtx as any) as any;

      // getRawInput for HTTP - returns raw request body
      const getRawInput: GetRawInputFn = async () => {
        const contentType = request.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          return request.clone().json();
        }
        return null;
      };

      // Execute middlewares (input is unknown for HTTP middleware - parsed after)
      let currentInput: unknown;
      for (const middleware of def.middlewares) {
        const result = await middleware({
          ctx: ctx as any,
          input: currentInput,
          getRawInput,
          next: async (opts?: any) => {
            if (opts?.ctx) {
              ctx = { ...ctx, ...opts.ctx };
            }
            if (opts?.input !== undefined) {
              currentInput = opts.input;
            }
            return { ctx, marker: undefined as any };
          },
          meta: def.meta,
        });
        if (result?.ctx) {
          ctx = { ...ctx, ...(result.ctx as any) };
        }
      }

      // Parse path params
      let parsedParams: unknown;
      if (def.paramsSchema) {
        try {
          parsedParams = def.paramsSchema.parse(pathParams as any);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new CRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid path params',
              cause: error,
            });
          }
          throw error;
        }
      }

      // Parse query params - pass schema for array coercion
      let parsedQuery: unknown;
      if (def.querySchema) {
        const queryParams = parseQueryParams(url, def.querySchema);
        try {
          parsedQuery = def.querySchema.parse(queryParams as any);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new CRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid query params',
              cause: error,
            });
          }
          throw error;
        }
      }

      // Parse body for non-GET methods
      let parsedInput: unknown;
      if (def.inputSchema && request.method !== 'GET') {
        const contentType = request.headers.get('content-type') ?? '';
        let body: unknown;

        if (contentType.includes('application/json')) {
          body = await request.json();
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const formData = await request.formData();
          body = Object.fromEntries(formData.entries());
        } else {
          body = await request.json().catch(() => ({}));
        }

        try {
          parsedInput = def.inputSchema.parse(
            def.functionConfig.transformer.input.deserialize(body) as any
          );
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new CRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid input',
              cause: error,
            });
          }
          throw error;
        }
      }

      // Parse form data (multipart/form-data)
      let parsedForm: unknown;
      if (def.formSchema && request.method !== 'GET') {
        const formData = await request.formData();
        const formObj: Record<string, unknown> = {};
        for (const [key, value] of formData.entries()) {
          formObj[key] = value;
        }
        try {
          parsedForm = def.formSchema.parse(formObj);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new CRPCError({
              code: 'BAD_REQUEST',
              message: 'Invalid form data',
              cause: error,
            });
          }
          throw error;
        }
      }

      // Build handler options - ctx namespaced, include Hono Context `c`
      const handlerOpts: any = {
        ctx,
        c,
      };

      if (parsedInput !== undefined) {
        handlerOpts.input = parsedInput;
      }

      if (parsedParams !== undefined) {
        handlerOpts.params = parsedParams;
      }

      if (parsedQuery !== undefined) {
        handlerOpts.searchParams = parsedQuery;
      }

      if (parsedForm !== undefined) {
        handlerOpts.form = parsedForm;
      }

      const result = await handler(handlerOpts);

      // If handler returned Response (from c.json, c.text, etc.), return it directly
      if (result instanceof Response) {
        return result;
      }

      // Validate and return JSON response via Hono
      const output = def.outputSchema
        ? def.outputSchema.parse(result as any)
        : result;
      return c.json(def.functionConfig.transformer.output.serialize(output));
    } catch (error) {
      return handleHttpError(error);
    }
  };

  // Attach route metadata for registration
  honoHandler._crpcRoute = {
    path: def.route.path,
    method: def.route.method,
  };

  // Also create httpAction for backwards compatibility with non-Hono usage
  const httpActionFn = (def.functionConfig.base as any)(
    async (
      convexCtx: GenericActionCtx<GenericDataModel>,
      request: Request
    ): Promise<Response> => {
      // Create a minimal Hono-like context for backwards compatibility
      const minimalContext = {
        env: convexCtx,
        req: {
          raw: request,
          param: () =>
            matchPathParams(def.route!.path, new URL(request.url).pathname) ??
            {},
        },
        json: (data: unknown, status?: number) =>
          Response.json(data, { status }),
        text: (text: string, status?: number) => new Response(text, { status }),
        body: (body: BodyInit, init?: ResponseInit) => new Response(body, init),
        html: (html: string, status?: number) =>
          new Response(html, {
            status,
            headers: { 'Content-Type': 'text/html' },
          }),
        redirect: (url: string, status?: number) =>
          Response.redirect(url, status ?? 302),
        header: (_name: string, _value: string) => {
          // Note: headers set via c.header() won't work in minimal context
          // Users should return Response directly for custom headers
        },
      } as unknown as Context;

      return honoHandler(minimalContext);
    }
  );

  // Attach route metadata and def for client type inference
  const procedure = httpActionFn as HttpProcedure<any, any, any, any, any, any>;
  procedure.isHttp = true;
  procedure._crpcHttpRoute = def.route;
  procedure._def = {
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    paramsSchema: def.paramsSchema,
    querySchema: def.querySchema,
    formSchema: def.formSchema,
  };
  // Attach Hono handler for use with HttpRouterWithHono
  (procedure as any)._honoHandler = honoHandler;

  return procedure;
}

/** Create the builder implementation object */
function createHttpBuilder(
  def: AnyHttpProcedureBuilderDef
): AnyHttpProcedureBuilder {
  const builder: AnyHttpProcedureBuilder = {
    _def: def,

    use(middlewareOrBuilder: any) {
      const middlewares =
        '_middlewares' in middlewareOrBuilder
          ? middlewareOrBuilder._middlewares
          : [middlewareOrBuilder as AnyMiddleware];
      return createNewHttpBuilder(def, {
        middlewares: [...def.middlewares, ...middlewares],
      });
    },

    meta(value: any) {
      return createNewHttpBuilder(def, {
        meta: def.meta ? { ...def.meta, ...value } : value,
      });
    },

    route(path: string, method: HttpMethod) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method,
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    get(path: string) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method: 'GET',
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    post(path: string) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method: 'POST',
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    put(path: string) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method: 'PUT',
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    patch(path: string) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method: 'PATCH',
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    delete(path: string) {
      const pathParamNames = extractPathParams(path);
      return createNewHttpBuilder(def, {
        route: {
          path,
          method: 'DELETE',
          pathParamNames,
          usePathPrefix: pathParamNames.length > 0,
        },
      });
    },

    params(schema: any) {
      return createNewHttpBuilder(def, {
        paramsSchema: schema,
      });
    },

    searchParams(schema: any) {
      return createNewHttpBuilder(def, {
        querySchema: schema,
      });
    },

    input(schema: any) {
      return createNewHttpBuilder(def, {
        inputSchema: schema,
      });
    },

    output(schema: any) {
      return createNewHttpBuilder(def, {
        outputSchema: schema,
      });
    },

    form(schema: any) {
      return createNewHttpBuilder(def, {
        formSchema: schema,
      });
    },

    query(handler: any) {
      return createProcedure(def, handler, 'query');
    },

    mutation(handler: any) {
      return createProcedure(def, handler, 'mutation');
    },
  };

  return builder;
}

/**
 * Create initial HttpProcedureBuilder
 */
export function createHttpProcedureBuilder<
  TCtx,
  TMeta extends ProcedureMeta,
>(config: {
  base: HttpProcedureBuilderDef<
    TCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta,
    HttpMethod,
    UnsetMarker
  >['functionConfig']['base'];
  createContext: (ctx: GenericActionCtx<GenericDataModel>) => TCtx;
  meta: TMeta;
  transformer?: DataTransformerOptions;
}): HttpProcedureBuilder<
  TCtx,
  TCtx,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  UnsetMarker,
  TMeta,
  HttpMethod,
  UnsetMarker
> {
  return createHttpBuilder({
    middlewares: [],
    meta: config.meta,
    functionConfig: {
      base: config.base,
      createContext: config.createContext,
      transformer: getTransformer(config.transformer),
    },
  }) as HttpProcedureBuilder<
    TCtx,
    TCtx,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    UnsetMarker,
    TMeta,
    HttpMethod,
    UnsetMarker
  >;
}
