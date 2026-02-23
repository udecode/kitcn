import {
  type AnyColumn,
  boolean,
  convexTable,
  custom,
  defineRelations,
  defineSchema,
  defineTriggers,
  index,
  integer,
  searchIndex,
  text,
  textEnum,
  timestamp,
  uniqueIndex,
} from 'better-convex/orm';
import { v } from 'convex/values';
import {
  aggregateCommentsByTodo,
  aggregateProjectMembers,
  aggregateRepliesByParent,
  aggregateTagUsage,
  aggregateTodosByProject,
  aggregateTodosByStatus,
  aggregateTodosByUser,
  aggregateUsers,
} from './aggregates';

// =============================================================================
// Tables
// =============================================================================

// --------------------
// Better Auth Tables (forked locally)
// --------------------

export const sessionTable = convexTable(
  'session',
  {
    token: text().notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    ipAddress: text(),
    userAgent: text(),
    impersonatedBy: text(),
    // Keep string for Better Auth compatibility (app code uses string IDs).
    activeOrganizationId: text(),
  },
  (t) => [
    index('token').on(t.token),
    index('expiresAt').on(t.expiresAt),
    index('expiresAt_userId').on(t.expiresAt, t.userId),
    index('userId').on(t.userId),
  ]
);

export const accountTable = convexTable(
  'account',
  {
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('accountId').on(t.accountId),
    index('accountId_providerId').on(t.accountId, t.providerId),
    index('providerId_userId').on(t.providerId, t.userId),
    index('userId').on(t.userId),
  ]
);

export const verificationTable = convexTable(
  'verification',
  {
    value: text().notNull(),
    identifier: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
  },
  (t) => [
    index('identifier').on(t.identifier),
    index('expiresAt').on(t.expiresAt),
  ]
);

export const jwksTable = convexTable('jwks', {
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

// --------------------
// Orgs
// --------------------

export const organizationTable = convexTable(
  'organization',
  {
    logo: text(),
    createdAt: timestamp().notNull().defaultNow(),
    metadata: text(),
    monthlyCredits: integer().notNull(),
    slug: text().notNull(),
    name: text().notNull(),
  },
  (t) => [uniqueIndex('slug').on(t.slug), index('name').on(t.name)]
);

export const memberTable = convexTable(
  'member',
  {
    createdAt: timestamp().notNull().defaultNow(),
    role: text().notNull(),
    organizationId: text()
      .references(() => organizationTable.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('role').on(t.role),
    index('organizationId_userId').on(t.organizationId, t.userId),
    index('organizationId_role').on(t.organizationId, t.role),
    index('userId').on(t.userId),
  ]
);

export const invitationTable = convexTable(
  'invitation',
  {
    role: text(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    email: text().notNull(),
    status: text().notNull(),
    organizationId: text()
      .references(() => organizationTable.id, { onDelete: 'cascade' })
      .notNull(),
    inviterId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('email').on(t.email),
    index('status').on(t.status),
    index('email_organizationId_status').on(
      t.email,
      t.organizationId,
      t.status
    ),
    index('organizationId_status').on(t.organizationId, t.status),
    index('email_status').on(t.email, t.status),
    index('organizationId_email').on(t.organizationId, t.email),
    index('organizationId_email_status').on(
      t.organizationId,
      t.email,
      t.status
    ),
    index('inviterId').on(t.inviterId),
  ]
);

// --------------------
// Unified User Model (App + Better Auth)
// --------------------

export const userTable = convexTable(
  'user',
  {
    // Better Auth required fields
    name: text().notNull(),
    emailVerified: boolean().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),

    // Better Auth optional fields
    image: text(),
    role: text(),
    banned: boolean(),
    banReason: text(),
    banExpires: timestamp(),
    bio: text(),
    firstName: text(),
    github: text(),
    lastName: text(),
    linkedin: text(),
    location: text(),
    username: text(),
    website: text(),
    x: text(),

    // App-specific fields
    deletedAt: timestamp(),

    // Convex Ents compatibility fields
    email: text().notNull(),
    customerId: text(),
    lastActiveOrganizationId: text().references(() => organizationTable.id, {
      onDelete: 'set null',
    }),
    personalOrganizationId: text().references(() => organizationTable.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('email').on(t.email),
    index('customerId').on(t.customerId),
    index('email_name').on(t.email, t.name),
    index('name').on(t.name),
    index('username').on(t.username),
    index('personalOrganizationId').on(t.personalOrganizationId),
    index('lastActiveOrganizationId').on(t.lastActiveOrganizationId),
  ]
);

// --------------------
// Polar Payment Tables
// --------------------

export const subscriptionsTable = convexTable(
  'subscriptions',
  {
    createdAt: text().notNull(),
    modifiedAt: text(),
    amount: integer(),
    currency: text(),
    recurringInterval: text(),
    status: text().notNull(),
    currentPeriodStart: text().notNull(),
    currentPeriodEnd: text(),
    cancelAtPeriodEnd: boolean().notNull(),
    startedAt: text(),
    endedAt: text(),
    priceId: text(),
    productId: text().notNull(),
    checkoutId: text(),
    metadata: custom(v.record(v.string(), v.any())).notNull(),
    customerCancellationReason: text(),
    customerCancellationComment: text(),

    subscriptionId: text().notNull(),
    organizationId: text()
      .references(() => organizationTable.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    uniqueIndex('subscriptionId').on(t.subscriptionId),
    index('organizationId_status').on(t.organizationId, t.status),
    index('userId_organizationId_status').on(
      t.userId,
      t.organizationId,
      t.status
    ),
    index('userId_endedAt').on(t.userId, t.endedAt),
  ]
);

// --------------------
// Todo Model
// --------------------

export const todosTable = convexTable(
  'todos',
  {
    createdAt: timestamp().notNull().defaultNow(),
    title: text().notNull(),
    description: text(),
    completed: boolean().notNull(),
    priority: textEnum(['low', 'medium', 'high'] as const),
    dueDate: timestamp(),
    deletionTime: timestamp(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: text().references(() => projectsTable.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('completed').on(t.completed),
    index('priority').on(t.priority),
    index('dueDate').on(t.dueDate),
    index('user_completed').on(t.userId, t.completed),
    index('userId').on(t.userId),
    index('projectId').on(t.projectId),
    searchIndex('search_title_description')
      .on(t.title)
      .filter(t.userId, t.completed, t.projectId),
  ]
);

// --------------------
// Project Model
// --------------------

export const projectsTable = convexTable(
  'projects',
  {
    createdAt: timestamp().notNull().defaultNow(),
    name: text().notNull(),
    description: text(),
    isPublic: boolean().notNull(),
    archived: boolean().notNull(),
    ownerId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('isPublic').on(t.isPublic),
    index('archived').on(t.archived),
    index('ownerId').on(t.ownerId),
    searchIndex('search_name_description')
      .on(t.name)
      .filter(t.isPublic, t.archived),
  ]
);

// --------------------
// Tag Model
// --------------------

export const tagsTable = convexTable(
  'tags',
  {
    createdAt: timestamp().notNull().defaultNow(),
    color: text().notNull(),
    name: text().notNull(),
    createdBy: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [index('name').on(t.name), index('createdBy').on(t.createdBy)]
);

// --------------------
// Comment Model
// --------------------

export const todoCommentsTable = convexTable(
  'todoComments',
  {
    createdAt: timestamp().notNull().defaultNow(),
    content: text().notNull(),
    parentId: text().references((): AnyColumn => todoCommentsTable.id, {
      onDelete: 'cascade',
    }),
    todoId: text()
      .references(() => todosTable.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('parentId').on(t.parentId),
    index('todoId').on(t.todoId),
    index('userId').on(t.userId),
  ]
);

// --------------------
// Join Tables
// --------------------

export const projectMembersTable = convexTable(
  'projectMembers',
  {
    createdAt: timestamp().notNull().defaultNow(),
    projectId: text()
      .references(() => projectsTable.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('projectId').on(t.projectId),
    index('userId').on(t.userId),
    index('projectId_userId').on(t.projectId, t.userId),
    index('userId_projectId').on(t.userId, t.projectId),
  ]
);

export const todoTagsTable = convexTable(
  'todoTags',
  {
    createdAt: timestamp().notNull().defaultNow(),
    todoId: text()
      .references(() => todosTable.id, { onDelete: 'cascade' })
      .notNull(),
    tagId: text()
      .references(() => tagsTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('todoId').on(t.todoId),
    index('tagId').on(t.tagId),
    index('todoId_tagId').on(t.todoId, t.tagId),
    index('tagId_todoId').on(t.tagId, t.todoId),
  ]
);

export const commentRepliesTable = convexTable(
  'commentReplies',
  {
    createdAt: timestamp().notNull().defaultNow(),
    parentId: text()
      .references(() => todoCommentsTable.id, { onDelete: 'cascade' })
      .notNull(),
    replyId: text()
      .references(() => todoCommentsTable.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (t) => [
    index('parentId').on(t.parentId),
    index('replyId').on(t.replyId),
    index('parentId_replyId').on(t.parentId, t.replyId),
    index('replyId_parentId').on(t.replyId, t.parentId),
  ]
);

export const tables = {
  session: sessionTable,
  account: accountTable,
  verification: verificationTable,
  jwks: jwksTable,
  organization: organizationTable,
  member: memberTable,
  invitation: invitationTable,
  user: userTable,
  subscriptions: subscriptionsTable,
  todos: todosTable,
  projects: projectsTable,
  tags: tagsTable,
  todoComments: todoCommentsTable,
  projectMembers: projectMembersTable,
  todoTags: todoTagsTable,
  commentReplies: commentRepliesTable,
};

export default defineSchema(tables, {
  schemaValidation: true,
  defaults: {
    defaultLimit: 1000,
  },
});

// =============================================================================
// ORM Relations Config
// =============================================================================

export const relations = defineRelations(tables, (r) => ({
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  organization: {
    members: r.many.member({
      from: r.organization.id,
      to: r.member.organizationId,
    }),
    invitations: r.many.invitation({
      from: r.organization.id,
      to: r.invitation.organizationId,
    }),
    subscriptions: r.many.subscriptions({
      from: r.organization.id,
      to: r.subscriptions.organizationId,
    }),
  },
  member: {
    organization: r.one.organization({
      from: r.member.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.member.userId,
      to: r.user.id,
    }),
  },
  invitation: {
    organization: r.one.organization({
      from: r.invitation.organizationId,
      to: r.organization.id,
    }),
    inviter: r.one.user({
      from: r.invitation.inviterId,
      to: r.user.id,
    }),
  },
  user: {
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
    members: r.many.member({
      from: r.user.id,
      to: r.member.userId,
    }),
    subscriptions: r.many.subscriptions({
      from: r.user.id,
      to: r.subscriptions.userId,
    }),
    todos: r.many.todos({
      from: r.user.id,
      to: r.todos.userId,
    }),
    ownedProjects: r.many.projects({
      from: r.user.id,
      to: r.projects.ownerId,
      alias: 'ProjectOwner',
    }),
    memberProjects: r.many.projects({
      from: r.user.id.through(r.projectMembers.userId),
      to: r.projects.id.through(r.projectMembers.projectId),
      alias: 'ProjectMembers',
    }),
    todoComments: r.many.todoComments({
      from: r.user.id,
      to: r.todoComments.userId,
    }),
    lastActiveOrganization: r.one.organization({
      from: r.user.lastActiveOrganizationId,
      to: r.organization.id,
      optional: true,
    }),
    personalOrganization: r.one.organization({
      from: r.user.personalOrganizationId,
      to: r.organization.id,
      optional: true,
    }),
  },
  subscriptions: {
    organization: r.one.organization({
      from: r.subscriptions.organizationId,
      to: r.organization.id,
    }),
    user: r.one.user({
      from: r.subscriptions.userId,
      to: r.user.id,
    }),
  },
  todos: {
    user: r.one.user({
      from: r.todos.userId,
      to: r.user.id,
    }),
    project: r.one.projects({
      from: r.todos.projectId,
      to: r.projects.id,
      optional: true,
    }),
    tags: r.many.tags({
      from: r.todos.id.through(r.todoTags.todoId),
      to: r.tags.id.through(r.todoTags.tagId),
    }),
    todoComments: r.many.todoComments({
      from: r.todos.id,
      to: r.todoComments.todoId,
    }),
  },
  projects: {
    owner: r.one.user({
      from: r.projects.ownerId,
      to: r.user.id,
      alias: 'ProjectOwner',
    }),
    todos: r.many.todos({
      from: r.projects.id,
      to: r.todos.projectId,
    }),
    members: r.many.user({
      from: r.projects.id.through(r.projectMembers.projectId),
      to: r.user.id.through(r.projectMembers.userId),
      alias: 'ProjectMembers',
    }),
  },
  tags: {
    todos: r.many.todos({
      from: r.tags.id.through(r.todoTags.tagId),
      to: r.todos.id.through(r.todoTags.todoId),
    }),
  },
  todoComments: {
    todo: r.one.todos({
      from: r.todoComments.todoId,
      to: r.todos.id,
    }),
    user: r.one.user({
      from: r.todoComments.userId,
      to: r.user.id,
    }),
    parent: r.one.todoComments({
      from: r.todoComments.parentId,
      to: r.todoComments.id,
      optional: true,
      alias: 'TodoCommentParent',
    }),
    replies: r.many.todoComments({
      from: r.todoComments.id,
      to: r.todoComments.parentId,
      alias: 'TodoCommentParent',
    }),
  },
  projectMembers: {
    project: r.one.projects({
      from: r.projectMembers.projectId,
      to: r.projects.id,
    }),
    user: r.one.user({
      from: r.projectMembers.userId,
      to: r.user.id,
    }),
  },
  todoTags: {
    todo: r.one.todos({
      from: r.todoTags.todoId,
      to: r.todos.id,
    }),
    tag: r.one.tags({
      from: r.todoTags.tagId,
      to: r.tags.id,
    }),
  },
  commentReplies: {
    parent: r.one.todoComments({
      from: r.commentReplies.parentId,
      to: r.todoComments.id,
    }),
    reply: r.one.todoComments({
      from: r.commentReplies.replyId,
      to: r.todoComments.id,
    }),
  },
}));

export const triggers = defineTriggers(relations, {
  user: {
    change: aggregateUsers.trigger,
  },
  todos: {
    change: async (change, ctx) => {
      await aggregateTodosByUser.trigger(change, ctx);
      await aggregateTodosByProject.trigger(change, ctx);
      await aggregateTodosByStatus.trigger(change, ctx);
    },
  },
  todoComments: {
    change: async (change, ctx) => {
      await aggregateCommentsByTodo.trigger(change, ctx);
      await aggregateRepliesByParent.trigger(change, ctx);
    },
  },
  projectMembers: {
    change: aggregateProjectMembers.trigger,
  },
  todoTags: {
    change: aggregateTagUsage.trigger,
  },
});
