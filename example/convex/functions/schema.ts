import {
  type AnyColumn,
  aggregateIndex,
  boolean,
  convexTable,
  custom,
  defineRelations,
  defineSchema,
  defineTriggers,
  eq,
  index,
  integer,
  searchIndex,
  text,
  textEnum,
  timestamp,
  uniqueIndex,
} from 'better-convex/orm';
import { ratelimitPlugin } from 'better-convex/plugins/ratelimit';
import { v } from 'convex/values';
import { getEnv } from '../lib/get-env';

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
    test: text().notNull(),
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
    aggregateIndex('by_organization').on(t.organizationId),
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
    aggregateIndex('by_role').on(t.role),
    index('username').on(t.username),
    index('personalOrganizationId').on(t.personalOrganizationId),
    index('lastActiveOrganizationId').on(t.lastActiveOrganizationId),
  ]
);

// --------------------
// Payment Tables
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
    aggregateIndex('by_user').on(t.userId),
    aggregateIndex('by_project').on(t.projectId),
    aggregateIndex('by_project_completed').on(t.projectId, t.completed),
    aggregateIndex('by_deletion_time').on(t.deletionTime),
    aggregateIndex('by_completed_deletion_time').on(
      t.completed,
      t.deletionTime
    ),
    aggregateIndex('by_priority_deletion_time').on(t.priority, t.deletionTime),
    aggregateIndex('by_user_deletion_time').on(t.userId, t.deletionTime),
    aggregateIndex('by_user_completed_deletion_time').on(
      t.userId,
      t.completed,
      t.deletionTime
    ),
    aggregateIndex('metrics_by_user_deletion_time')
      .on(t.userId, t.deletionTime)
      .count(t.dueDate, t.priority)
      .sum(t.dueDate)
      .avg(t.dueDate)
      .min(t.dueDate)
      .max(t.dueDate),
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
    aggregateIndex('by_owner').on(t.ownerId),
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
  (t) => [
    index('name').on(t.name),
    index('createdBy').on(t.createdBy),
    aggregateIndex('by_created_by').on(t.createdBy),
  ]
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
    aggregateIndex('by_parent').on(t.parentId),
    aggregateIndex('by_todo').on(t.todoId),
    aggregateIndex('by_user').on(t.userId),
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
    aggregateIndex('by_project').on(t.projectId),
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
    aggregateIndex('by_tag').on(t.tagId),
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

export const aggregateDemoRunTable = convexTable(
  'aggregateDemoRun',
  {
    createdAt: timestamp().notNull().defaultNow(),
    userId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    active: boolean().notNull(),
    seed: integer().notNull(),
    projects: custom(v.array(v.string())).notNull(),
    todos: custom(v.array(v.string())).notNull(),
    tags: custom(v.array(v.string())).notNull(),
    todoTags: custom(v.array(v.string())).notNull(),
    projectMembers: custom(v.array(v.string())).notNull(),
    todoComments: custom(v.array(v.string())).notNull(),
  },
  (t) => [
    index('userId').on(t.userId),
    index('userId_active').on(t.userId, t.active),
  ]
);

export const triggerDemoRecordTable = convexTable(
  'triggerDemoRecord',
  {
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    runId: text().notNull(),
    ownerId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    name: text().notNull(),
    email: text().notNull(),
    status: textEnum(['draft', 'active', 'archived'] as const),
    deleteGuard: boolean().notNull(),
    lifecycleTag: text(),
    recursivePatchCount: integer().notNull(),
  },
  (t) => [
    index('ownerId').on(t.ownerId),
    index('runId').on(t.runId),
    index('ownerId_runId').on(t.ownerId, t.runId),
  ]
);

export const triggerDemoAuditTable = convexTable(
  'triggerDemoAudit',
  {
    createdAt: timestamp().notNull().defaultNow(),
    runId: text().notNull(),
    ownerId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    recordId: text(),
    hook: text().notNull(),
    operation: text().notNull(),
    message: text(),
  },
  (t) => [
    index('runId').on(t.runId),
    index('ownerId').on(t.ownerId),
    index('ownerId_runId').on(t.ownerId, t.runId),
  ]
);

export const triggerDemoStatsTable = convexTable(
  'triggerDemoStats',
  {
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull(),
    runId: text().notNull(),
    ownerId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    createCount: integer().notNull(),
    updateCount: integer().notNull(),
    deleteCount: integer().notNull(),
    changeCount: integer().notNull(),
  },
  (t) => [uniqueIndex('runId').on(t.runId), index('ownerId').on(t.ownerId)]
);

export const triggerDemoRunTable = convexTable(
  'triggerDemoRun',
  {
    createdAt: timestamp().notNull().defaultNow(),
    ownerId: text()
      .references(() => userTable.id, { onDelete: 'cascade' })
      .notNull(),
    summary: custom(v.any()).notNull(),
  },
  (t) => [index('ownerId').on(t.ownerId)]
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
  aggregateDemoRun: aggregateDemoRunTable,
  triggerDemoRecord: triggerDemoRecordTable,
  triggerDemoAudit: triggerDemoAuditTable,
  triggerDemoStats: triggerDemoStatsTable,
  triggerDemoRun: triggerDemoRunTable,
};

export default defineSchema(tables, {
  schemaValidation: true,
  defaults: {
    defaultLimit: 1000,
  },
  plugins: [ratelimitPlugin()],
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
    triggerDemoRecords: r.many.triggerDemoRecord({
      from: r.user.id,
      to: r.triggerDemoRecord.ownerId,
    }),
    triggerDemoAudits: r.many.triggerDemoAudit({
      from: r.user.id,
      to: r.triggerDemoAudit.ownerId,
    }),
    triggerDemoStatsRuns: r.many.triggerDemoStats({
      from: r.user.id,
      to: r.triggerDemoStats.ownerId,
    }),
    triggerDemoRuns: r.many.triggerDemoRun({
      from: r.user.id,
      to: r.triggerDemoRun.ownerId,
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
  triggerDemoRecord: {
    owner: r.one.user({
      from: r.triggerDemoRecord.ownerId,
      to: r.user.id,
    }),
  },
  triggerDemoAudit: {
    owner: r.one.user({
      from: r.triggerDemoAudit.ownerId,
      to: r.user.id,
    }),
  },
  triggerDemoStats: {
    owner: r.one.user({
      from: r.triggerDemoStats.ownerId,
      to: r.user.id,
    }),
  },
  triggerDemoRun: {
    owner: r.one.user({
      from: r.triggerDemoRun.ownerId,
      to: r.user.id,
    }),
  },
}));

type TriggerDemoStatsDelta = {
  create?: number;
  update?: number;
  delete?: number;
  change?: number;
};

type TriggerDemoStatsRow = {
  id: string;
  createCount: number;
  updateCount: number;
  deleteCount: number;
  changeCount: number;
};

type TriggerDemoHookCtx = {
  orm: {
    insert: (table: unknown) => {
      values: (value: Record<string, unknown>) => Promise<unknown>;
    };
    update: (table: unknown) => {
      set: (value: Record<string, unknown>) => {
        where: (clause: unknown) => Promise<unknown>;
      };
    };
    query: {
      triggerDemoStats: {
        findFirst: (input: {
          where: { runId: string };
        }) => Promise<TriggerDemoStatsRow | null>;
      };
    };
  };
};

async function appendTriggerDemoAudit(
  ctx: unknown,
  input: {
    runId: string;
    ownerId: string;
    recordId: string | null;
    hook: string;
    operation: string;
    message?: string | null;
  }
) {
  const triggerCtx = ctx as TriggerDemoHookCtx;
  await triggerCtx.orm.insert(triggerDemoAuditTable).values({
    runId: input.runId,
    ownerId: input.ownerId,
    recordId: input.recordId ?? null,
    hook: input.hook,
    operation: input.operation,
    message: input.message ?? null,
  });
}

async function bumpTriggerDemoStats(
  ctx: unknown,
  input: {
    runId: string;
    ownerId: string;
    delta: TriggerDemoStatsDelta;
  }
) {
  const triggerCtx = ctx as TriggerDemoHookCtx;
  const existing = await triggerCtx.orm.query.triggerDemoStats.findFirst({
    where: { runId: input.runId },
  });

  if (existing) {
    await triggerCtx.orm
      .update(triggerDemoStatsTable)
      .set({
        updatedAt: new Date(),
        createCount: existing.createCount + (input.delta.create ?? 0),
        updateCount: existing.updateCount + (input.delta.update ?? 0),
        deleteCount: existing.deleteCount + (input.delta.delete ?? 0),
        changeCount: existing.changeCount + (input.delta.change ?? 0),
      })
      .where(eq(triggerDemoStatsTable.id, existing.id));
    return;
  }

  await triggerCtx.orm.insert(triggerDemoStatsTable).values({
    runId: input.runId,
    ownerId: input.ownerId,
    updatedAt: new Date(),
    createCount: input.delta.create ?? 0,
    updateCount: input.delta.update ?? 0,
    deleteCount: input.delta.delete ?? 0,
    changeCount: input.delta.change ?? 0,
  });
}

export const triggers = defineTriggers(relations, {
  user: {
    create: {
      before: async (data) => {
        const role =
          data.role !== 'admin' && getEnv().ADMIN.includes(data.email)
            ? 'admin'
            : data.role;

        return {
          data: {
            ...data,
            role,
          },
        };
      },
      after: async (user, ctx) => {
        if (user.personalOrganizationId) {
          return;
        }

        const userId = user.id;
        const slug = `personal-${userId.slice(-8)}`;
        const [organization] = await ctx.orm
          .insert(organizationTable)
          .values({
            logo: user.image ?? null,
            monthlyCredits: 0,
            name: `${user.name}'s Organization`,
            slug,
            createdAt: new Date(),
          })
          .returning();
        const organizationId = organization.id;

        await ctx.orm.insert(memberTable).values({
          createdAt: new Date(),
          role: 'owner',
          organizationId,
          userId,
        });

        await ctx.orm
          .update(userTable)
          .set({
            lastActiveOrganizationId: organizationId,
            personalOrganizationId: organizationId,
          })
          .where(eq(userTable.id, userId));
      },
    },
  },
  session: {
    create: {
      after: async (session, ctx) => {
        if (session.activeOrganizationId) {
          return;
        }

        const user = await ctx.orm.query.user.findFirst({
          where: { id: session.userId },
        });
        if (!user) {
          return;
        }

        const activeOrganizationId =
          user.lastActiveOrganizationId ?? user.personalOrganizationId ?? null;
        const sessionId = session.id;

        await ctx.orm
          .update(sessionTable)
          .set({ activeOrganizationId })
          .where(eq(sessionTable.id, sessionId));
      },
    },
  },
  triggerDemoRecord: {
    create: {
      before: async (data) => {
        const name = data.name.trim();
        if (!name) {
          return false;
        }

        return {
          data: {
            ...data,
            name,
            email: data.email.toLowerCase(),
            status: data.status ?? 'active',
            deleteGuard: data.deleteGuard ?? false,
            recursivePatchCount: data.recursivePatchCount ?? 0,
          },
        };
      },
      after: async (doc, ctx) => {
        await appendTriggerDemoAudit(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          recordId: doc.id,
          hook: 'create.after',
          operation: 'insert',
          message: 'create side effect applied',
        });

        await bumpTriggerDemoStats(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          delta: { create: 1 },
        });

        const rawId = (doc as { _id?: string; id?: string })._id ?? doc.id;

        const innerDb = ctx.innerDb as unknown as {
          patch: (
            tableName: string,
            id: string,
            patchValue: Record<string, unknown>
          ) => Promise<void>;
        };
        await innerDb.patch('triggerDemoRecord', rawId, {
          lifecycleTag: 'innerdb-patched',
        });

        if (doc.recursivePatchCount === 0) {
          const db = ctx.db as unknown as {
            patch: (
              tableName: string,
              id: string,
              patchValue: Record<string, unknown>
            ) => Promise<void>;
          };
          await db.patch('triggerDemoRecord', rawId, {
            recursivePatchCount: 1,
          });
        }
      },
    },
    update: {
      before: async (data) => {
        const nextData = { ...data };

        if (nextData.name !== undefined) {
          const name = nextData.name.trim();
          if (!name) {
            return false;
          }
          nextData.name = name;
        }

        if (nextData.email !== undefined) {
          nextData.email = nextData.email.toLowerCase();
        }

        return {
          data: {
            ...nextData,
          },
        };
      },
      after: async (doc, ctx) => {
        await appendTriggerDemoAudit(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          recordId: doc.id,
          hook: 'update.after',
          operation: 'update',
          message: 'update side effect applied',
        });

        await bumpTriggerDemoStats(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          delta: { update: 1 },
        });
      },
    },
    delete: {
      before: async (doc) => {
        if (doc.deleteGuard) {
          return false;
        }
      },
      after: async (doc, ctx) => {
        await appendTriggerDemoAudit(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          recordId: doc.id,
          hook: 'delete.after',
          operation: 'delete',
          message: 'delete side effect applied',
        });

        await bumpTriggerDemoStats(ctx, {
          runId: doc.runId,
          ownerId: doc.ownerId,
          delta: { delete: 1 },
        });
      },
    },
    change: async (change, ctx) => {
      const ownerId = change.newDoc?.ownerId ?? change.oldDoc?.ownerId;
      const runId = change.newDoc?.runId ?? change.oldDoc?.runId;

      if (!ownerId || !runId) {
        return;
      }

      await appendTriggerDemoAudit(ctx, {
        runId,
        ownerId,
        recordId: change.id ?? null,
        hook: 'change',
        operation: change.operation,
        message: 'change hook observed operation',
      });

      await bumpTriggerDemoStats(ctx, {
        runId,
        ownerId,
        delta: { change: 1 },
      });
    },
  },
});
