/* biome-ignore-all lint: Upstream aggregate btree logic preserved for parity. */
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from 'convex/server';
import {
  ConvexError,
  type Value as ConvexValue,
  convexToJson,
  type GenericId,
  jsonToConvex,
} from 'convex/values';
import { compareValues } from './compare.js';
import {
  AGGREGATE_NODE_TABLE,
  AGGREGATE_TREE_TABLE,
  type AggregateCounter as Aggregate,
  type AggregateItem as Item,
} from './schema.js';

type DatabaseReader = GenericDatabaseReader<any>;
type DatabaseWriter = GenericDatabaseWriter<any>;

type NodeId = GenericId<string>;
type TreeDoc = {
  aggregateName?: string;
  _id: GenericId<string>;
  maxNodeSize: number;
  namespace?: Namespace;
  root: NodeId;
};
type NodeDoc = {
  _id: NodeId;
  aggregate?: Aggregate;
  items: Item[];
  subtrees: NodeId[];
};

const BTREE_DEBUG = false;
export const DEFAULT_MAX_NODE_SIZE = 16;

export type Key = ConvexValue;
export type Value = ConvexValue;
export type Namespace = ConvexValue | undefined;

const LEGACY_AGGREGATE_NAME = '__legacy__';

export function p(v: ConvexValue): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function log(s: string) {
  if (BTREE_DEBUG) {
    console.log(s);
  }
}

function aggregateNameFromNamespace(namespace: Namespace): string {
  if (
    Array.isArray(namespace) &&
    namespace.length === 3 &&
    typeof namespace[0] === 'string' &&
    (namespace[2] === 0 || namespace[2] === 1)
  ) {
    return namespace[0];
  }
  return LEGACY_AGGREGATE_NAME;
}

export async function insertHandler(
  ctx: { db: DatabaseWriter },
  args: { key: Key; value: Value; summand?: number; namespace?: Namespace }
) {
  const tree = await getOrCreateTree(
    ctx.db,
    args.namespace,
    DEFAULT_MAX_NODE_SIZE,
    true
  );
  const summand = args.summand ?? 0;
  const pushUp = await insertIntoNode(ctx, args.namespace, tree.root, {
    k: args.key,
    v: args.value,
    s: summand,
  });
  if (pushUp) {
    const total =
      pushUp.leftSubtreeCount &&
      pushUp.rightSubtreeCount &&
      add(
        add(pushUp.leftSubtreeCount, pushUp.rightSubtreeCount),
        itemAggregate(pushUp.item)
      );
    const newRoot = await ctx.db.insert(AGGREGATE_NODE_TABLE, {
      items: [pushUp.item],
      subtrees: [pushUp.leftSubtree, pushUp.rightSubtree],
      aggregate: total,
    });
    await ctx.db.patch(tree._id, {
      root: newRoot,
    });
  }
}

export async function deleteHandler(
  ctx: { db: DatabaseWriter },
  args: { key: Key; namespace?: Namespace }
) {
  const tree = await getOrCreateTree(
    ctx.db,
    args.namespace,
    DEFAULT_MAX_NODE_SIZE,
    true
  );
  await deleteFromNode(ctx, args.namespace, tree.root, args.key);
  const root = (await ctx.db.get(tree.root))!;
  if (root.items.length === 0 && root.subtrees.length === 1) {
    log(
      `collapsing root ${root._id} because its only child is ${root.subtrees[0]}`
    );
    await ctx.db.patch(tree._id, {
      root: root.subtrees[0],
    });
    if (root.aggregate === undefined) {
      // Maintain lazy root even when the root disappears.
      await ctx.db.patch(root.subtrees[0], {
        aggregate: undefined,
      });
    }
    await ctx.db.delete(root._id);
  }
}

export async function validateTree(
  ctx: { db: DatabaseReader },
  args: { namespace?: Namespace }
) {
  const tree = await getTree(ctx.db, args.namespace);
  if (!tree) {
    return;
  }
  await validateNode(ctx, args.namespace, tree.root, 0);
}

type ValidationResult = {
  min?: Key;
  max?: Key;
  height: number;
};

async function MAX_NODE_SIZE(
  ctx: { db: DatabaseReader },
  namespace: Namespace
) {
  const tree = await mustGetTree(ctx.db, namespace);
  return tree.maxNodeSize;
}

async function MIN_NODE_SIZE(
  ctx: { db: DatabaseReader },
  namespace: Namespace
) {
  const max = await MAX_NODE_SIZE(ctx, namespace);
  if (max % 2 !== 0 || max < 4) {
    throw new Error('MAX_NODE_SIZE must be even and at least 4');
  }
  return max / 2;
}

async function validateNode(
  ctx: { db: DatabaseReader },
  namespace: Namespace,
  node: NodeId,
  depth: number
): Promise<ValidationResult> {
  const n = (await ctx.db.get(node)) as NodeDoc | null;
  if (!n) {
    throw new ConvexError(`missing node ${node}`);
  }
  if (n.items.length > (await MAX_NODE_SIZE(ctx, namespace))) {
    throw new ConvexError(`node ${node} exceeds max size`);
  }
  if (depth > 0 && n.items.length < (await MIN_NODE_SIZE(ctx, namespace))) {
    throw new ConvexError(`non-root node ${node} has less than min-size`);
  }
  if (n.subtrees.length > 0 && n.items.length + 1 !== n.subtrees.length) {
    throw new ConvexError(`node ${node} keys do not match subtrees`);
  }
  if (n.subtrees.length > 0 && n.items.length === 0) {
    throw new ConvexError(`node ${node} one subtree but no keys`);
  }
  // Keys are in increasing order
  for (let i = 1; i < n.items.length; i++) {
    if (compareKeys(n.items[i - 1].k, n.items[i].k) !== -1) {
      throw new ConvexError(`node ${node} keys not in order`);
    }
  }
  const validatedSubtrees = await Promise.all(
    n.subtrees.map((subtree) =>
      validateNode(ctx, namespace, subtree, depth + 1)
    )
  );
  for (let i = 0; i < n.subtrees.length; i++) {
    // Each subtree's min is greater than the key at the prior index
    if (
      i > 0 &&
      compareKeys(validatedSubtrees[i].min!, n.items[i - 1].k) !== 1
    ) {
      throw new ConvexError(`subtree ${i} min is too small for node ${node}`);
    }
    // Each subtree's max is less than the key at the same index
    if (
      i < n.items.length &&
      compareKeys(validatedSubtrees[i].max!, n.items[i].k) !== -1
    ) {
      throw new ConvexError(`subtree ${i} max is too large for node ${node}`);
    }
  }
  // All subtrees have the same height.
  const heights = validatedSubtrees.map((s) => s.height);
  for (let i = 1; i < heights.length; i++) {
    if (heights[i] !== heights[0]) {
      throw new ConvexError(`subtree ${i} has different height from others`);
    }
  }

  // Node count matches sum of subtree counts plus key count.
  const counts = await subtreeCounts(ctx.db, n);
  const atNode = nodeCounts(n);
  const acc = add(accumulate(counts), accumulate(atNode));
  const nAggregate = await nodeAggregate(ctx.db, n);
  if (acc.count !== nAggregate.count) {
    throw new ConvexError(`node ${node} count does not match subtrees`);
  }

  // Node sum matches sum of subtree sums plus key sum.
  if (Math.abs(acc.sum - nAggregate.sum) > 0.0001) {
    throw new ConvexError(
      `node ${node} sum does not match subtrees ${acc.sum} !== ${nAggregate.sum}`
    );
  }

  const max =
    validatedSubtrees.length > 0
      ? validatedSubtrees[validatedSubtrees.length - 1].max
      : n.items[n.items.length - 1]?.k;
  const min =
    validatedSubtrees.length > 0 ? validatedSubtrees[0].min : n.items[0]?.k;
  const height = validatedSubtrees.length > 0 ? 1 + heights[0] : 0;
  return { min, max, height };
}

/// Count of keys that are *strictly* between k1 and k2.
/// If k1 or k2 are undefined, that bound is unlimited.
export async function aggregateBetweenHandler(
  ctx: { db: DatabaseReader },
  args: { k1?: Key; k2?: Key; namespace?: Namespace }
) {
  const tree = await getTree(ctx.db, args.namespace);
  if (tree === null) {
    return { count: 0, sum: 0 };
  }
  return await aggregateBetweenInNode(ctx.db, tree.root, args.k1, args.k2);
}

type WithinBounds =
  | {
      type: 'item';
      item: Item;
    }
  | {
      type: 'subtree';
      subtree: NodeId;
    };

async function filterBetween(
  db: DatabaseReader,
  node: NodeId,
  k1?: Key,
  k2?: Key
): Promise<WithinBounds[]> {
  const n = (await db.get(node))!;
  const included: (WithinBounds | Promise<WithinBounds[]>)[] = [];
  function includeSubtree(i: number, unboundedRight: boolean) {
    const unboundedLeft = k1 === undefined || included.length > 0;
    if (unboundedLeft && unboundedRight) {
      // Include the whole subtree
      included.push({ type: 'subtree', subtree: n.subtrees[i] });
    } else {
      // Recurse into the first or last subtree
      included.push(
        filterBetween(
          db,
          n.subtrees[i],
          unboundedLeft ? undefined : k1,
          unboundedRight ? undefined : k2
        )
      );
    }
  }
  let done = false;
  for (let i = 0; i < n.items.length; i++) {
    const k1IsLeft = k1 === undefined || compareKeys(k1, n.items[i].k) === -1;
    const k2IsRight = k2 === undefined || compareKeys(k2, n.items[i].k) === 1;
    if (k1IsLeft && n.subtrees.length > 0) {
      // We definitely want to include items from n.subtrees[i],
      includeSubtree(i, k2IsRight);
    }
    if (!k2IsRight) {
      // We've reached the right bound, so we're done.
      done = true;
      break;
    }
    if (k1IsLeft) {
      included.push({ type: 'item', item: n.items[i] });
    }
  }
  if (!done && n.subtrees.length > 0) {
    // Check the rightmost subtree
    includeSubtree(n.subtrees.length - 1, k2 === undefined);
  }
  return (await Promise.all(included)).flat(1);
}

async function aggregateBetweenInNode(
  db: DatabaseReader,
  node: NodeId,
  k1?: Key,
  k2?: Key
): Promise<Aggregate> {
  const filtered = await filterBetween(db, node, k1, k2);
  const counts = await Promise.all(
    filtered.map(async (included) => {
      if (included.type === 'item') {
        return itemAggregate(included.item);
      }
      const subtree = (await db.get(included.subtree))!;
      return await nodeAggregate(db, subtree);
    })
  );
  let count = { count: 0, sum: 0 };
  for (const c of counts) {
    count = add(count, c);
  }
  return count;
}

export async function getHandler(
  ctx: { db: DatabaseReader },
  args: { key: Key; namespace?: Namespace }
) {
  const tree = (await getTree(ctx.db, args.namespace))!;
  return await getInNode(ctx.db, tree.root, args.key);
}

async function getInNode(
  db: DatabaseReader,
  node: NodeId,
  key: Key
): Promise<Item | null> {
  const n = (await db.get(node))!;
  let i = 0;
  for (; i < n.items.length; i++) {
    const compare = compareKeys(key, n.items[i].k);
    if (compare === -1) {
      // if key < n.keys[i], recurse to the left of index i
      break;
    }
    if (compare === 0) {
      return n.items[i];
    }
  }
  if (n.subtrees.length === 0) {
    return null;
  }
  return await getInNode(db, n.subtrees[i], key);
}

export async function atOffsetHandler(
  ctx: { db: DatabaseReader },
  args: { offset: number; k1?: Key; k2?: Key; namespace?: Namespace }
) {
  if (args.offset < 0) {
    throw new Error('offset must be non-negative');
  }
  if (!Number.isInteger(args.offset)) {
    throw new Error('offset must be an integer');
  }
  const tree = await getTree(ctx.db, args.namespace);
  if (tree === null) {
    throw new ConvexError('tree is empty');
  }
  return await atOffsetInNode(ctx.db, tree.root, args.offset, args.k1, args.k2);
}

export async function atNegativeOffsetHandler(
  ctx: { db: DatabaseReader },
  args: { offset: number; k1?: Key; k2?: Key; namespace?: Namespace }
) {
  if (args.offset < 0) {
    throw new Error('offset must be non-negative');
  }
  if (!Number.isInteger(args.offset)) {
    throw new Error('offset must be an integer');
  }
  const tree = await getTree(ctx.db, args.namespace);
  if (tree === null) {
    throw new ConvexError('tree is empty');
  }
  return await negativeOffsetInNode(
    ctx.db,
    tree.root,
    args.offset,
    args.k1,
    args.k2
  );
}

export async function offsetHandler(
  ctx: { db: DatabaseReader },
  args: { key: Key; k1?: Key; namespace?: Namespace }
) {
  return (
    await aggregateBetweenHandler(ctx, {
      k1: args.k1,
      k2: args.key,
      namespace: args.namespace,
    })
  ).count;
}

// Returns the offset of the smallest key >= the given target key.
export async function offsetUntilHandler(
  ctx: { db: DatabaseReader },
  args: { key: Key; k2?: Key; namespace?: Namespace }
) {
  return (
    await aggregateBetweenHandler(ctx, {
      k1: args.key,
      k2: args.k2,
      namespace: args.namespace,
    })
  ).count;
}

// Returns the offset of the smallest key >= the given target key.
async function deleteFromNode(
  ctx: { db: DatabaseWriter },
  namespace: Namespace,
  node: NodeId,
  key: Key
): Promise<Item | null> {
  let n = (await ctx.db.get(node))!;
  let foundItem: null | Item = null;
  let i = 0;
  for (; i < n.items.length; i++) {
    const compare = compareKeys(key, n.items[i].k);
    if (compare === -1) {
      // if key < n.keys[i], recurse to the left of index i
      break;
    }
    if (compare === 0) {
      log(`found key ${p(key)} in node ${n._id}`);
      // we've found the key. delete it.
      if (n.subtrees.length === 0) {
        // if this is a leaf node, just delete the key
        await ctx.db.patch(node, {
          items: [...n.items.slice(0, i), ...n.items.slice(i + 1)],
          aggregate: n.aggregate && sub(n.aggregate, itemAggregate(n.items[i])),
        });
        return n.items[i];
      }
      // if this is an internal node, replace the key with the predecessor
      const predecessor = await negativeOffsetInNode(ctx.db, n.subtrees[i], 0);
      log(`replacing ${p(key)} with predecessor ${p(predecessor.k)}`);
      foundItem = n.items[i];
      await ctx.db.patch(node, {
        items: [...n.items.slice(0, i), predecessor, ...n.items.slice(i + 1)],
        // In this intermediate state, we have removed the foundItem and effectively duplicated the predecessor.
        aggregate:
          n.aggregate &&
          sub(
            add(n.aggregate, itemAggregate(predecessor)),
            itemAggregate(n.items[i])
          ),
      });
      n = (await ctx.db.get(node))!;
      // From now on, we're deleting the predecessor from the left subtree
      key = predecessor.k;
      break;
    }
  }
  // delete from subtree i
  if (n.subtrees.length === 0) {
    throw new ConvexError({
      code: 'DELETE_MISSING_KEY',
      message: `key ${p(key)} not found in node ${n._id}`,
    });
  }
  const deleted = await deleteFromNode(ctx, namespace, n.subtrees[i], key);
  if (!deleted) {
    return null;
  }
  if (!foundItem) {
    foundItem = deleted;
  }
  const newAggregate = n.aggregate && sub(n.aggregate, itemAggregate(deleted));
  if (newAggregate) {
    await ctx.db.patch(node, {
      aggregate: newAggregate,
    });
  }

  // Now we need to check if the subtree at index i is too small
  const deficientSubtree = (await ctx.db.get(n.subtrees[i]))!;
  const minNodeSize = await MIN_NODE_SIZE(ctx, namespace);
  if (deficientSubtree.items.length < minNodeSize) {
    log(`deficient subtree ${deficientSubtree._id}`);
    // If the subtree is too small, we need to rebalance
    if (i > 0) {
      // Try to move a key from the left sibling
      const leftSibling = (await ctx.db.get(n.subtrees[i - 1]))!;
      if (leftSibling.items.length > minNodeSize) {
        log(`rotating right with left sibling ${leftSibling._id}`);
        // Rotate right
        const grandchild = leftSibling.subtrees.length
          ? await ctx.db.get(
              leftSibling.subtrees[leftSibling.subtrees.length - 1]
            )
          : null;
        const grandchildCount = grandchild
          ? grandchild.aggregate
          : { count: 0, sum: 0 };
        await ctx.db.patch(deficientSubtree._id, {
          items: [n.items[i - 1], ...deficientSubtree.items],
          subtrees: grandchild
            ? [grandchild._id, ...deficientSubtree.subtrees]
            : [],
          aggregate:
            deficientSubtree.aggregate &&
            grandchildCount &&
            add(
              add(deficientSubtree.aggregate, grandchildCount),
              itemAggregate(n.items[i - 1])
            ),
        });
        await ctx.db.patch(leftSibling._id, {
          items: leftSibling.items.slice(0, leftSibling.items.length - 1),
          subtrees: grandchild
            ? leftSibling.subtrees.slice(0, leftSibling.subtrees.length - 1)
            : [],
          aggregate:
            leftSibling.aggregate &&
            grandchildCount &&
            sub(
              sub(leftSibling.aggregate, grandchildCount),
              itemAggregate(leftSibling.items[leftSibling.items.length - 1])
            ),
        });
        await ctx.db.patch(node, {
          items: [
            ...n.items.slice(0, i - 1),
            leftSibling.items[leftSibling.items.length - 1],
            ...n.items.slice(i),
          ],
        });
        return foundItem;
      }
    }
    if (i < n.subtrees.length - 1) {
      // Try to move a key from the right sibling
      const rightSibling = (await ctx.db.get(n.subtrees[i + 1]))!;
      if (rightSibling.items.length > minNodeSize) {
        log(`rotating left with right sibling ${rightSibling._id}`);
        // Rotate left
        const grandchild = rightSibling.subtrees.length
          ? await ctx.db.get(rightSibling.subtrees[0])
          : null;
        const grandchildCount = grandchild
          ? grandchild.aggregate
          : { count: 0, sum: 0 };
        await ctx.db.patch(deficientSubtree._id, {
          items: [...deficientSubtree.items, n.items[i]],
          subtrees: grandchild
            ? [...deficientSubtree.subtrees, grandchild._id]
            : [],
          aggregate:
            deficientSubtree.aggregate &&
            grandchildCount &&
            add(
              add(deficientSubtree.aggregate, grandchildCount),
              itemAggregate(n.items[i])
            ),
        });
        await ctx.db.patch(rightSibling._id, {
          items: rightSibling.items.slice(1),
          subtrees: grandchild ? rightSibling.subtrees.slice(1) : [],
          aggregate:
            rightSibling.aggregate &&
            grandchildCount &&
            sub(
              sub(rightSibling.aggregate, grandchildCount),
              itemAggregate(rightSibling.items[0])
            ),
        });
        await ctx.db.patch(node, {
          items: [
            ...n.items.slice(0, i),
            rightSibling.items[0],
            ...n.items.slice(i + 1),
          ],
        });
        return foundItem;
      }
    }
    // If we can't rotate, we need to merge
    if (i > 0) {
      log('merging with left sibling');
      // Merge with left sibling
      await mergeNodes(ctx.db, n, i - 1);
    } else {
      log('merging with right sibling');
      // Merge with right sibling
      await mergeNodes(ctx.db, n, i);
    }
  }
  return foundItem;
}

async function mergeNodes(
  db: DatabaseWriter,
  parent: NodeDoc,
  leftIndex: number
) {
  const left = (await db.get(parent.subtrees[leftIndex]))!;
  const right = (await db.get(parent.subtrees[leftIndex + 1]))!;
  log(`merging ${right._id} into ${left._id}`);
  await db.patch(left._id, {
    items: [...left.items, parent.items[leftIndex], ...right.items],
    subtrees: [...left.subtrees, ...right.subtrees],
    aggregate:
      left.aggregate &&
      right.aggregate &&
      add(
        add(left.aggregate, right.aggregate),
        itemAggregate(parent.items[leftIndex])
      ),
  });
  await db.patch(parent._id, {
    items: [
      ...parent.items.slice(0, leftIndex),
      ...parent.items.slice(leftIndex + 1),
    ],
    subtrees: [
      ...parent.subtrees.slice(0, leftIndex + 1),
      ...parent.subtrees.slice(leftIndex + 2),
    ],
  });
  await db.delete(right._id);
}

// index 0 starts at the right
async function negativeOffsetInNode(
  db: DatabaseReader,
  node: NodeId,
  index: number,
  k1?: Key,
  k2?: Key
): Promise<Item> {
  const filtered = await filterBetween(db, node, k1, k2);
  for (const included of filtered.reverse()) {
    if (included.type === 'item') {
      if (index === 0) {
        return included.item;
      }
      index -= 1;
    } else {
      const subtree = (await db.get(included.subtree))!;
      const subtreeCount = (await nodeAggregate(db, subtree)).count;
      if (index < subtreeCount) {
        return await negativeOffsetInNode(db, included.subtree, index);
      }
      index -= subtreeCount;
    }
  }
  throw new ConvexError(
    `negative offset exceeded count by ${index} (in node ${node})`
  );
}

async function atOffsetInNode(
  db: DatabaseReader,
  node: NodeId,
  index: number,
  k1?: Key,
  k2?: Key
): Promise<Item> {
  const filtered = await filterBetween(db, node, k1, k2);
  for (const included of filtered) {
    if (included.type === 'item') {
      if (index === 0) {
        return included.item;
      }
      index -= 1;
    } else {
      const subtree = (await db.get(included.subtree))!;
      const subtreeCount = (await nodeAggregate(db, subtree)).count;
      if (index < subtreeCount) {
        return await atOffsetInNode(db, included.subtree, index);
      }
      index -= subtreeCount;
    }
  }
  throw new ConvexError(`offset exceeded count by ${index} (in node ${node})`);
}

function itemAggregate(item: Item): Aggregate {
  return { count: 1, sum: item.s };
}

function nodeCounts(node: NodeDoc): Aggregate[] {
  return node.items.map(itemAggregate);
}

async function subtreeCounts(db: DatabaseReader, node: NodeDoc) {
  return await Promise.all(
    node.subtrees.map(async (subtree) => {
      const s = (await db.get(subtree))!;
      return nodeAggregate(db, s);
    })
  );
}

async function nodeAggregate(
  db: DatabaseReader,
  node: NodeDoc
): Promise<Aggregate> {
  if (node.aggregate !== undefined) {
    return node.aggregate;
  }
  const subCounts = await subtreeCounts(db, node);
  return add(accumulate(nodeCounts(node)), accumulate(subCounts));
}

function add(a: Aggregate, b: Aggregate) {
  return {
    count: a.count + b.count,
    sum: a.sum + b.sum,
  };
}

function sub(a: Aggregate, b: Aggregate) {
  return {
    count: a.count - b.count,
    sum: a.sum - b.sum,
  };
}

function accumulate(nums: Aggregate[]) {
  return nums.reduce(add, { count: 0, sum: 0 });
}

type PushUp = {
  leftSubtree: NodeId;
  rightSubtree: NodeId;
  leftSubtreeCount?: Aggregate;
  rightSubtreeCount?: Aggregate;
  item: Item;
};

async function insertIntoNode(
  ctx: { db: DatabaseWriter },
  namespace: Namespace,
  node: NodeId,
  item: Item
): Promise<PushUp | null> {
  const n = (await ctx.db.get(node))!;
  let i = 0;
  for (; i < n.items.length; i++) {
    const compare = compareKeys(item.k, n.items[i].k);
    if (compare === -1) {
      // if key < n.keys[i], we've found the index.
      break;
    }
    if (compare === 0) {
      throw new ConvexError(`key ${p(item.k)} already exists in node ${n._id}`);
    }
  }
  // insert key before index i
  if (n.subtrees.length > 0) {
    // insert into subtree
    const pushUp = await insertIntoNode(ctx, namespace, n.subtrees[i], item);
    if (pushUp) {
      await ctx.db.patch(node, {
        items: [...n.items.slice(0, i), pushUp.item, ...n.items.slice(i)],
        subtrees: [
          ...n.subtrees.slice(0, i),
          pushUp.leftSubtree,
          pushUp.rightSubtree,
          ...n.subtrees.slice(i + 1),
        ],
      });
    }
  } else {
    await ctx.db.patch(node, {
      items: [...n.items.slice(0, i), item, ...n.items.slice(i)],
    });
  }
  const newAggregate = n.aggregate && add(n.aggregate, itemAggregate(item));
  if (newAggregate) {
    await ctx.db.patch(node, {
      aggregate: newAggregate,
    });
  }

  const newN = (await ctx.db.get(node))!;
  const maxNodeSize = await MAX_NODE_SIZE(ctx, namespace);
  const minNodeSize = await MIN_NODE_SIZE(ctx, namespace);
  if (newN.items.length > maxNodeSize) {
    if (
      newN.items.length !== maxNodeSize + 1 ||
      newN.items.length !== 2 * minNodeSize + 1
    ) {
      throw new Error(`bad ${newN.items.length}`);
    }
    log(`splitting node ${newN._id} at ${newN.items[minNodeSize].k}`);
    const topLevel = nodeCounts(newN);
    const subCounts = await subtreeCounts(ctx.db, newN);
    const leftCount = add(
      accumulate(topLevel.slice(0, minNodeSize)),
      accumulate(subCounts.length ? subCounts.slice(0, minNodeSize + 1) : [])
    );
    const rightCount = add(
      accumulate(topLevel.slice(minNodeSize + 1)),
      accumulate(subCounts.length ? subCounts.slice(minNodeSize + 1) : [])
    );
    if (
      newN.aggregate &&
      leftCount.count + rightCount.count + 1 !== newN.aggregate.count
    ) {
      throw new Error(
        `bad count split ${leftCount.count} ${rightCount.count} ${newN.aggregate.count}`
      );
    }
    // Sanity check that we split the sum across our new children correctly.
    // To avoid floating point imprecision, allow for some slight difference.
    if (
      newN.aggregate &&
      Math.abs(
        leftCount.sum +
          rightCount.sum +
          newN.items[minNodeSize].s -
          newN.aggregate.sum
      ) > 0.000_01
    ) {
      throw new Error(
        `bad sum split ${leftCount.sum} ${rightCount.sum} ${newN.items[minNodeSize].s} ${newN.aggregate.sum}`
      );
    }
    await ctx.db.patch(node, {
      items: newN.items.slice(0, minNodeSize),
      subtrees: newN.subtrees.length
        ? newN.subtrees.slice(0, minNodeSize + 1)
        : [],
      aggregate: leftCount,
    });
    const splitN = await ctx.db.insert(AGGREGATE_NODE_TABLE, {
      items: newN.items.slice(minNodeSize + 1),
      subtrees: newN.subtrees.length
        ? newN.subtrees.slice(minNodeSize + 1)
        : [],
      aggregate: rightCount,
    });
    return {
      item: newN.items[minNodeSize],
      leftSubtree: node,
      rightSubtree: splitN,
      leftSubtreeCount: newN.aggregate && leftCount,
      rightSubtreeCount: newN.aggregate && rightCount,
    };
  }
  return null;
}

function compareKeys(k1: Key, k2: Key) {
  return compareValues(k1, k2);
}

export async function getTree(db: DatabaseReader, namespace: Namespace) {
  return await db
    .query(AGGREGATE_TREE_TABLE)
    .withIndex('by_namespace', (q) => q.eq('namespace', namespace))
    .unique();
}

export async function mustGetTree(db: DatabaseReader, namespace: Namespace) {
  const tree = await getTree(db, namespace);
  if (!tree) {
    throw new Error('btree not initialized');
  }
  return tree;
}

export async function getOrCreateTree(
  db: DatabaseWriter,
  namespace: Namespace,
  maxNodeSize?: number,
  rootLazy?: boolean
): Promise<TreeDoc> {
  const originalTree = await getTree(db, namespace);
  const aggregateName = aggregateNameFromNamespace(namespace);
  if (originalTree) {
    if (originalTree.aggregateName !== aggregateName) {
      await db.patch(originalTree._id, { aggregateName });
      return { ...originalTree, aggregateName };
    }
    return originalTree;
  }
  const root = await db.insert(AGGREGATE_NODE_TABLE, {
    items: [],
    subtrees: [],
    aggregate: {
      count: 0,
      sum: 0,
    },
  });
  const effectiveMaxNodeSize =
    maxNodeSize ??
    (await MAX_NODE_SIZE({ db }, undefined)) ??
    DEFAULT_MAX_NODE_SIZE;
  const effectiveRootLazy =
    rootLazy ?? (await isRootLazy(db, undefined)) ?? true;
  const id = await db.insert(AGGREGATE_TREE_TABLE, {
    aggregateName,
    root,
    maxNodeSize: effectiveMaxNodeSize,
    namespace,
  });
  const newTree = await db.get(id);
  // Check the maxNodeSize is valid.
  await MIN_NODE_SIZE({ db }, namespace);
  if (effectiveRootLazy) {
    await db.patch(root, { aggregate: undefined });
  }
  return newTree!;
}

async function isRootLazy(
  db: DatabaseReader,
  namespace: Namespace
): Promise<boolean> {
  const tree = await getTree(db, namespace);
  if (!tree) {
    return true;
  }
  return (await db.get(tree.root))?.aggregate === undefined;
}

export async function deleteTreeNodes(
  db: DatabaseWriter,
  node: NodeId
): Promise<void> {
  const current = (await db.get(node)) as NodeDoc | null;
  if (!current) {
    return;
  }
  for (const subtree of current.subtrees) {
    await deleteTreeNodes(db, subtree);
  }
  await db.delete(node);
}

export async function clearTree(
  db: DatabaseWriter,
  args: {
    maxNodeSize?: number;
    namespace?: Namespace;
    rootLazy?: boolean;
  }
): Promise<void> {
  const tree = await getTree(db, args.namespace);
  let existingRootLazy = true;
  let existingMaxNodeSize = DEFAULT_MAX_NODE_SIZE;
  if (tree) {
    await db.delete(tree._id);
    const root = (await db.get(tree.root)) as NodeDoc | null;
    if (root) {
      existingRootLazy = root.aggregate === undefined;
      await deleteTreeNodes(db, tree.root);
    }
    existingMaxNodeSize = tree.maxNodeSize;
  }
  await getOrCreateTree(
    db,
    args.namespace,
    args.maxNodeSize ?? existingMaxNodeSize,
    args.rootLazy ?? existingRootLazy
  );
}

export async function paginateHandler(
  ctx: { db: DatabaseReader },
  args: {
    limit: number;
    order: 'asc' | 'desc';
    cursor?: string;
    k1?: Key;
    k2?: Key;
    namespace?: Namespace;
  }
) {
  const tree = await getTree(ctx.db, args.namespace);
  if (tree === null) {
    return { page: [], cursor: '', isDone: true };
  }
  return await paginateInNode(
    ctx.db,
    tree.root,
    args.limit,
    args.order,
    args.cursor,
    args.k1,
    args.k2
  );
}

export async function paginateInNode(
  db: DatabaseReader,
  node: NodeId,
  limit: number,
  order: 'asc' | 'desc',
  cursor?: string,
  k1?: Key,
  k2?: Key
): Promise<{
  page: Item[];
  cursor: string;
  isDone: boolean;
}> {
  if (limit <= 0) {
    throw new ConvexError('limit must be positive');
  }
  if (cursor !== undefined && cursor.length === 0) {
    // Empty string is end cursor.
    return {
      page: [],
      cursor: '',
      isDone: true,
    };
  }
  const items: Item[] = [];
  const startKey =
    cursor === undefined || order === 'desc'
      ? k1
      : jsonToConvex(JSON.parse(cursor));
  const endKey =
    cursor === undefined || order === 'asc'
      ? k2
      : jsonToConvex(JSON.parse(cursor));
  const filtered = await filterBetween(db, node, startKey, endKey);
  if (order === 'desc') {
    filtered.reverse();
  }
  for (const included of filtered) {
    if (items.length >= limit) {
      // There's still more but the page is full.
      return {
        page: items,
        cursor: JSON.stringify(convexToJson(items[items.length - 1].k)),
        isDone: false,
      };
    }
    if (included.type === 'item') {
      items.push(included.item);
    } else {
      const {
        page,
        cursor: newCursor,
        isDone,
      } = await paginateInNode(
        db,
        included.subtree,
        limit - items.length,
        order
      );
      items.push(...page);
      if (!isDone) {
        return {
          page: items,
          cursor: newCursor,
          isDone: false,
        };
      }
    }
  }
  return {
    page: items,
    cursor: '',
    isDone: true,
  };
}

export async function paginateNamespacesHandler(
  ctx: { db: DatabaseReader },
  args: { aggregateName?: string; limit: number; cursor?: string }
) {
  if (args.cursor === 'endcursor') {
    return {
      page: [],
      cursor: 'endcursor',
      isDone: true,
    };
  }
  const baseQuery =
    args.aggregateName === undefined
      ? ctx.db.query(AGGREGATE_TREE_TABLE)
      : ctx.db
          .query(AGGREGATE_TREE_TABLE)
          .withIndex('by_aggregate_name', (q) =>
            q.eq('aggregateName', args.aggregateName!)
          );
  const {
    page: trees,
    continueCursor,
    isDone,
  } = await baseQuery.paginate({
    cursor: args.cursor ?? null,
    numItems: args.limit,
  });
  return {
    page: trees.map((t) => t.namespace ?? null),
    cursor: isDone ? 'endcursor' : (continueCursor ?? 'endcursor'),
    isDone,
  };
}

export async function aggregateBetweenBatchHandler(
  ctx: { db: DatabaseReader },
  args: { queries: Array<{ k1?: Key; k2?: Key; namespace?: Namespace }> }
) {
  return await Promise.all(
    args.queries.map((query) => aggregateBetweenHandler(ctx, query))
  );
}

// Differs from atOffset in that it handles negative offsets.
export async function atOffsetBatchHandler(
  ctx: { db: DatabaseReader },
  args: {
    queries: Array<{
      offset: number;
      k1?: Key;
      k2?: Key;
      namespace?: Namespace;
    }>;
  }
) {
  return await Promise.all(
    args.queries.map((query) =>
      query.offset >= 0
        ? atOffsetHandler(ctx, query)
        : atNegativeOffsetHandler(ctx, {
            ...query,
            offset: -query.offset - 1,
          })
    )
  );
}
