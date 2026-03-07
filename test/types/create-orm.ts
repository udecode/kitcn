import {
  convexTable,
  createOrm,
  defineRelations,
  defineSchema,
  defineSchemaExtension,
  type ExtractTablesFromSchema,
  type GenericOrm,
  type GenericOrmCtx,
  text,
} from 'better-convex/orm';
import type {
  GenericDatabaseReader,
  GenericDatabaseWriter,
  SchedulableFunctionReference,
} from 'convex/server';
import { users } from './tables-rel';
import { type Equal, Expect, IsAny } from './utils';

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

const schemaConfig = defineRelations({ users });
const mockDb = {} as GenericDatabaseWriter<any>;
const mockReader = {} as GenericDatabaseReader<any>;

const orm = createOrm({ schema: schemaConfig });
const db = orm.db(mockDb);
const dbReader = orm.db(mockReader);

const ratelimitExtension = defineSchemaExtension('ratelimit', {
  ratelimitState: convexTable('ratelimit_state', {
    name: text().notNull(),
  }),
  ratelimitDynamicLimit: convexTable('ratelimit_dynamic_limit', {
    prefix: text().notNull(),
  }),
  ratelimitProtectionHit: convexTable('ratelimit_protection_hit', {
    value: text().notNull(),
  }),
});

const extensionUsers = convexTable('users_extension_types', {
  name: text().notNull(),
});
const extensionSchema = defineSchema({ extensionUsers }).extend(
  ratelimitExtension
);
type ExtensionTables = ExtractTablesFromSchema<typeof extensionSchema>;
Expect<Equal<HasKey<ExtensionTables, 'extensionUsers'>, true>>();
Expect<Equal<HasKey<ExtensionTables, 'ratelimitState'>, true>>();
Expect<Equal<HasKey<ExtensionTables, 'ratelimitDynamicLimit'>, true>>();
Expect<Equal<HasKey<ExtensionTables, 'ratelimitProtectionHit'>, true>>();

{
  const _writer = db;
  _writer.skipRules.query.users.findMany;
  // @ts-expect-error - skipRules does not itself have skipRules
  _writer.skipRules.skipRules;
}

{
  const _reader = dbReader;
  _reader.skipRules.query.users.findMany;
  // @ts-expect-error - skipRules does not itself have skipRules
  _reader.skipRules.skipRules;
  // @ts-expect-error - insert is not available on a reader db
  _reader.insert;
}

type ReaderCtx = { db: GenericDatabaseReader<any> };
type WriterCtx = { db: GenericDatabaseWriter<any> };
type ReaderOrm = GenericOrm<ReaderCtx, typeof schemaConfig>;
type WriterOrm = GenericOrm<WriterCtx, typeof schemaConfig>;
type ReaderOrWriterOrm = GenericOrm<ReaderCtx | WriterCtx, typeof schemaConfig>;
type ReaderWithOrmCtx = GenericOrmCtx<ReaderCtx, typeof schemaConfig>;
type WriterWithOrmCtx = GenericOrmCtx<WriterCtx, typeof schemaConfig>;
type ReaderOrWriterWithOrmCtx = GenericOrmCtx<
  ReaderCtx | WriterCtx,
  typeof schemaConfig
>;

{
  const _readerOrm = {} as ReaderOrm;
  _readerOrm.query.users.findMany;
  _readerOrm.skipRules.query.users.findMany;
  // @ts-expect-error - insert is not available on reader orm
  _readerOrm.insert;
}

{
  const _writerOrm = {} as WriterOrm;
  _writerOrm.insert(users).values({ name: 'Ada', email: 'ada@example.com' });
  _writerOrm.skipRules
    .insert(users)
    .values({ name: 'Ada', email: 'ada@example.com' });
}

{
  const _readerOrWriterOrm = {} as ReaderOrWriterOrm;
  _readerOrWriterOrm.query.users.findMany;
  // @ts-expect-error - insert is not safe on reader|writer union
  _readerOrWriterOrm.insert;
}
Expect<Equal<ReaderWithOrmCtx['orm'], ReaderOrm>>;
Expect<Equal<WriterWithOrmCtx['orm'], WriterOrm>>;
Expect<Equal<ReaderOrWriterWithOrmCtx['orm'], ReaderOrWriterOrm>>;

// ORM db intentionally does NOT expose raw Convex db methods. It only exposes:
// - `query.*` builders
// - `insert/update/delete(table)` ORM mutation builders
// - `system` passthrough for system tables
// (Raw writes bypass constraints/defaults/RLS.)
// @ts-expect-error - raw Convex get is not exposed on ORM db
db.get;
// @ts-expect-error - raw Convex patch is not exposed on ORM db
db.patch;
// @ts-expect-error - raw Convex replace is not exposed on ORM db
db.replace;
// @ts-expect-error - insert expects a ConvexTable, not a tableName string
db.insert('users');

{
  const result = await db.query.users.findMany({ limit: 1 });
  Expect<Equal<false, IsAny<typeof result>>>;
}

// Raw Convex db methods should NOT be exposed on `ctx.orm`.
// (They bypass ORM runtime checks like constraints/defaults/RLS.)
// @ts-expect-error - patch is a raw Convex writer method (not exposed)
db.patch;
// @ts-expect-error - get is a raw Convex reader method (not exposed)
db.get;
// @ts-expect-error - raw insert by table name is not exposed (use insert(users).values(...))
db.insert('users', { name: 'Ada' });

// @ts-expect-error - api() is only available when ormFunctions are provided
orm.api();

const schedulable = {} as SchedulableFunctionReference;

const ormWithScheduling = createOrm({
  schema: schemaConfig,
  ormFunctions: {
    scheduledMutationBatch: schedulable,
    scheduledDelete: schedulable,
  },
});

const api = ormWithScheduling.api();
api.scheduledMutationBatch;
api.scheduledDelete;
