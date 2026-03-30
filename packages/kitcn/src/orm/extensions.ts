import type {
  AnyRelationsBuilderConfig,
  ExtractTablesFromSchema,
  RelationsBuilder,
  RelationsBuilderConfigValue,
  RelationsConfigWithSchema,
} from './relations';
import {
  OrmSchemaExtensionRelations,
  OrmSchemaExtensionTriggers,
} from './symbols';
import type { OrmTriggers } from './triggers';

type SafeExtensionRelationsConfig<
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = TRelationsConfig extends AnyRelationsBuilderConfig ? TRelationsConfig : {};

type SchemaExtensionRelationsAuthoringConfig<TTables extends object> = {
  [TTableName in keyof ExtractTablesFromSchema<TTables>]?: RelationsBuilderConfigValue;
};

type BivariantCallback<TCallback extends (...args: any[]) => unknown> = {
  bivarianceHack(...args: Parameters<TCallback>): ReturnType<TCallback>;
}['bivarianceHack'];

export type SchemaExtensionRelationsFactory<
  TTables extends object,
  TRelationsConfig extends AnyRelationsBuilderConfig,
> = (
  helpers: RelationsBuilder<ExtractTablesFromSchema<TTables>>
) => TRelationsConfig;

export type SchemaExtensionTriggersInput<
  TTables extends object = {},
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined =
    | AnyRelationsBuilderConfig
    | undefined,
> = OrmTriggers<
  RelationsConfigWithSchema<
    SafeExtensionRelationsConfig<TRelationsConfig>,
    ExtractTablesFromSchema<TTables>
  >
>;

export type SchemaExtension<
  TTables extends object = {},
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined =
    | AnyRelationsBuilderConfig
    | undefined,
  TTriggers extends
    | SchemaExtensionTriggersInput<TTables, TRelationsConfig>
    | undefined =
    | SchemaExtensionTriggersInput<TTables, TRelationsConfig>
    | undefined,
> = {
  key: string;
  tables: TTables;
  [OrmSchemaExtensionRelations]?: TRelationsConfig extends AnyRelationsBuilderConfig
    ? BivariantCallback<
        SchemaExtensionRelationsFactory<TTables, TRelationsConfig>
      >
    : undefined;
  [OrmSchemaExtensionTriggers]?: TTriggers;
};

export type AnySchemaExtension = SchemaExtension<
  object,
  AnyRelationsBuilderConfig | undefined,
  | SchemaExtensionTriggersInput<object, AnyRelationsBuilderConfig | undefined>
  | undefined
>;

type SchemaExtensionChain<
  TTables extends object,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
  TCanRelations extends boolean,
  TCanTriggers extends boolean,
> = SchemaExtension<
  TTables,
  TRelationsConfig,
  SchemaExtensionTriggersInput<TTables, TRelationsConfig> | undefined
> &
  (TCanRelations extends true
    ? {
        relations: <
          const TNextRelationsConfig extends
            SchemaExtensionRelationsAuthoringConfig<TTables>,
        >(
          relations: SchemaExtensionRelationsFactory<
            TTables,
            TNextRelationsConfig
          >
        ) => SchemaExtensionChain<TTables, TNextRelationsConfig, false, true>;
      }
    : {}) &
  (TCanTriggers extends true
    ? {
        triggers: (
          triggers: SchemaExtensionTriggersInput<TTables, TRelationsConfig>
        ) => SchemaExtensionChain<TTables, TRelationsConfig, false, false>;
      }
    : {});

type SchemaExtensionState<
  TTables extends object,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
> = {
  key: string;
  tables: TTables;
  relations:
    | (TRelationsConfig extends AnyRelationsBuilderConfig
        ? BivariantCallback<
            SchemaExtensionRelationsFactory<TTables, TRelationsConfig>
          >
        : undefined)
    | undefined;
  triggers: SchemaExtensionTriggersInput<TTables, TRelationsConfig> | undefined;
};

function defineChainMethod(
  target: object,
  key: 'relations' | 'triggers',
  value: (...args: any[]) => unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    configurable: true,
  });
}

function createSchemaExtensionChain<
  TTables extends object,
  TRelationsConfig extends AnyRelationsBuilderConfig | undefined,
  TCanRelations extends boolean,
  TCanTriggers extends boolean,
>(
  state: SchemaExtensionState<TTables, TRelationsConfig>,
  capabilities: {
    canRelations: TCanRelations;
    canTriggers: TCanTriggers;
  }
): SchemaExtensionChain<
  TTables,
  TRelationsConfig,
  TCanRelations,
  TCanTriggers
> {
  const extension = {
    key: state.key,
    tables: state.tables,
  } as SchemaExtensionChain<
    TTables,
    TRelationsConfig,
    TCanRelations,
    TCanTriggers
  >;

  Object.defineProperty(extension, OrmSchemaExtensionRelations, {
    value: state.relations,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(extension, OrmSchemaExtensionTriggers, {
    value: state.triggers,
    enumerable: false,
    configurable: true,
  });

  if (capabilities.canRelations) {
    defineChainMethod(extension as object, 'relations', (relations) =>
      createSchemaExtensionChain(
        {
          ...state,
          relations,
        } as SchemaExtensionState<TTables, AnyRelationsBuilderConfig>,
        {
          canRelations: false,
          canTriggers: true,
        }
      )
    );
  }

  if (capabilities.canTriggers) {
    defineChainMethod(extension as object, 'triggers', (triggers) =>
      createSchemaExtensionChain(
        {
          ...state,
          triggers,
        },
        {
          canRelations: false,
          canTriggers: false,
        }
      )
    );
  }

  return extension;
}

export function defineSchemaExtension<const TTables extends object>(
  key: string,
  tables: TTables
): SchemaExtensionChain<TTables, undefined, true, true> {
  return createSchemaExtensionChain(
    {
      key,
      tables,
      relations: undefined,
      triggers: undefined,
    },
    {
      canRelations: true,
      canTriggers: true,
    }
  );
}
