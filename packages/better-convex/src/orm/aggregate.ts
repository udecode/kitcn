export type AggregateTriggerFactoryLike = {
  trigger: () => (ctx: unknown, change: unknown) => Promise<void>;
};

export type AggregateTriggerCtx<T extends AggregateTriggerFactoryLike> =
  Parameters<ReturnType<T['trigger']>>[0];

export type AggregateTriggerChange<T extends AggregateTriggerFactoryLike> =
  Parameters<ReturnType<T['trigger']>>[1];

type AggregateTriggerOverload<T extends AggregateTriggerFactoryLike> = {
  (): ReturnType<T['trigger']>;
  <TChange, TCtx>(change: TChange, ctx: TCtx): Promise<void>;
};

export type OrmCompatibleAggregate<T extends AggregateTriggerFactoryLike> =
  Omit<T, 'trigger'> & {
    trigger: AggregateTriggerOverload<T>;
  };

const ORM_AGGREGATE_WRAPPED = Symbol.for('better-convex:OrmAggregateWrapped');
const ORM_AGGREGATE_TRIGGER_FACTORY = Symbol.for(
  'better-convex:OrmAggregateTriggerFactory'
);

type WrappedAggregate = AggregateTriggerFactoryLike & {
  [ORM_AGGREGATE_WRAPPED]?: true;
  [ORM_AGGREGATE_TRIGGER_FACTORY]?: AggregateTriggerFactoryLike['trigger'];
};

const getTriggerFactory = <T extends AggregateTriggerFactoryLike>(
  aggregate: T
): T['trigger'] => {
  const maybeWrapped = aggregate as WrappedAggregate;
  if (maybeWrapped[ORM_AGGREGATE_WRAPPED]) {
    return maybeWrapped[ORM_AGGREGATE_TRIGGER_FACTORY] as T['trigger'];
  }
  return aggregate.trigger.bind(aggregate) as T['trigger'];
};

export function createAggregate<T extends AggregateTriggerFactoryLike>(
  aggregate: T
): OrmCompatibleAggregate<T> {
  const maybeWrapped = aggregate as WrappedAggregate;
  if (maybeWrapped[ORM_AGGREGATE_WRAPPED]) {
    return aggregate as unknown as OrmCompatibleAggregate<T>;
  }

  const triggerFactory = getTriggerFactory(aggregate);

  const trigger = ((...args: unknown[]) => {
    if (args.length === 0) {
      return triggerFactory();
    }
    if (args.length === 2) {
      const [change, ctx] = args;
      return triggerFactory()(
        ctx as AggregateTriggerCtx<T>,
        change as AggregateTriggerChange<T>
      );
    }
    throw new Error(
      'Invalid aggregate.trigger invocation. Use trigger() or trigger(change, ctx).'
    );
  }) as AggregateTriggerOverload<T>;

  Object.defineProperty(aggregate, 'trigger', {
    configurable: true,
    enumerable: false,
    value: trigger,
    writable: true,
  });
  Object.defineProperty(aggregate, ORM_AGGREGATE_WRAPPED, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  Object.defineProperty(aggregate, ORM_AGGREGATE_TRIGGER_FACTORY, {
    configurable: false,
    enumerable: false,
    value: triggerFactory,
    writable: false,
  });

  return aggregate as unknown as OrmCompatibleAggregate<T>;
}
