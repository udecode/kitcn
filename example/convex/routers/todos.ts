import { z } from 'zod';
import { createCaller } from '../functions/generated';
import { authRoute, publicRoute, router } from '../lib/crpc';

const todoOutput = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  description: z.string().nullish(),
});

// To-do router - groups todo-related endpoints
export const todosRouter = router({
  // GET /api/todos - List todos with query params (public)
  list: publicRoute
    .get('/api/todos')
    .searchParams(z.object({ limit: z.coerce.number().optional() }))
    .output(z.array(todoOutput))
    .query(async ({ ctx, searchParams }) => {
      const caller = createCaller(ctx);
      const result = await caller.todos.list({
        limit: searchParams.limit ?? 10,
      });
      const todos = result.page;

      return todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        description: t.description,
      }));
    }),

  // GET /api/todos/:id - Get single todo by ID (path params)
  get: publicRoute
    .get('/api/todos/:id')
    .params(z.object({ id: z.string() }))
    .output(todoOutput.nullable())
    .query(async ({ ctx, params }) => {
      const caller = createCaller(ctx);
      const todo = await caller.todos.get({ id: params.id });
      if (!todo) return null;
      return {
        id: todo.id,
        title: todo.title,
        completed: todo.completed,
        description: todo.description,
      };
    }),

  // POST /api/todos - Create new todo (JSON body, requires auth)
  create: authRoute
    .post('/api/todos')
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .output(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const caller = createCaller(ctx);
      const id = await caller.todoInternal.create({
        userId: ctx.userId,
        ...input,
      });
      return { id };
    }),

  // PATCH /api/todos/:id - Update todo (auth required)
  update: authRoute
    .patch('/api/todos/:id')
    .params(z.object({ id: z.string() }))
    .input(
      z.object({
        title: z.string().min(1).optional(),
        completed: z.boolean().optional(),
        description: z.string().optional(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, params, input }) => {
      const caller = createCaller(ctx);
      await caller.todoInternal.update({
        userId: ctx.userId,
        id: params.id,
        ...input,
      });
      return { success: true };
    }),

  // DELETE /api/todos/:id - Delete todo (auth required)
  delete: authRoute
    .delete('/api/todos/:id')
    .params(z.object({ id: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, params }) => {
      const caller = createCaller(ctx);
      await caller.todoInternal.deleteTodo({
        userId: ctx.userId,
        id: params.id,
      });
      return { success: true };
    }),

  // GET /api/todos/export/:format - Export todos as file
  download: authRoute
    .get('/api/todos/export/:format')
    .params(z.object({ format: z.enum(['json', 'csv']) }))
    .query(async ({ ctx, params, c }) => {
      const caller = createCaller(ctx);
      const result = await caller.todos.list({ limit: 100 });
      const todos = result.page;

      c.header(
        'Content-Disposition',
        `attachment; filename="todos.${params.format}"`
      );
      c.header('Cache-Control', 'no-cache');

      if (params.format === 'csv') {
        const csv = [
          'id,title,completed,description',
          ...todos.map(
            (t) => `${t.id},${t.title},${t.completed},${t.description ?? ''}`
          ),
        ].join('\n');
        return c.text(csv);
      }

      return c.json({ todos });
    }),
});
