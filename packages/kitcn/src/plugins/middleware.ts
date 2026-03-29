import { createMiddlewareFactory } from '../server/builder';
import type { MiddlewareBuilder } from '../server/types';

const PLUGIN_CONFIG_RESOLVERS = Symbol.for('kitcn:PluginConfigResolvers');

export type PluginConfigureContext<TCtx = unknown> = {
  ctx: TCtx;
};

export type PluginConfigureResolver<TOptions, TCtx = unknown> = (
  args: PluginConfigureContext<TCtx>
) => TOptions | undefined;

export type PluginConfigureInput<TOptions, TCtx = unknown> =
  | TOptions
  | PluginConfigureResolver<TOptions, TCtx>;

export type PluginApiScope<TKey extends string, TApi extends object> = {
  api: Record<string, unknown> & Record<TKey, TApi>;
};

type PluginMiddlewareHelpers<TKey extends string, TApi extends object> = {
  middleware: () => MiddlewareBuilder<
    any,
    any,
    PluginApiScope<TKey, TApi>,
    unknown
  >;
};

type PluginMiddlewareFactory = (
  ...args: never[]
) => MiddlewareBuilder<any, any, any, unknown>;

export type PluginNamedMiddlewareFactories = Record<
  string,
  PluginMiddlewareFactory
>;

type PluginExtensionFactories = PluginNamedMiddlewareFactories & {
  middleware?: PluginMiddlewareFactory;
};

type PluginExtensionBuilder<TKey extends string, TApi extends object> = (
  helpers: PluginMiddlewareHelpers<TKey, TApi>
) => PluginExtensionFactories;

type PluginDefinition<
  TKey extends string,
  TOptions,
  TApi extends object,
  TCtx,
> = {
  key: TKey;
  provide: (args: { ctx: TCtx; options?: TOptions }) => TApi;
};

export type Plugin<
  TKey extends string = string,
  TOptions = undefined,
  TApi extends object = {},
  TCtx = unknown,
  TMiddlewares extends PluginNamedMiddlewareFactories = {},
> = {
  readonly key: TKey;
  readonly configure: <TNextCtx = TCtx>(
    input: PluginConfigureInput<TOptions, TNextCtx>
  ) => Plugin<TKey, TOptions, TApi, TNextCtx, TMiddlewares>;
  readonly middleware: () => MiddlewareBuilder<
    any,
    any,
    PluginApiScope<TKey, TApi>,
    unknown
  >;
  readonly extend: <TNextExtensions extends PluginExtensionFactories>(
    build: (helpers: PluginMiddlewareHelpers<TKey, TApi>) => TNextExtensions
  ) => Plugin<
    TKey,
    TOptions,
    TApi,
    TCtx,
    TMiddlewares & Omit<TNextExtensions, 'middleware'>
  >;
  readonly [PLUGIN_CONFIG_RESOLVERS]?: readonly PluginConfigureResolver<
    TOptions,
    TCtx
  >[];
} & TMiddlewares;

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
  input: PluginConfigureInput<TOptions, TCtx>
): PluginConfigureResolver<TOptions, TCtx> {
  if (typeof input === 'function') {
    return input as PluginConfigureResolver<TOptions, TCtx>;
  }
  return () => input;
}

export function resolvePluginOptions<
  TPlugin extends Plugin<any, any, any, any>,
  TCtx = unknown,
>(
  plugin: TPlugin,
  args: PluginConfigureContext<TCtx>
): TPlugin extends Plugin<any, infer TOptions, any, any>
  ? TOptions | undefined
  : never {
  const resolvers = plugin[PLUGIN_CONFIG_RESOLVERS as keyof typeof plugin] as
    | readonly PluginConfigureResolver<
        TPlugin extends Plugin<any, infer TOptions, any, any>
          ? TOptions
          : never,
        TCtx
      >[]
    | undefined;

  if (!resolvers || resolvers.length === 0) {
    return undefined as never;
  }

  let resolvedOptions:
    | (TPlugin extends Plugin<any, infer TOptions, any, any> ? TOptions : never)
    | undefined;

  for (const resolver of resolvers) {
    resolvedOptions = mergeOptions(resolvedOptions, resolver(args));
  }

  return resolvedOptions as never;
}

function createConfiguredPlugin<
  TKey extends string = string,
  TOptions = undefined,
  TApi extends object = {},
  TCtx = unknown,
  TMiddlewares extends PluginNamedMiddlewareFactories = {},
>(
  definition: PluginDefinition<TKey, TOptions, TApi, TCtx>,
  resolvers: readonly PluginConfigureResolver<TOptions, TCtx>[],
  extensionBuilders: readonly PluginExtensionBuilder<TKey, TApi>[] = []
): Plugin<TKey, TOptions, TApi, TCtx, TMiddlewares> {
  let plugin!: Plugin<TKey, TOptions, TApi, TCtx, TMiddlewares>;
  const createBaseMiddleware = () => {
    const createMiddleware = createMiddlewareFactory<unknown, any>();
    return createMiddleware<unknown, PluginApiScope<TKey, TApi>>(
      async ({ ctx, next }) => {
        const options = resolvePluginOptions(
          plugin as Plugin<TKey, TOptions, TApi, TCtx>,
          { ctx: ctx as TCtx }
        );
        const providedApi = definition.provide({
          ctx: ctx as TCtx,
          options: options as TOptions | undefined,
        });
        const existingApi = isPlainObject((ctx as { api?: unknown }).api)
          ? ((ctx as { api?: Record<string, unknown> }).api ?? {})
          : {};
        const nextApi = {
          ...existingApi,
          [definition.key]: providedApi,
        } as Record<string, unknown> & Record<TKey, TApi>;
        return next({
          ctx: {
            ...(ctx as Record<string, unknown>),
            api: nextApi,
          },
        });
      }
    );
  };
  const middlewareHelpers: PluginMiddlewareHelpers<TKey, TApi> = {
    middleware: createBaseMiddleware,
  };
  let middlewareOverride: PluginMiddlewareFactory | undefined;
  const basePlugin = {
    key: definition.key,
    configure: <TNextCtx = TCtx>(
      input: PluginConfigureInput<TOptions, TNextCtx>
    ) =>
      createConfiguredPlugin<TKey, TOptions, TApi, TNextCtx, TMiddlewares>(
        definition as unknown as PluginDefinition<
          TKey,
          TOptions,
          TApi,
          TNextCtx
        >,
        [
          ...(resolvers as unknown as readonly PluginConfigureResolver<
            TOptions,
            TNextCtx
          >[]),
          toConfigureResolver(input),
        ],
        extensionBuilders as readonly PluginExtensionBuilder<TKey, TApi>[]
      ),
    middleware: () =>
      (middlewareOverride
        ? middlewareOverride()
        : createBaseMiddleware()) as MiddlewareBuilder<
        any,
        any,
        PluginApiScope<TKey, TApi>,
        unknown
      >,
    extend: <TNextExtensions extends PluginExtensionFactories>(
      build: (helpers: PluginMiddlewareHelpers<TKey, TApi>) => TNextExtensions
    ) =>
      createConfiguredPlugin<
        TKey,
        TOptions,
        TApi,
        TCtx,
        TMiddlewares & Omit<TNextExtensions, 'middleware'>
      >(definition, resolvers, [
        ...extensionBuilders,
        build as PluginExtensionBuilder<TKey, TApi>,
      ]),
    [PLUGIN_CONFIG_RESOLVERS]: resolvers,
  };

  const middlewarePresets: PluginNamedMiddlewareFactories = {};
  for (const build of extensionBuilders) {
    const builtExtensions = build(middlewareHelpers);

    for (const [name, preset] of Object.entries(builtExtensions)) {
      if (typeof preset !== 'function') {
        throw new Error(
          `Duplicate plugin middleware "${name}" on plugin "${definition.key}".`
        );
      }
      if (name === 'middleware') {
        if (middlewareOverride) {
          throw new Error(
            `Duplicate plugin middleware override on plugin "${definition.key}".`
          );
        }
        middlewareOverride = preset;
        continue;
      }
      if (name in middlewarePresets || name in basePlugin) {
        throw new Error(
          `Duplicate plugin middleware "${name}" on plugin "${definition.key}".`
        );
      }
      middlewarePresets[name] = preset;
    }
  }

  plugin = {
    ...basePlugin,
    ...middlewarePresets,
  } as Plugin<TKey, TOptions, TApi, TCtx, TMiddlewares>;

  return Object.freeze(plugin);
}

export function definePlugin<
  TKey extends string,
  TOptions = undefined,
  TApi extends object = {},
>(
  key: TKey,
  provide: (args: { ctx: unknown; options?: TOptions }) => TApi
): Plugin<TKey, TOptions, TApi, unknown, {}> {
  return createConfiguredPlugin(
    {
      key,
      provide,
    } satisfies PluginDefinition<TKey, TOptions, TApi, unknown>,
    []
  );
}
