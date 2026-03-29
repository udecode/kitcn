import type {
  DocumentByName,
  GenericDatabaseReader,
  GenericDatabaseWriter,
  GenericDataModel,
  TableNamesInDataModel,
} from 'convex/server';
import {
  ConvexError,
  type Value as ConvexValue,
  type GenericId,
} from 'convex/values';
import {
  aggregateBetweenBatchHandler,
  aggregateBetweenHandler,
  atNegativeOffsetHandler,
  atOffsetBatchHandler,
  atOffsetHandler,
  type Key as BTreeKey,
  clearTree,
  deleteHandler,
  getOrCreateTree,
  insertHandler,
  offsetHandler,
  offsetUntilHandler,
  paginateHandler,
  paginateNamespacesHandler,
} from './btree.js';
import {
  boundsToPositions,
  boundToPosition,
  keyToPosition,
  type Position,
  type Bound as PositionBound,
  type Bounds as PositionBounds,
  positionToKey,
} from './positions.js';

type Key = BTreeKey;
type Bound<K extends Key, ID extends string> = PositionBound<K, ID>;
type Bounds<K extends Key, ID extends string> = PositionBounds<K, ID>;

const INTERNAL_NAMESPACE_MARKER_MISSING = 0 as const;
const INTERNAL_NAMESPACE_MARKER_PRESENT = 1 as const;

type InternalNamespace = [
  aggregateName: string,
  namespace: ConvexValue | null,
  marker:
    | typeof INTERNAL_NAMESPACE_MARKER_MISSING
    | typeof INTERNAL_NAMESPACE_MARKER_PRESENT,
];

type AggregateQueryCtx = {
  db: GenericDatabaseReader<any>;
  orm: unknown;
};

type AggregateMutationCtx = {
  db: GenericDatabaseWriter<any>;
  orm: unknown;
};

export type RunQueryCtx = AggregateQueryCtx;
export type RunMutationCtx = AggregateMutationCtx;

export type Item<K extends Key, ID extends string> = {
  id: ID;
  key: K;
  sumValue: number;
};

export type { Bound, Bounds, Key };

const encodeNamespace = (
  aggregateName: string,
  namespace: ConvexValue | undefined
): InternalNamespace => [
  aggregateName,
  namespace === undefined ? null : namespace,
  namespace === undefined
    ? INTERNAL_NAMESPACE_MARKER_MISSING
    : INTERNAL_NAMESPACE_MARKER_PRESENT,
];

const isInternalNamespace = (value: unknown): value is InternalNamespace =>
  Array.isArray(value) &&
  value.length === 3 &&
  typeof value[0] === 'string' &&
  (value[2] === INTERNAL_NAMESPACE_MARKER_MISSING ||
    value[2] === INTERNAL_NAMESPACE_MARKER_PRESENT);

const decodeNamespace = <TNamespace extends ConvexValue | undefined>(
  namespace: InternalNamespace
): TNamespace => {
  if (namespace[2] === INTERNAL_NAMESPACE_MARKER_MISSING) {
    return undefined as TNamespace;
  }
  return namespace[1] as TNamespace;
};

const namespaceForOpts = <Opts, TNamespace extends ConvexValue | undefined>(
  aggregateName: string,
  opts: NamespacedOpts<Opts, TNamespace>
): InternalNamespace => encodeNamespace(aggregateName, namespaceFromOpts(opts));

const namespaceForArg = <TNamespace extends ConvexValue | undefined>(
  aggregateName: string,
  args: { namespace: TNamespace } | object
): InternalNamespace => encodeNamespace(aggregateName, namespaceFromArg(args));

/**
 * Write data to be aggregated, and read aggregated data.
 */
export class Aggregate<
  K extends Key,
  ID extends string,
  TNamespace extends ConvexValue | undefined = undefined,
> {
  constructor(protected readonly aggregateName: string) {}

  async count(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<number> {
    const result = await aggregateBetweenHandler(
      { db: ctx.db },
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceForOpts(this.aggregateName, opts),
      }
    );
    return result.count;
  }

  async countBatch(
    ctx: RunQueryCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<number[]> {
    const results = await aggregateBetweenBatchHandler(
      { db: ctx.db },
      {
        queries: queries.map((query) => {
          if (!query) {
            throw new Error('You must pass bounds and/or namespace');
          }
          return {
            ...boundsToPositions(query.bounds),
            namespace: namespaceForArg(this.aggregateName, query),
          };
        }),
      }
    );
    return results.map((result) => result.count);
  }

  async sum(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<number> {
    const result = await aggregateBetweenHandler(
      { db: ctx.db },
      {
        ...boundsToPositions(opts[0]?.bounds),
        namespace: namespaceForOpts(this.aggregateName, opts),
      }
    );
    return result.sum;
  }

  async sumBatch(
    ctx: RunQueryCtx,
    queries: NamespacedOptsBatch<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<number[]> {
    const results = await aggregateBetweenBatchHandler(
      { db: ctx.db },
      {
        queries: queries.map((query) => {
          if (!query) {
            throw new Error('You must pass bounds and/or namespace');
          }
          return {
            ...boundsToPositions(query.bounds),
            namespace: namespaceForArg(this.aggregateName, query),
          };
        }),
      }
    );
    return results.map((result) => result.sum);
  }

  async at(
    ctx: RunQueryCtx,
    offset: number,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<Item<K, ID>> {
    const encodedNamespace = namespaceForOpts(this.aggregateName, opts);

    const item =
      offset < 0
        ? await atNegativeOffsetHandler(
            { db: ctx.db },
            {
              ...boundsToPositions(opts[0]?.bounds),
              namespace: encodedNamespace,
              offset: -offset - 1,
            }
          )
        : await atOffsetHandler(
            { db: ctx.db },
            {
              ...boundsToPositions(opts[0]?.bounds),
              namespace: encodedNamespace,
              offset,
            }
          );

    return btreeItemToAggregateItem(item);
  }

  async atBatch(
    ctx: RunQueryCtx,
    queries: NamespacedOptsBatch<
      { offset: number; bounds?: Bounds<K, ID> },
      TNamespace
    >
  ): Promise<Item<K, ID>[]> {
    const results = await atOffsetBatchHandler(
      { db: ctx.db },
      {
        queries: queries.map((query) => ({
          ...boundsToPositions(query.bounds),
          namespace: namespaceForArg(this.aggregateName, query),
          offset: query.offset,
        })),
      }
    );

    return results.map(btreeItemToAggregateItem<K, ID>);
  }

  async indexOf(
    ctx: RunQueryCtx,
    key: K,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; id?: ID; order?: 'asc' | 'desc' },
      TNamespace
    >
  ): Promise<number> {
    const { k1, k2 } = boundsToPositions(opts[0]?.bounds);
    const namespace = namespaceForOpts(this.aggregateName, opts);

    if (opts[0]?.order === 'desc') {
      return offsetUntilHandler(
        { db: ctx.db },
        {
          k2,
          key: boundToPosition('upper', {
            id: opts[0]?.id,
            inclusive: true,
            key,
          }),
          namespace,
        }
      );
    }

    return offsetHandler(
      { db: ctx.db },
      {
        k1,
        key: boundToPosition('lower', {
          id: opts[0]?.id,
          inclusive: true,
          key,
        }),
        namespace,
      }
    );
  }

  async offsetOf(
    ctx: RunQueryCtx,
    key: K,
    namespace: TNamespace,
    id?: ID,
    bounds?: Bounds<K, ID>
  ): Promise<number> {
    return this.indexOf(ctx, key, { bounds, id, namespace, order: 'asc' });
  }

  async offsetUntil(
    ctx: RunQueryCtx,
    key: K,
    namespace: TNamespace,
    id?: ID,
    bounds?: Bounds<K, ID>
  ): Promise<number> {
    return this.indexOf(ctx, key, { bounds, id, namespace, order: 'desc' });
  }

  async min(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      bounds: opts[0]?.bounds,
      namespace: namespaceFromOpts(opts),
      order: 'asc',
      pageSize: 1,
    });
    return page[0] ?? null;
  }

  async max(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<Item<K, ID> | null> {
    const { page } = await this.paginate(ctx, {
      bounds: opts[0]?.bounds,
      namespace: namespaceFromOpts(opts),
      order: 'desc',
      pageSize: 1,
    });
    return page[0] ?? null;
  }

  async random(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<{ bounds?: Bounds<K, ID> }, TNamespace>
  ): Promise<Item<K, ID> | null> {
    const count = await this.count(ctx, ...opts);
    if (count === 0) {
      return null;
    }
    return this.at(ctx, Math.floor(Math.random() * count), ...opts);
  }

  async paginate(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<
      {
        bounds?: Bounds<K, ID>;
        cursor?: string;
        order?: 'asc' | 'desc';
        pageSize?: number;
      },
      TNamespace
    >
  ): Promise<{ cursor: string; isDone: boolean; page: Item<K, ID>[] }> {
    const result = await paginateHandler(
      { db: ctx.db },
      {
        ...boundsToPositions(opts[0]?.bounds),
        cursor: opts[0]?.cursor,
        limit: opts[0]?.pageSize ?? 100,
        namespace: namespaceForOpts(this.aggregateName, opts),
        order: opts[0]?.order ?? 'asc',
      }
    );

    return {
      cursor: result.cursor,
      isDone: result.isDone,
      page: result.page.map(btreeItemToAggregateItem<K, ID>),
    };
  }

  async *iter(
    ctx: RunQueryCtx,
    ...opts: NamespacedOpts<
      { bounds?: Bounds<K, ID>; order?: 'asc' | 'desc'; pageSize?: number },
      TNamespace
    >
  ): AsyncGenerator<Item<K, ID>, void, undefined> {
    const bounds = opts[0]?.bounds;
    const namespace = namespaceFromOpts(opts);
    const order = opts[0]?.order ?? 'asc';
    const pageSize = opts[0]?.pageSize ?? 100;

    let cursor: string | undefined;
    let isDone = false;

    while (!isDone) {
      const page = await this.paginate(ctx, {
        bounds,
        cursor,
        namespace,
        order,
        pageSize,
      });

      for (const item of page.page) {
        yield item;
      }

      cursor = page.cursor;
      isDone = page.isDone;
    }
  }

  async _insert(
    ctx: RunMutationCtx,
    namespace: TNamespace,
    key: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await insertHandler(
      { db: ctx.db },
      {
        key: keyToPosition(key, id),
        namespace: namespaceForArg(this.aggregateName, { namespace }),
        summand,
        value: id,
      }
    );
  }

  async _delete(
    ctx: RunMutationCtx,
    namespace: TNamespace,
    key: K,
    id: ID
  ): Promise<void> {
    await deleteHandler(
      { db: ctx.db },
      {
        key: keyToPosition(key, id),
        namespace: namespaceForArg(this.aggregateName, { namespace }),
      }
    );
  }

  async _replace(
    ctx: RunMutationCtx,
    currentNamespace: TNamespace,
    currentKey: K,
    newNamespace: TNamespace,
    newKey: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await deleteHandler(
      { db: ctx.db },
      {
        key: keyToPosition(currentKey, id),
        namespace: namespaceForArg(this.aggregateName, {
          namespace: currentNamespace,
        }),
      }
    );
    await insertHandler(
      { db: ctx.db },
      {
        key: keyToPosition(newKey, id),
        namespace: namespaceForArg(this.aggregateName, {
          namespace: newNamespace,
        }),
        summand,
        value: id,
      }
    );
  }

  async _insertIfDoesNotExist(
    ctx: RunMutationCtx,
    namespace: TNamespace,
    key: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespace,
      key,
      namespace,
      key,
      id,
      summand
    );
  }

  async _deleteIfExists(
    ctx: RunMutationCtx,
    namespace: TNamespace,
    key: K,
    id: ID
  ): Promise<void> {
    try {
      await this._delete(ctx, namespace, key, id);
    } catch (error) {
      if (
        error instanceof ConvexError &&
        error.data?.code === 'DELETE_MISSING_KEY'
      ) {
        return;
      }
      throw error;
    }
  }

  async _replaceOrInsert(
    ctx: RunMutationCtx,
    currentNamespace: TNamespace,
    currentKey: K,
    newNamespace: TNamespace,
    newKey: K,
    id: ID,
    summand?: number
  ): Promise<void> {
    try {
      await this._delete(ctx, currentNamespace, currentKey, id);
    } catch (error) {
      if (
        !(
          error instanceof ConvexError &&
          error.data?.code === 'DELETE_MISSING_KEY'
        )
      ) {
        throw error;
      }
    }
    await this._insert(ctx, newNamespace, newKey, id, summand);
  }

  async clear(
    ctx: RunMutationCtx,
    ...opts: NamespacedOpts<
      { maxNodeSize?: number; rootLazy?: boolean },
      TNamespace
    >
  ): Promise<void> {
    await clearTree(ctx.db, {
      maxNodeSize: opts[0]?.maxNodeSize,
      namespace: namespaceForOpts(this.aggregateName, opts),
      rootLazy: opts[0]?.rootLazy,
    });
  }

  async makeRootLazy(
    ctx: RunMutationCtx,
    namespace: TNamespace
  ): Promise<void> {
    const tree = await getOrCreateTree(
      ctx.db,
      namespaceForArg(this.aggregateName, { namespace })
    );
    await ctx.db.patch(tree.root, { aggregate: undefined });
  }

  async paginateNamespaces(
    ctx: RunQueryCtx,
    cursor?: string,
    pageSize = 100
  ): Promise<{ cursor: string; isDone: boolean; page: TNamespace[] }> {
    const result = await paginateNamespacesHandler(
      { db: ctx.db },
      {
        aggregateName: this.aggregateName,
        cursor,
        limit: pageSize,
      }
    );

    const page: TNamespace[] = [];
    for (const namespace of result.page) {
      if (!isInternalNamespace(namespace)) {
        continue;
      }
      if (namespace[0] !== this.aggregateName) {
        continue;
      }
      page.push(decodeNamespace<TNamespace>(namespace));
    }

    return {
      cursor: result.cursor,
      isDone: result.isDone,
      page,
    };
  }

  async *iterNamespaces(
    ctx: RunQueryCtx,
    pageSize = 100
  ): AsyncGenerator<TNamespace, void, undefined> {
    let cursor: string | undefined;
    let isDone = false;

    while (!isDone) {
      const page = await this.paginateNamespaces(ctx, cursor, pageSize);
      for (const namespace of page.page) {
        yield namespace;
      }
      cursor = page.cursor;
      isDone = page.isDone;
    }
  }

  async clearAll(
    ctx: RunMutationCtx & RunQueryCtx,
    opts?: { maxNodeSize?: number; rootLazy?: boolean }
  ): Promise<void> {
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.clear(ctx, { ...opts, namespace });
    }

    await this.clear(ctx, {
      ...opts,
      namespace: undefined as TNamespace,
    });
  }

  async makeAllRootsLazy(ctx: RunMutationCtx & RunQueryCtx): Promise<void> {
    for await (const namespace of this.iterNamespaces(ctx)) {
      await this.makeRootLazy(ctx, namespace);
    }
  }
}

export type DirectAggregateType<
  K extends Key,
  ID extends string,
  TNamespace extends ConvexValue | undefined = undefined,
> = {
  Key: K;
  Id: ID;
  Namespace?: TNamespace;
};

type AnyDirectAggregateType = DirectAggregateType<
  Key,
  string,
  ConvexValue | undefined
>;
type DirectAggregateNamespace<T extends AnyDirectAggregateType> =
  'Namespace' extends keyof T ? T['Namespace'] : undefined;

export class DirectAggregate<
  T extends AnyDirectAggregateType,
> extends Aggregate<T['Key'], T['Id'], DirectAggregateNamespace<T>> {
  constructor(config: { name: string }) {
    super(config.name);
  }

  async insert(
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { id: T['Id']; key: T['Key']; sumValue?: number },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._insert(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue
    );
  }

  async delete(
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { id: T['Id']; key: T['Key'] },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._delete(ctx, namespaceFromArg(args), args.key, args.id);
  }

  async replace(
    ctx: RunMutationCtx,
    currentItem: NamespacedArgs<
      { id: T['Id']; key: T['Key'] },
      DirectAggregateNamespace<T>
    >,
    newItem: NamespacedArgs<
      { key: T['Key']; sumValue?: number },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._replace(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue
    );
  }

  async insertIfDoesNotExist(
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { id: T['Id']; key: T['Key']; sumValue?: number },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      namespaceFromArg(args),
      args.key,
      args.id,
      args.sumValue
    );
  }

  async deleteIfExists(
    ctx: RunMutationCtx,
    args: NamespacedArgs<
      { id: T['Id']; key: T['Key'] },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._deleteIfExists(ctx, namespaceFromArg(args), args.key, args.id);
  }

  async replaceOrInsert(
    ctx: RunMutationCtx,
    currentItem: NamespacedArgs<
      { id: T['Id']; key: T['Key'] },
      DirectAggregateNamespace<T>
    >,
    newItem: NamespacedArgs<
      { key: T['Key']; sumValue?: number },
      DirectAggregateNamespace<T>
    >
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      namespaceFromArg(currentItem),
      currentItem.key,
      namespaceFromArg(newItem),
      newItem.key,
      currentItem.id,
      newItem.sumValue
    );
  }
}

export type TableAggregateType<
  K extends Key,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
  TNamespace extends ConvexValue | undefined = undefined,
> = {
  DataModel: DataModel;
  Key: K;
  Namespace?: TNamespace;
  TableName: TableName;
};

type AnyTableAggregateType = TableAggregateType<
  Key,
  GenericDataModel,
  TableNamesInDataModel<GenericDataModel>,
  ConvexValue | undefined
>;

type TableAggregateNamespace<T extends AnyTableAggregateType> =
  'Namespace' extends keyof T ? T['Namespace'] : undefined;
type TableAggregateDocument<T extends AnyTableAggregateType> = DocumentByName<
  T['DataModel'],
  T['TableName']
>;
type TableAggregateId<T extends AnyTableAggregateType> = GenericId<
  T['TableName']
>;
type TableAggregateTrigger<Ctx, T extends AnyTableAggregateType> = Trigger<
  Ctx,
  T['DataModel'],
  T['TableName']
>;

export class TableAggregate<T extends AnyTableAggregateType> extends Aggregate<
  T['Key'],
  GenericId<T['TableName']>,
  TableAggregateNamespace<T>
> {
  constructor(
    options: {
      name: string;
      table: T['TableName'];
      sortKey: (d: TableAggregateDocument<T>) => T['Key'];
      sumValue?: (d: TableAggregateDocument<T>) => number;
    } & (undefined extends TableAggregateNamespace<T>
      ? {
          namespace?: (
            d: TableAggregateDocument<T>
          ) => TableAggregateNamespace<T>;
        }
      : {
          namespace: (
            d: TableAggregateDocument<T>
          ) => TableAggregateNamespace<T>;
        })
  ) {
    super(options.name);
    this.options = options;
  }

  private readonly options;

  async insert(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._insert(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc)
    );
  }

  async delete(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._delete(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>
    );
  }

  async replace(
    ctx: RunMutationCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._replace(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc)
    );
  }

  async insertIfDoesNotExist(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._insertIfDoesNotExist(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>,
      this.options.sumValue?.(doc)
    );
  }

  async deleteIfExists(
    ctx: RunMutationCtx,
    doc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._deleteIfExists(
      ctx,
      this.options.namespace?.(doc),
      this.options.sortKey(doc),
      doc._id as TableAggregateId<T>
    );
  }

  async replaceOrInsert(
    ctx: RunMutationCtx,
    oldDoc: TableAggregateDocument<T>,
    newDoc: TableAggregateDocument<T>
  ): Promise<void> {
    await this._replaceOrInsert(
      ctx,
      this.options.namespace?.(oldDoc),
      this.options.sortKey(oldDoc),
      this.options.namespace?.(newDoc),
      this.options.sortKey(newDoc),
      newDoc._id as TableAggregateId<T>,
      this.options.sumValue?.(newDoc)
    );
  }

  async indexOfDoc(
    ctx: RunQueryCtx,
    doc: TableAggregateDocument<T>,
    opts?: {
      id?: TableAggregateId<T>;
      bounds?: Bounds<T['Key'], TableAggregateId<T>>;
      order?: 'asc' | 'desc';
    }
  ): Promise<number> {
    return this.indexOf(ctx, this.options.sortKey(doc), {
      namespace: this.options.namespace?.(doc),
      ...opts,
    });
  }

  trigger<Ctx extends RunMutationCtx>(): TableAggregateTrigger<Ctx, T> {
    return async (ctx, change) => {
      if (change.operation === 'insert') {
        await this.insert(ctx, change.newDoc);
      } else if (change.operation === 'update') {
        await this.replace(ctx, change.oldDoc, change.newDoc);
      } else if (change.operation === 'delete') {
        await this.delete(ctx, change.oldDoc);
      }
    };
  }

  idempotentTrigger<Ctx extends RunMutationCtx>(): TableAggregateTrigger<
    Ctx,
    T
  > {
    return async (ctx, change) => {
      if (change.operation === 'insert') {
        await this.insertIfDoesNotExist(ctx, change.newDoc);
      } else if (change.operation === 'update') {
        await this.replaceOrInsert(ctx, change.oldDoc, change.newDoc);
      } else if (change.operation === 'delete') {
        await this.deleteIfExists(ctx, change.oldDoc);
      }
    };
  }
}

export type Trigger<
  Ctx,
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = (ctx: Ctx, change: Change<DataModel, TableName>) => Promise<void>;

export type Change<
  DataModel extends GenericDataModel,
  TableName extends TableNamesInDataModel<DataModel>,
> = {
  id: GenericId<TableName> | string;
} & (
  | {
      operation: 'insert';
      oldDoc: null;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: 'update';
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: DocumentByName<DataModel, TableName>;
    }
  | {
      operation: 'delete';
      oldDoc: DocumentByName<DataModel, TableName>;
      newDoc: null;
    }
);

export function btreeItemToAggregateItem<K extends Key, ID extends string>({
  k,
  s,
}: {
  k: unknown;
  s: number;
}): Item<K, ID> {
  const { key, id } = positionToKey(k as Position);
  return {
    id: id as ID,
    key: key as K,
    sumValue: s,
  };
}

export type NamespacedArgs<Args, TNamespace> =
  | (Args & { namespace: TNamespace })
  | (TNamespace extends undefined ? Args : never);

export type NamespacedOpts<Opts, TNamespace> =
  | [{ namespace: TNamespace } & Opts]
  | (undefined extends TNamespace ? [Opts?] : never);

export type NamespacedOptsBatch<Opts, TNamespace> = Array<
  undefined extends TNamespace ? Opts : { namespace: TNamespace } & Opts
>;

function namespaceFromArg<TNamespace>(
  args: { namespace: TNamespace } | object
): TNamespace {
  if ('namespace' in args) {
    return args.namespace as TNamespace;
  }
  return undefined as TNamespace;
}

function namespaceFromOpts<Opts, TNamespace>(
  opts: NamespacedOpts<Opts, TNamespace>
): TNamespace {
  if (opts.length === 0) {
    return undefined as TNamespace;
  }
  const [{ namespace }] = opts as [{ namespace: TNamespace }];
  return namespace;
}
