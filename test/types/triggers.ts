import { TableAggregate } from 'better-convex/aggregate';
import * as ormModule from 'better-convex/orm';
import {
  convexTable,
  createOrm,
  defineRelations,
  defineTriggers,
  type GenericOrmCtx,
  type InferSelectModel,
  type OrmBeforeResult,
  type OrmTriggerChange,
  type OrmTriggerContext,
  type OrmWriter,
  text,
} from 'better-convex/orm';
import { createGenericCallerFactory } from 'better-convex/server';
import type { GenericMutationCtx, GenericQueryCtx } from 'convex/server';
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
type QueryCtx = GenericOrmCtx<GenericQueryCtx<any>, typeof relations>;
type MutationCtx = GenericOrmCtx<GenericMutationCtx<any>, typeof relations>;
type TriggerMutationCtx = OrmTriggerContext<typeof relations, MutationCtx>;

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

const createUsersCaller = createGenericCallerFactory<
  QueryCtx,
  MutationCtx,
  {
    'users.sendWelcomeEmail': readonly [
      'mutation',
      () => {
        _handler: (
          ctx: MutationCtx,
          input: { userId: string }
        ) => Promise<{ ok: true }>;
      },
    ];
  }
>({
  'users.sendWelcomeEmail': [
    'mutation',
    () => ({
      _handler: async (_ctx: MutationCtx, _input: { userId: string }) => ({
        ok: true as const,
      }),
    }),
  ],
});

declare const triggerMutationCtx: TriggerMutationCtx;
const triggerMutationCaller = createUsersCaller(triggerMutationCtx);
triggerMutationCaller.schedule.now.users.sendWelcomeEmail({ userId: 'u_1' });
triggerMutationCaller.schedule.after(1000).users.sendWelcomeEmail({
  userId: 'u_1',
});

const triggers = defineTriggers<typeof relations, MutationCtx>(relations, {
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
        const caller = createUsersCaller(ctx);
        caller.schedule.now.users.sendWelcomeEmail({ userId: doc.id });
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
