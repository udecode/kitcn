import type { Value as ConvexValue } from 'convex/values';
import {
  DirectAggregate as CoreDirectAggregate,
  type DirectAggregateType as CoreDirectAggregateType,
  type Key as CoreKey,
  TableAggregate as CoreTableAggregate,
  type TableAggregateType as CoreTableAggregateType,
} from '../aggregate-core/runtime';

type Key = CoreKey;

type AnyDirectAggregateType = CoreDirectAggregateType<
  Key,
  string,
  ConvexValue | undefined
>;
type AnyTableAggregateType = CoreTableAggregateType<
  Key,
  any,
  any,
  ConvexValue | undefined
>;
type CoreTrigger<T extends AnyTableAggregateType> = ReturnType<
  CoreTableAggregate<T>['trigger']
>;
type CoreIdempotentTrigger<T extends AnyTableAggregateType> = ReturnType<
  CoreTableAggregate<T>['idempotentTrigger']
>;
type TriggerFactory = () => (ctx: unknown, change: unknown) => Promise<void>;

const wrapTriggerFactory = <TFactory extends TriggerFactory>(
  methodName: 'trigger' | 'idempotentTrigger',
  factory: TFactory
): {
  (): ReturnType<TFactory>;
  <TChange, TCtx>(change: TChange, ctx: TCtx): Promise<void>;
} =>
  ((...args: unknown[]) => {
    if (args.length === 0) {
      return factory();
    }
    if (args.length === 2) {
      const [change, ctx] = args;
      return factory()(ctx as any, change as any);
    }
    throw new Error(
      `Invalid aggregate.${methodName} invocation. Use ${methodName}() or ${methodName}(change, ctx).`
    );
  }) as {
    (): ReturnType<TFactory>;
    <TChange, TCtx>(change: TChange, ctx: TCtx): Promise<void>;
  };

export type {
  Bound,
  Bounds,
  DirectAggregateType,
  Item,
  Key,
  RunMutationCtx,
  RunQueryCtx,
  TableAggregateType,
} from '../aggregate-core/runtime';
export { aggregateStorageTables } from '../aggregate-core/schema';
export type {
  AggregateTriggerChange,
  AggregateTriggerCtx,
  AggregateTriggerFactoryLike,
  OrmCompatibleAggregate,
} from '../orm/aggregate';

export class TableAggregate<
  T extends AnyTableAggregateType,
> extends CoreTableAggregate<T> {
  declare trigger: {
    (): CoreTrigger<T>;
    <TChange, TCtx>(change: TChange, ctx: TCtx): Promise<void>;
  };

  declare idempotentTrigger: {
    (): CoreIdempotentTrigger<T>;
    <TChange, TCtx>(change: TChange, ctx: TCtx): Promise<void>;
  };

  constructor(...args: ConstructorParameters<typeof CoreTableAggregate>) {
    super(...(args as [any]));

    const triggerFactory = super.trigger.bind(this) as TriggerFactory;
    const idempotentFactory = super.idempotentTrigger.bind(
      this
    ) as TriggerFactory;

    Object.defineProperty(this, 'trigger', {
      configurable: true,
      enumerable: false,
      value: wrapTriggerFactory('trigger', triggerFactory),
      writable: true,
    });
    Object.defineProperty(this, 'idempotentTrigger', {
      configurable: true,
      enumerable: false,
      value: wrapTriggerFactory('idempotentTrigger', idempotentFactory),
      writable: true,
    });
  }
}

export class DirectAggregate<
  T extends AnyDirectAggregateType,
> extends CoreDirectAggregate<T> {}

export function createDirectAggregate<
  T extends AnyDirectAggregateType,
>(config: { name: string }): DirectAggregate<T> {
  return new DirectAggregate<T>(config);
}
