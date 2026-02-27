import { expectTypeOf, test } from 'vitest';
import { text, textEnum } from '../builders';
import { defineRelations } from '../relations';
import { convexTable } from '../table';
import {
  defineMigration,
  type MigrationDocContext,
  type MigrationTableName,
} from './definitions';

const users = convexTable('users', {
  name: text().notNull(),
});
const todos = convexTable('todos', {
  title: text().notNull(),
  priority: textEnum(['low', 'medium', 'high'] as const),
});
const schema = defineRelations({
  users,
  todos,
});

type TestSchema = typeof schema;

test('defineMigration infers table doc type from step.table', () => {
  defineMigration<TestSchema>({
    id: '20260101_typed_doc',
    up: {
      table: 'todos',
      migrateOne: async (ctx, todo) => {
        expectTypeOf(ctx).toEqualTypeOf<MigrationDocContext<TestSchema>>();
        expectTypeOf(todo.priority).toEqualTypeOf<
          'low' | 'medium' | 'high' | null | undefined
        >();
        expectTypeOf(todo.title).toEqualTypeOf<string | undefined>();
        expectTypeOf(todo.id).toEqualTypeOf<string | undefined>();
        expectTypeOf(todo.legacyField).toEqualTypeOf<unknown>();
      },
    },
  });
});

test('MigrationTableName is narrowed to schema table keys', () => {
  expectTypeOf<MigrationTableName<TestSchema>>().toEqualTypeOf<
    'users' | 'todos'
  >();
});

test('defineMigration rejects unknown table names for typed schemas', () => {
  defineMigration<TestSchema>({
    id: '20260101_invalid_table_name',
    up: {
      // @ts-expect-error table must exist in schema
      table: 'projects',
      migrateOne: async () => {},
    },
  });
});
