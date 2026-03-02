import type { GenericDatabaseWriter } from 'convex/server';
import type { GenericId } from 'convex/values';
import {
  type BuildQueryResult,
  boolean,
  convexTable,
  createOrm,
  defineRelations,
  discriminator,
  type GetColumnData,
  type InferInsertModel,
  id,
  index,
  integer,
  text,
} from '.';

const users = convexTable('poly_type_users', {
  name: text().notNull(),
});

const documents = convexTable('poly_type_documents', {
  title: text().notNull(),
});

const auditLogNotes = convexTable(
  'poly_type_audit_log_notes',
  {
    auditLogId: id('poly_type_audit_logs').notNull(),
    body: text().notNull(),
  },
  (t) => [index('by_audit_log').on(t.auditLogId)]
);

const auditLogs = convexTable(
  'poly_type_audit_logs',
  {
    timestamp: integer().notNull(),
    actionType: discriminator({
      variants: {
        role_change: {
          targetUserId: id('poly_type_users').notNull(),
          oldRole: text().notNull(),
          newRole: text().notNull(),
        },
        document_update: {
          documentId: id('poly_type_documents').notNull(),
          version: integer().notNull(),
          changes: text().notNull(),
        },
      },
    }),
  },
  (t) => [
    index('by_action_ts').on(t.actionType, t.timestamp),
    index('by_role_target').on(t.actionType, t.targetUserId),
    index('by_doc').on(t.actionType, t.documentId),
  ]
);

const relations = defineRelations(
  {
    poly_type_users: users,
    poly_type_documents: documents,
    poly_type_audit_log_notes: auditLogNotes,
    poly_type_audit_logs: auditLogs,
  },
  (r) => ({
    poly_type_audit_log_notes: {
      auditLog: r.one.poly_type_audit_logs({
        from: r.poly_type_audit_log_notes.auditLogId,
        to: r.poly_type_audit_logs.id,
      }),
    },
    poly_type_audit_logs: {
      targetUser: r.one.poly_type_users({
        from: r.poly_type_audit_logs.targetUserId,
        to: r.poly_type_users.id,
        optional: true,
      }),
      document: r.one.poly_type_documents({
        from: r.poly_type_audit_logs.documentId,
        to: r.poly_type_documents.id,
        optional: true,
      }),
      notes: r.many.poly_type_audit_log_notes(),
    },
  })
);

const orm = createOrm({ schema: relations });
const db = orm.db({} as any);

void db.query.poly_type_audit_logs.findMany({
  // biome-ignore format: keep @ts-expect-error bound to property
  // @ts-expect-error query-level polymorphic config was removed
  polymorphic: {},
  limit: 10,
});

void db.query.poly_type_audit_logs.findMany({
  withVariants: true,
  limit: 10,
});

type AuditRow = BuildQueryResult<
  typeof relations,
  (typeof relations)['poly_type_audit_logs'],
  true
>;

declare const row: AuditRow;

if (row.actionType === 'role_change') {
  row.details.targetUserId;
  row.details.oldRole;
  // biome-ignore format: keep @ts-expect-error bound to expression
  // @ts-expect-error role_change branch should not expose document_update fields
  row.details.documentId;
}

if (row.actionType === 'document_update') {
  row.details.documentId;
  row.details.version;
  // biome-ignore format: keep @ts-expect-error bound to expression
  // @ts-expect-error document_update branch should not expose role_change fields
  row.details.targetUserId;
}

type AuditRowWithVariants = BuildQueryResult<
  typeof relations,
  (typeof relations)['poly_type_audit_logs'],
  {
    withVariants: true;
  }
>;

declare const rowWithVariants: AuditRowWithVariants;
rowWithVariants.targetUser;
rowWithVariants.document;
// biome-ignore format: keep @ts-expect-error bound to expression
// @ts-expect-error withVariants only auto-loads one() relations
rowWithVariants.notes;

type AuditRowWithVariantsAndWith = BuildQueryResult<
  typeof relations,
  (typeof relations)['poly_type_audit_logs'],
  {
    withVariants: true;
    with: {
      targetUser: {
        columns: {
          id: true;
        };
      };
    };
  }
>;

declare const rowWithVariantsAndWith: AuditRowWithVariantsAndWith;
rowWithVariantsAndWith.targetUser?.id;
rowWithVariantsAndWith.targetUser?.name;

type AuditRowTimestampOnly = BuildQueryResult<
  typeof relations,
  (typeof relations)['poly_type_audit_logs'],
  {
    columns: {
      timestamp: true;
    };
  }
>;

declare const rowTimestampOnly: AuditRowTimestampOnly;
rowTimestampOnly.timestamp;
// biome-ignore format: keep @ts-expect-error bound to expression
// @ts-expect-error excluding discriminator column should exclude polymorphic union
rowTimestampOnly.actionType;
// biome-ignore format: keep @ts-expect-error bound to expression
// @ts-expect-error excluding discriminator column should exclude polymorphic union
rowTimestampOnly.details;

const todos = convexTable('poly_type_todos', {
  title: text().notNull(),
});

const polymorphicEvents = convexTable('poly_type_events', {
  actorId: id('poly_type_users').notNull(),
  eventType: discriminator({
    variants: {
      todo_completed: {
        todoId: id('poly_type_todos').notNull(),
        completed: boolean().notNull(),
      },
      document_update: {
        documentId: id('poly_type_documents').notNull(),
        version: integer().notNull(),
      },
    },
  }),
});

const polymorphicRelations = defineRelations({
  poly_type_users: users,
  poly_type_documents: documents,
  poly_type_todos: todos,
  poly_type_events: polymorphicEvents,
});

const polymorphicOrm = createOrm({ schema: polymorphicRelations });
const polymorphicDb = polymorphicOrm.db({
  db: {} as GenericDatabaseWriter<any>,
});

declare const userId: GenericId<'poly_type_users'>;
declare const todoId: GenericId<'poly_type_todos'>;
declare const documentId: GenericId<'poly_type_documents'>;
declare const ctx: {
  userId: GenericId<'poly_type_users'>;
  orm: typeof polymorphicDb;
};

void ctx.orm.insert(polymorphicEvents).values({
  actorId: ctx.userId,
  eventType: 'todo_completed',
  todoId,
  completed: true,
});

// biome-ignore format: keep @ts-expect-error bound to object literal
// @ts-expect-error todo_completed branch should reject document_update-only fields
void ctx.orm.insert(polymorphicEvents).values({
  actorId: ctx.userId,
  eventType: 'todo_completed',
  todoId,
  completed: true,
  version: 1,
});

void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'todo_completed',
  todoId,
  completed: true,
});

void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'document_update',
  documentId,
  version: 1,
});

// biome-ignore format: keep @ts-expect-error bound to object literal
// @ts-expect-error todo_completed branch requires `completed`
void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'todo_completed',
  todoId,
});

// biome-ignore format: keep @ts-expect-error bound to object literal
// @ts-expect-error todo_completed branch should reject document_update-only fields
void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'todo_completed',
  todoId,
  completed: true,
  documentId,
});

type EventInsert = InferInsertModel<typeof polymorphicEvents>;
declare const insertRow: EventInsert;

const typedTodoId: GenericId<'poly_type_todos'> | null | undefined =
  insertRow.todoId;
const typedCompleted: boolean | null | undefined = insertRow.completed;
void typedTodoId;
void typedCompleted;

const typedGeneratedTodoId: GenericId<'poly_type_todos'> | null =
  null as any as GetColumnData<
    (typeof polymorphicEvents)['_']['columns']['todoId'],
    'query'
  >;
void typedGeneratedTodoId;

// biome-ignore format: keep @ts-expect-error bound to object literal
// @ts-expect-error document_update branch requires `version`
void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'document_update',
  documentId,
});

// biome-ignore format: keep @ts-expect-error bound to object literal
// @ts-expect-error document_update branch should reject todo_completed-only fields
void polymorphicDb.insert(polymorphicEvents).values({
  actorId: userId,
  eventType: 'document_update',
  documentId,
  version: 1,
  todoId,
});
