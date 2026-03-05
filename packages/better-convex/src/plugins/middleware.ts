import { createMiddlewareFactory } from '../server/builder';
import type { MiddlewareBuilder } from '../server/types';

const PLUGIN_MIDDLEWARE_CONFIG_RESOLVERS = Symbol.for(
  'better-convex:PluginMiddlewareConfigResolvers'
);

export type PluginMiddlewareConfigureContext<TCtx = unknown> = {
  ctx: TCtx;
};

export type PluginMiddlewareConfigureResolver<TOptions, TCtx = unknown> = (
  args: PluginMiddlewareConfigureContext<TCtx>
) => TOptions | undefined;

export type PluginMiddlewareConfigureInput<TOptions, TCtx = unknown> =
  | TOptions
  | PluginMiddlewareConfigureResolver<TOptions, TCtx>;

export type PluginMiddlewareContextScope<TKey extends string, TContext> = {
  plugins: Record<string, unknown> & Record<TKey, TContext>;
};

type PluginMiddlewareDefinition<TApi, TOptions, TKey extends string, TCtx> = {
  key: TKey;
  provide: (args: { ctx: TCtx; options?: TOptions }) => TApi;
};

export type PluginMiddleware<
  TApi,
  TOptions = undefined,
  TKey extends string = string,
  TCtx = unknown,
> = {
  readonly key: TKey;
  readonly configure: <TNextCtx = TCtx>(
    input: PluginMiddlewareConfigureInput<TOptions, TNextCtx>
  ) => PluginMiddleware<TApi, TOptions, TKey, TNextCtx>;
  readonly middleware: () => MiddlewareBuilder<
    any,
    object,
    PluginMiddlewareContextScope<TKey, TApi>,
    unknown
  >;
  readonly [PLUGIN_MIDDLEWARE_CONFIG_RESOLVERS]?: readonly PluginMiddlewareConfigureResolver<
    TOptions,
    TCtx
  >[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeOptions<TOptions>(
  currentOptions: TOptions | undefined,
  nextOptions: TOptions | undefined
): TOptions | undefined {
  if (nextOptions === undefined) {
    return currentOptions;
  }
  if (currentOptions === undefined) {
    return nextOptions;
  }
  if (isPlainObject(currentOptions) && isPlainObject(nextOptions)) {
    return {
      ...currentOptions,
      ...nextOptions,
    } as TOptions;
  }
  return nextOptions;
}

function toConfigureResolver<TOptions, TCtx>(
  input: PluginMiddlewareConfigureInput<TOptions, TCtx>
): PluginMiddlewareConfigureResolver<TOptions, TCtx> {
  if (typeof input === 'function') {
    return input as PluginMiddlewareConfigureResolver<TOptions, TCtx>;
  }
  return () => input;
}

export function resolvePluginMiddlewareOptions<
  TMiddleware extends PluginMiddleware<any, any, any, any>,
  TCtx = unknown,
>(
  middleware: TMiddleware,
  args: PluginMiddlewareConfigureContext<TCtx>
): TMiddleware extends PluginMiddleware<any, infer TOptions, any, any>
  ? TOptions | undefined
  : never {
  const resolvers = middleware[
    PLUGIN_MIDDLEWARE_CONFIG_RESOLVERS as keyof typeof middleware
  ] as
    | readonly PluginMiddlewareConfigureResolver<
        TMiddleware extends PluginMiddleware<any, infer TOptions, any, any>
          ? TOptions
          : never,
        TCtx
      >[]
    | undefined;

  if (!resolvers || resolvers.length === 0) {
    return undefined as never;
  }

  let resolvedOptions:
    | (TMiddleware extends PluginMiddleware<any, infer TOptions, any, any>
        ? TOptions
        : never)
    | undefined;

  for (const resolver of resolvers) {
    resolvedOptions = mergeOptions(resolvedOptions, resolver(args));
  }

  return resolvedOptions as never;
}

function createConfiguredPluginMiddleware<
  TApi,
  TOptions = undefined,
  TKey extends string = string,
  TCtx = unknown,
>(
  definition: PluginMiddlewareDefinition<TApi, TOptions, TKey, TCtx>,
  resolvers: readonly PluginMiddlewareConfigureResolver<TOptions, TCtx>[]
): PluginMiddleware<TApi, TOptions, TKey, TCtx> {
  const middleware = {
    key: definition.key,
    configure: <TNextCtx = TCtx>(
      input: PluginMiddlewareConfigureInput<TOptions, TNextCtx>
    ) =>
      createConfiguredPluginMiddleware<TApi, TOptions, TKey, TNextCtx>(
        definition as unknown as PluginMiddlewareDefinition<
          TApi,
          TOptions,
          TKey,
          TNextCtx
        >,
        [
          ...(resolvers as unknown as readonly PluginMiddlewareConfigureResolver<
            TOptions,
            TNextCtx
          >[]),
          toConfigureResolver(input),
        ]
      ),
    middleware: () => {
      const createMiddleware = createMiddlewareFactory<unknown, object>();
      return createMiddleware<
        unknown,
        PluginMiddlewareContextScope<TKey, TApi>
      >(async ({ ctx, next }) => {
        const options = resolvePluginMiddlewareOptions(
          middleware as PluginMiddleware<TApi, TOptions, TKey, TCtx>,
          { ctx: ctx as TCtx }
        );
        const providedApi = definition.provide({
          ctx: ctx as TCtx,
          options: options as TOptions | undefined,
        });
        const existingPlugins = isPlainObject(
          (ctx as { plugins?: unknown }).plugins
        )
          ? ((ctx as { plugins?: Record<string, unknown> }).plugins ?? {})
          : {};
        const nextPlugins = {
          ...existingPlugins,
          [definition.key]: providedApi,
        } as Record<string, unknown> & Record<TKey, TApi>;
        return next({
          ctx: {
            ...(ctx as Record<string, unknown>),
            plugins: nextPlugins,
          },
        });
      });
    },
    [PLUGIN_MIDDLEWARE_CONFIG_RESOLVERS]: resolvers,
  } as PluginMiddleware<TApi, TOptions, TKey, TCtx>;

  return Object.freeze(middleware);
}

export function definePluginMiddleware<
  TKey extends string,
  TApi,
  TOptions = undefined,
>(definition: {
  key: TKey;
  provide: (args: { ctx: unknown; options?: TOptions }) => TApi;
}): PluginMiddleware<TApi, TOptions, TKey, unknown> {
  return createConfiguredPluginMiddleware(
    definition as PluginMiddlewareDefinition<TApi, TOptions, TKey, unknown>,
    []
  );
}
