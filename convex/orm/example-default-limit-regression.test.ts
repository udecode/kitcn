import { requireSchemaRelations } from 'better-convex/orm';
import { expect, test } from 'vitest';
import schema, {
  tagsTable,
  todosTable,
  todoTagsTable,
  userTable,
} from '../../example/convex/functions/schema';
import { withOrmCtx } from '../setup.testing';

const relations = requireSchemaRelations(schema);

test('example schema applies defaultLimit to unsized findMany', async () => {
  await withOrmCtx(schema, relations, async (ctx) => {
    await expect(
      ctx.orm.query.tags.findMany({
        where: { createdBy: 'missing-user' },
        orderBy: { createdAt: 'asc' },
      })
    ).resolves.toEqual([]);
  });
});

test('example schema applies defaultLimit to relation loading', async () => {
  await withOrmCtx(schema, relations, async (ctx) => {
    const [{ id: userId }] = await ctx.orm
      .insert(userTable)
      .values({
        name: 'Example User',
        email: 'example-default-limit@test.dev',
        emailVerified: true,
        updatedAt: new Date(),
      })
      .returning({ id: userTable.id });

    const [{ id: todoId }] = await ctx.orm
      .insert(todosTable)
      .values({
        title: 'Default limit relation regression',
        completed: false,
        userId,
      })
      .returning({ id: todosTable.id });

    const [{ id: tagId }] = await ctx.orm
      .insert(tagsTable)
      .values({
        name: 'regression',
        color: '#111111',
        createdBy: userId,
      })
      .returning({ id: tagsTable.id });

    await ctx.orm.insert(todoTagsTable).values({
      todoId,
      tagId,
    });

    const todos = await ctx.orm.query.todos.findMany({
      where: { userId },
      limit: 20,
      with: { tags: true },
    });

    expect(todos).toHaveLength(1);
    expect(todos[0]?.tags.map((tag) => tag.id)).toEqual([tagId]);
  });
});
