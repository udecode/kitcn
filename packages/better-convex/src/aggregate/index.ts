import { TableAggregate, type TableAggregateType } from '@convex-dev/aggregate';
import {
  type AggregateTriggerFactoryLike,
  type OrmCompatibleAggregate,
  createAggregate as wrapAggregate,
} from '../orm/aggregate';

type AnyTableAggregateType = TableAggregateType<any, any, any, any>;

type TableAggregateComponent<T extends AnyTableAggregateType> =
  ConstructorParameters<typeof TableAggregate<T>>[0];

type TableAggregateOptions<T extends AnyTableAggregateType> =
  ConstructorParameters<typeof TableAggregate<T>>[1];

export type {
  AggregateTriggerChange,
  AggregateTriggerCtx,
  AggregateTriggerFactoryLike,
  OrmCompatibleAggregate,
} from '../orm/aggregate';

export function createAggregate<T extends AggregateTriggerFactoryLike>(
  aggregate: T
): OrmCompatibleAggregate<T>;
export function createAggregate<T extends AnyTableAggregateType>(
  component: TableAggregateComponent<T>,
  options: TableAggregateOptions<T>
): OrmCompatibleAggregate<TableAggregate<T>>;
export function createAggregate(...args: unknown[]) {
  if (args.length === 1) {
    return wrapAggregate(args[0] as AggregateTriggerFactoryLike);
  }
  if (args.length === 2) {
    const [component, options] = args as [
      TableAggregateComponent<AnyTableAggregateType>,
      TableAggregateOptions<AnyTableAggregateType>,
    ];
    return wrapAggregate(
      new TableAggregate<AnyTableAggregateType>(component, options)
    );
  }
  throw new Error(
    'Invalid createAggregate invocation. Use createAggregate(aggregate) or createAggregate(component, options).'
  );
}
