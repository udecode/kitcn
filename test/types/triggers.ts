import { TableAggregate } from 'better-convex/aggregate';
import * as ormModule from 'better-convex/orm';
import {
  convexTable,
  createOrm,
  defineRelations,
  defineTriggers,
  type InferSelectModel,
  type OrmBeforeResult,
  type OrmTriggerChange,
  type OrmTriggerContext,
  type OrmWriter,
  text,
} from 'better-convex/orm';
import { type Equal, Expect } from './utils';

type IsUnknown<T> = Equal<T, unknown>;

const users = convexTable('users_trigger_types', {
  name: text().notNull(),
  email: text(),
});

const posts = convexTable('posts_trigger_types', {
  title: text().notNull(),
  userId: text().notNull(),
});

const relations = defineRelations({ users, posts });

type UsersDoc = InferSelectModel<typeof users>;
type UsersAggregateCtx = OrmTriggerContext<typeof relations>;
type UsersAggregateChange = OrmTriggerChange<UsersDoc>;

const usersAggregate = new TableAggregate({
  name: 'usersTriggerTypes',
  table: 'users_trigger_types',
  sortKey: () => null,
});

const usersAggregateHandler = usersAggregate.trigger();
Expect<
  Equal<
    Parameters<typeof usersAggregateHandler>[1]['operation'],
    'insert' | 'update' | 'delete'
  >
>;
void usersAggregateHandler;

const triggers = defineTriggers(relations, {
  users: {
    create: {
      before: (data, ctx) => {
        Expect<Equal<typeof ctx.orm, OrmWriter<typeof relations>>>;
        data.name;
        const result: OrmBeforeResult<typeof data> = {
          data: { email: 'ada@example.com' },
        };
        return result;
      },
      after: (doc, ctx) => {
        doc.name;
        ctx.orm.insert(users).values({ name: 'Ada' });
      },
    },
    update: {
      before: (data) => {
        data.name;
        // @ts-expect-error update.before payload is update data, not full doc
        data._id;
      },
      after: (doc) => {
        doc.name;
      },
    },
    delete: {
      before: (doc) => {
        doc.name;
        return false;
      },
      after: (doc) => {
        doc.name;
      },
    },
    change: async (change, ctx) => {
      Expect<Equal<typeof ctx.orm, OrmWriter<typeof relations>>>;
      Expect<Equal<IsUnknown<typeof change.id>, false>>;

      await usersAggregate.trigger(change, ctx);
      const aggregateHandler = usersAggregate.trigger();
      await aggregateHandler(ctx, change);

      if (change.operation === 'insert') {
        change.newDoc.name;
        // @ts-expect-error oldDoc is null on insert
        change.oldDoc.name;
      }

      if (change.operation === 'delete') {
        change.oldDoc.name;
        // @ts-expect-error newDoc is null on delete
        change.newDoc.name;
      }
    },
  },
  posts: {
    change: (change) => {
      if (change.operation !== 'delete') {
        change.newDoc.title;
      }
    },
  },
  // @ts-expect-error invalid trigger table key
  invalidTable: {
    change: () => {
      return;
    },
  },
});

const aggregateCompatibleTriggers = defineTriggers(relations, {
  users: {
    change: usersAggregate.trigger,
  },
});

const orm = createOrm({ schema: relations, triggers });
void orm;
void aggregateCompatibleTriggers;

// @ts-expect-error lifecycle builder helpers are removed
ormModule.onChange;
// @ts-expect-error lifecycle builder helpers are removed
ormModule.onInsert;

convexTable(
  'invalid_table_level_triggers',
  {
    name: text().notNull(),
  },
  // @ts-expect-error table-level trigger callbacks are no longer allowed
  () => [
    (_ctx: unknown, _change: unknown) => {
      return;
    },
  ]
);
