/* biome-ignore-all lint: compile-time type assertions only */

import type { OrmWriter } from 'better-convex/orm';
import schema from './functions/schema';

declare const db: OrmWriter<typeof schema>;

void db.query.projects.findMany({
  with: {
    _count: {
      todos: {
        where: {
          projectId: 'project_123',
          completed: true,
        },
      },
    },
  },
});

void db.query.projects.findMany({
  with: {
    _count: {
      todos: {
        where: {
          projectId: 'project_123',
          completed: true,
          // @ts-expect-error not declared in aggregateIndex key fields for todos relation counts
          description: 'Test',
        },
      },
    },
  },
});

void db.query.todos.count({
  where: {
    projectId: 'project_123',
    completed: true,
    // @ts-expect-error not declared in aggregateIndex key fields for todos filtered count
    description: 'Test',
  },
});

void db.query.todos.groupBy({
  by: 'projectId',
  where: {
    projectId: 'project_123',
  },
  _count: true,
});

void db.query.todos.groupBy({
  by: ['projectId', 'completed'],
  where: {
    projectId: 'project_123',
    completed: true,
  },
  _count: true,
});

void db.query.todos.groupBy({
  by: ['projectId'],
  orderBy: { projectId: 'asc' },
  _count: true,
});

void db.query.todos.groupBy({
  by: ['projectId'],
  having: { _count: { _all: { gt: 1 } } },
  orderBy: [{ _count: 'desc' }],
  take: 10,
  skip: 0,
  cursor: {
    _count: 2,
    projectId: 'project_123',
  },
  _count: true,
});
