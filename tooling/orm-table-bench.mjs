#!/usr/bin/env node
// Cold-start cost of a kitcn ORM schema, one fresh Node process per sample.
//
//   node tooling/orm-table-bench.mjs [--pkg packages/kitcn] [--runs 15]
//     [--tables 200] [--touch 17]
//
// Run `bun --cwd packages/kitcn build` first; the bench imports the built dist.
// Module import time is excluded. Each sample times, after imports:
//   schema    declare every table, then defineSchema(...).relations(...)
//   createOrm createOrm({ schema, capabilities: [aggregateCapability()] })
//   firstCall orm.db(reader) and one findFirst on each of `--touch` tables,
//             against an in-memory reader that returns no rows
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const pkg = path.resolve(option('pkg', 'packages/kitcn'));
const runs = Number(option('runs', '15'));
const tableCount = Number(option('tables', '200'));
const touchCount = Number(option('touch', '17'));

const createReader = () => {
  const query = {
    withIndex: () => query,
    withSearchIndex: () => query,
    filter: () => query,
    order: () => query,
    take: async () => [],
    first: async () => null,
    unique: async () => null,
    collect: async () => [],
    paginate: async () => ({ page: [], isDone: true, continueCursor: '' }),
    async *[Symbol.asyncIterator]() {},
  };
  return {
    query: () => query,
    get: async () => null,
    normalizeId: () => null,
    system: {},
  };
};

const sample = async () => {
  const orm = await import(pathToFileURL(path.join(pkg, 'dist/orm/index.js')));
  const { aggregateCapability } = await import(
    pathToFileURL(path.join(pkg, 'dist/orm/aggregate-index/index.js'))
  );
  const {
    aggregateIndex,
    boolean,
    convexTable,
    createOrm,
    defineSchema,
    id,
    index,
    integer,
    searchIndex,
    text,
    uniqueIndex,
  } = orm;

  const t0 = performance.now();
  const tables = {};
  for (let i = 0; i < tableCount; i++) {
    const name = `t${i}`;
    const owner = tables.t0;
    tables[name] = convexTable(
      name,
      {
        name: text().notNull(),
        slug: text().notNull(),
        count: integer(),
        active: boolean(),
        note: text(),
        ownerId: owner ? id('t0').references(() => owner.id) : id('t0'),
      },
      (t) => [
        index(`${name}_by_name`).on(t.name),
        index(`${name}_by_owner`).on(t.ownerId, t.active),
        uniqueIndex(`${name}_by_slug`).on(t.slug),
        ...(i % 10 === 0 ? [searchIndex(`${name}_search`).on(t.name)] : []),
        ...(i === 1
          ? [aggregateIndex(`${name}_by_owner_count`).on(t.ownerId)]
          : []),
      ]
    );
  }
  const schema = defineSchema(tables).relations((r) => {
    const config = {};
    for (let i = 1; i <= 14; i++) {
      config[`t${i}`] = {
        owner: r.one.t0({ from: r[`t${i}`].ownerId, to: r.t0.id }),
      };
    }
    return config;
  });
  const t1 = performance.now();
  const client = createOrm({ schema, capabilities: [aggregateCapability()] });
  const t2 = performance.now();
  const db = client.db(createReader());
  for (let i = 0; i < touchCount; i++) {
    await db.query[`t${i}`].findFirst({ where: { name: 'x' } });
  }
  const t3 = performance.now();
  return {
    schema: t1 - t0,
    createOrm: t2 - t1,
    firstCall: t3 - t2,
    total: t3 - t0,
  };
};

if (args.includes('--child')) {
  process.stdout.write(`${JSON.stringify(await sample())}\n`);
} else {
  const samples = [];
  for (let run = 0; run < runs; run++) {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), '--child', ...args],
      { encoding: 'utf8' }
    );
    if (child.status !== 0) {
      throw new Error(child.stderr || `sample ${run} failed`);
    }
    samples.push(JSON.parse(child.stdout));
  }
  const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  };
  process.stdout.write(
    `${pkg} | ${tableCount} tables, ${touchCount} touched, ${runs} runs (ms, p50 / p90)\n`
  );
  for (const key of ['schema', 'createOrm', 'firstCall', 'total']) {
    const values = samples.map((entry) => entry[key]);
    process.stdout.write(
      `${key.padEnd(10)} ${quantile(values, 0.5).toFixed(2).padStart(8)} / ${quantile(values, 0.9).toFixed(2).padStart(8)}\n`
    );
  }
}
