/* biome-ignore-all lint: compile-time type assertions only */

import { id, text } from './builders';
import {
  defineSchema,
  defineSchemaExtension,
  getSchemaRelations,
} from './schema';
import { convexTable } from './table';

type Expect<T extends true> = T;
type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

const users = convexTable('schema_plugin_relation_types_users', {
  name: text().notNull(),
});

const posts = convexTable('schema_plugin_relation_types_posts', {
  title: text().notNull(),
  userId: id('schema_plugin_relation_types_users')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
});

const relationExtension = defineSchemaExtension('relation-plugin', {
  users,
  posts,
}).relations((r) => ({
  users: {
    posts: r.many.posts(),
  },
  posts: {
    user: r.one.users({
      from: r.posts.userId,
      to: r.users.id,
    }),
  },
}));

const schema = defineSchema({}).extend(relationExtension);
const relations = getSchemaRelations(schema);

type _pluginUsersRelation = Expect<
  HasKey<NonNullable<typeof relations>['users']['relations'], 'posts'>
>;
type _pluginPostsRelation = Expect<
  HasKey<NonNullable<typeof relations>['posts']['relations'], 'user'>
>;

const mergedSchema = defineSchema({})
  .extend(relationExtension)
  .relations((r) => ({
    users: {
      authoredPosts: r.many.posts({
        from: r.users.id,
        to: r.posts.userId,
        alias: 'authoredPosts',
      }),
    },
  }));
const mergedRelations = getSchemaRelations(mergedSchema);

type _mergedKeepsPluginRelation = Expect<
  HasKey<NonNullable<typeof mergedRelations>['posts']['relations'], 'user'>
>;
type _mergedKeepsAppRelation = Expect<
  HasKey<
    NonNullable<typeof mergedRelations>['users']['relations'],
    'authoredPosts'
  >
>;
