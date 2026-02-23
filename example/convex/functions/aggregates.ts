import { createAggregate } from 'better-convex/aggregate';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';

// Aggregate for users
export const aggregateUsers = createAggregate<{
  DataModel: DataModel;
  Key: null; // No sorting, just counting
  Namespace: string; // userId
  TableName: 'user';
}>(components.aggregateUsers, {
  namespace: (doc) => doc._id,
  sortKey: () => null, // We only care about counting, not sorting
});

// Todo counts by user with priority breakdown
export const aggregateTodosByUser = createAggregate<{
  DataModel: DataModel;
  Key: [string, boolean, boolean]; // [priority, completed, isDeleted]
  Namespace: string;
  TableName: 'todos';
}>(components.aggregateTodosByUser, {
  namespace: (doc) => doc.userId,
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [doc.priority ?? 'none', doc.completed, isDeleted];
  },
});

// Todo counts by project
export const aggregateTodosByProject = createAggregate<{
  DataModel: DataModel;
  Key: [boolean, number, boolean]; // [completed, creationTime, isDeleted]
  Namespace: string | 'no-project';
  TableName: 'todos';
}>(components.aggregateTodosByProject, {
  namespace: (doc) => doc.projectId ?? 'no-project',
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [doc.completed, doc._creationTime, isDeleted];
  },
});

// Todo counts by completion status (global)
export const aggregateTodosByStatus = createAggregate<{
  DataModel: DataModel;
  Key: [boolean, string, number, boolean]; // [completed, priority, dueDate, isDeleted]
  TableName: 'todos';
}>(components.aggregateTodosByStatus, {
  sortKey: (doc) => {
    // Include deletion status in the key to handle soft deletion properly
    const isDeleted = doc.deletionTime !== undefined;
    return [
      doc.completed,
      doc.priority ?? 'none',
      doc.dueDate ?? Number.POSITIVE_INFINITY,
      isDeleted,
    ];
  },
});

// Tag usage counts (for many:many relationship demo)
export const aggregateTagUsage = createAggregate<{
  DataModel: DataModel;
  Key: number; // usage count (updated via trigger)
  Namespace: string;
  TableName: 'todoTags';
}>(components.aggregateTagUsage, {
  namespace: (doc) => doc.tagId,
  sortKey: () => 1,
  sumValue: () => 1,
});

// Project member counts
export const aggregateProjectMembers = createAggregate<{
  DataModel: DataModel;
  Key: number; // join time
  Namespace: string;
  TableName: 'projectMembers';
}>(components.aggregateProjectMembers, {
  namespace: (doc) => doc.projectId,
  sortKey: (doc) => doc._creationTime,
});

// Comments count by todo
export const aggregateCommentsByTodo = createAggregate<{
  DataModel: DataModel;
  Key: number; // creation time
  Namespace: string;
  TableName: 'todoComments';
}>(components.aggregateCommentsByTodo, {
  namespace: (doc) => doc.todoId,
  sortKey: (doc) => doc._creationTime,
});

// Direct reply counts (comments grouped by parent comment)
export const aggregateRepliesByParent = createAggregate<{
  DataModel: DataModel;
  Key: number; // creation time
  Namespace: string | 'top-level';
  TableName: 'todoComments';
}>(components.aggregateRepliesByParent, {
  namespace: (doc) => doc.parentId ?? 'top-level',
  sortKey: (doc) => doc._creationTime,
});
