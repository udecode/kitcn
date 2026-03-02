/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
  AnyDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";

/**
 * A type describing your Convex data model.
 *
 * This type includes information about what tables you have, the type of
 * documents stored in those tables, and the indexes defined on them.
 *
 * This type is used to parameterize methods like `queryGeneric` and
 * `mutationGeneric` to make them type-safe.
 */

export type DataModel = {
  account: {
    document: {
      accessToken?: null | string;
      accessTokenExpiresAt?: null | number;
      accountId: string;
      createdAt?: number;
      idToken?: null | string;
      password?: null | string;
      providerId: string;
      refreshToken?: null | string;
      refreshTokenExpiresAt?: null | number;
      scope?: null | string;
      updatedAt: number;
      userId: string;
      _id: Id<"account">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "accessToken"
      | "accessTokenExpiresAt"
      | "accountId"
      | "createdAt"
      | "idToken"
      | "password"
      | "providerId"
      | "refreshToken"
      | "refreshTokenExpiresAt"
      | "scope"
      | "updatedAt"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      accountId: ["accountId", "_creationTime"];
      accountId_providerId: ["accountId", "providerId", "_creationTime"];
      providerId_userId: ["providerId", "userId", "_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_bucket: {
    document: {
      count: number;
      indexName: string;
      keyHash: string;
      keyParts: Array<any>;
      nonNullCountValues: Record<string, number>;
      sumValues: Record<string, number>;
      tableKey: string;
      updatedAt: number;
      _id: Id<"aggregate_bucket">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "count"
      | "indexName"
      | "keyHash"
      | "keyParts"
      | "nonNullCountValues"
      | `nonNullCountValues.${string}`
      | "sumValues"
      | `sumValues.${string}`
      | "tableKey"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_table_index: ["tableKey", "indexName", "_creationTime"];
      by_table_index_hash: [
        "tableKey",
        "indexName",
        "keyHash",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_extrema: {
    document: {
      count: number;
      fieldName: string;
      indexName: string;
      keyHash: string;
      sortKey: string;
      tableKey: string;
      updatedAt: number;
      value: any;
      valueHash: string;
      _id: Id<"aggregate_extrema">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "count"
      | "fieldName"
      | "indexName"
      | "keyHash"
      | "sortKey"
      | "tableKey"
      | "updatedAt"
      | "value"
      | "valueHash";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_table_index: ["tableKey", "indexName", "_creationTime"];
      by_table_index_hash_field_sort: [
        "tableKey",
        "indexName",
        "keyHash",
        "fieldName",
        "sortKey",
        "_creationTime",
      ];
      by_table_index_hash_field_value: [
        "tableKey",
        "indexName",
        "keyHash",
        "fieldName",
        "valueHash",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_member: {
    document: {
      docId: string;
      extremaValues: Record<string, any>;
      indexName: string;
      keyHash: string;
      keyParts: Array<any>;
      kind: string;
      nonNullCountValues: Record<string, number>;
      rankKey?: null | any;
      rankNamespace?: null | any;
      rankSumValue?: null | number;
      sumValues: Record<string, number>;
      tableKey: string;
      updatedAt: number;
      _id: Id<"aggregate_member">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "docId"
      | "extremaValues"
      | `extremaValues.${string}`
      | "indexName"
      | "keyHash"
      | "keyParts"
      | "kind"
      | "nonNullCountValues"
      | `nonNullCountValues.${string}`
      | "rankKey"
      | "rankNamespace"
      | "rankSumValue"
      | "sumValues"
      | `sumValues.${string}`
      | "tableKey"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_kind_table_index: ["kind", "tableKey", "indexName", "_creationTime"];
      by_kind_table_index_doc: [
        "kind",
        "tableKey",
        "indexName",
        "docId",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_rank_node: {
    document: {
      aggregate?: null | { count: number; sum: number };
      items: Array<{ k: any; s: number; v: any }>;
      subtrees: Array<string>;
      _id: Id<"aggregate_rank_node">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aggregate"
      | "aggregate.count"
      | "aggregate.sum"
      | "items"
      | "subtrees";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_rank_tree: {
    document: {
      aggregateName: string;
      maxNodeSize: number;
      namespace?: null | any;
      root: Id<"aggregate_rank_node">;
      _id: Id<"aggregate_rank_tree">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "aggregateName"
      | "maxNodeSize"
      | "namespace"
      | "root";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_aggregate_name: ["aggregateName", "_creationTime"];
      by_namespace: ["namespace", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregate_state: {
    document: {
      completedAt?: null | number;
      cursor?: null | string;
      indexName: string;
      keyDefinitionHash: string;
      kind: string;
      lastError?: null | string;
      metricDefinitionHash: string;
      processed: number;
      startedAt: number;
      status: string;
      tableKey: string;
      updatedAt: number;
      _id: Id<"aggregate_state">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completedAt"
      | "cursor"
      | "indexName"
      | "keyDefinitionHash"
      | "kind"
      | "lastError"
      | "metricDefinitionHash"
      | "processed"
      | "startedAt"
      | "status"
      | "tableKey"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_kind_status: ["kind", "status", "_creationTime"];
      by_kind_table_index: ["kind", "tableKey", "indexName", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  aggregateDemoRun: {
    document: {
      active: boolean;
      createdAt?: number;
      projectMembers: Array<string>;
      projects: Array<string>;
      seed: number;
      tags: Array<string>;
      todoComments: Array<string>;
      todoTags: Array<string>;
      todos: Array<string>;
      userId: string;
      _id: Id<"aggregateDemoRun">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "active"
      | "createdAt"
      | "projectMembers"
      | "projects"
      | "seed"
      | "tags"
      | "todoComments"
      | "todos"
      | "todoTags"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      userId: ["userId", "_creationTime"];
      userId_active: ["userId", "active", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  commentReplies: {
    document: {
      createdAt?: number;
      parentId: string;
      replyId: string;
      _id: Id<"commentReplies">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "parentId" | "replyId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      parentId: ["parentId", "_creationTime"];
      parentId_replyId: ["parentId", "replyId", "_creationTime"];
      replyId: ["replyId", "_creationTime"];
      replyId_parentId: ["replyId", "parentId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  invitation: {
    document: {
      createdAt?: number;
      email: string;
      expiresAt: number;
      inviterId: string;
      organizationId: string;
      role?: null | string;
      status: string;
      _id: Id<"invitation">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "email"
      | "expiresAt"
      | "inviterId"
      | "organizationId"
      | "role"
      | "status";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      email: ["email", "_creationTime"];
      email_organizationId_status: [
        "email",
        "organizationId",
        "status",
        "_creationTime",
      ];
      email_status: ["email", "status", "_creationTime"];
      inviterId: ["inviterId", "_creationTime"];
      organizationId_email: ["organizationId", "email", "_creationTime"];
      organizationId_email_status: [
        "organizationId",
        "email",
        "status",
        "_creationTime",
      ];
      organizationId_status: ["organizationId", "status", "_creationTime"];
      status: ["status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  jwks: {
    document: {
      createdAt?: number;
      privateKey: string;
      publicKey: string;
      _id: Id<"jwks">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "privateKey"
      | "publicKey";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  member: {
    document: {
      createdAt?: number;
      organizationId: string;
      role: string;
      userId: string;
      _id: Id<"member">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "organizationId"
      | "role"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      organizationId_role: ["organizationId", "role", "_creationTime"];
      organizationId_userId: ["organizationId", "userId", "_creationTime"];
      role: ["role", "_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  migration_run: {
    document: {
      allowDrift: boolean;
      cancelRequested: boolean;
      completedAt?: null | number;
      currentIndex: number;
      direction: string;
      dryRun: boolean;
      lastError?: null | string;
      migrationIds: Array<string>;
      runId: string;
      startedAt: number;
      status: string;
      updatedAt: number;
      _id: Id<"migration_run">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "allowDrift"
      | "cancelRequested"
      | "completedAt"
      | "currentIndex"
      | "direction"
      | "dryRun"
      | "lastError"
      | "migrationIds"
      | "runId"
      | "startedAt"
      | "status"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_run_id: ["runId", "_creationTime"];
      by_status: ["status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  migration_state: {
    document: {
      applied: boolean;
      checksum: string;
      completedAt?: null | number;
      cursor?: null | string;
      direction?: null | string;
      lastError?: null | string;
      migrationId: string;
      processed: number;
      runId?: null | string;
      startedAt?: null | number;
      status: string;
      updatedAt: number;
      writeMode: string;
      _id: Id<"migration_state">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "applied"
      | "checksum"
      | "completedAt"
      | "cursor"
      | "direction"
      | "lastError"
      | "migrationId"
      | "processed"
      | "runId"
      | "startedAt"
      | "status"
      | "updatedAt"
      | "writeMode";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_migration_id: ["migrationId", "_creationTime"];
      by_status: ["status", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  organization: {
    document: {
      createdAt?: number;
      logo?: null | string;
      metadata?: null | string;
      monthlyCredits: number;
      name: string;
      slug: string;
      _id: Id<"organization">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "logo"
      | "metadata"
      | "monthlyCredits"
      | "name"
      | "slug";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      name: ["name", "_creationTime"];
      slug: ["slug", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ormPolymorphicEvent: {
    document: {
      actorId: string;
      completed?: null | boolean;
      createdAt?: number;
      eventType: string;
      isPublic?: null | boolean;
      nextName?: null | string;
      previousName?: null | string;
      projectId?: null | string;
      tagId?: null | string;
      todoId?: null | string;
      _id: Id<"ormPolymorphicEvent">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "actorId"
      | "completed"
      | "createdAt"
      | "eventType"
      | "isPublic"
      | "nextName"
      | "previousName"
      | "projectId"
      | "tagId"
      | "todoId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      actorId: ["actorId", "_creationTime"];
      eventType: ["eventType", "_creationTime"];
      project_event: ["eventType", "projectId", "_creationTime"];
      tag_event: ["eventType", "tagId", "_creationTime"];
      todo_event: ["eventType", "todoId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  projectMembers: {
    document: {
      createdAt?: number;
      projectId: string;
      userId: string;
      _id: Id<"projectMembers">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "projectId" | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      projectId: ["projectId", "_creationTime"];
      projectId_userId: ["projectId", "userId", "_creationTime"];
      userId: ["userId", "_creationTime"];
      userId_projectId: ["userId", "projectId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  projects: {
    document: {
      archived: boolean;
      createdAt?: number;
      description?: null | string;
      isPublic: boolean;
      name: string;
      ownerId: string;
      _id: Id<"projects">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "archived"
      | "createdAt"
      | "description"
      | "isPublic"
      | "name"
      | "ownerId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      archived: ["archived", "_creationTime"];
      isPublic: ["isPublic", "_creationTime"];
      ownerId: ["ownerId", "_creationTime"];
    };
    searchIndexes: {
      search_name_description: {
        searchField: "name";
        filterFields: "archived" | "isPublic";
      };
    };
    vectorIndexes: {};
  };
  ratelimit_dynamic_limit: {
    document: {
      limit: number;
      prefix: string;
      updatedAt: number;
      _id: Id<"ratelimit_dynamic_limit">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "limit" | "prefix" | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_prefix: ["prefix", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ratelimit_protection_hit: {
    document: {
      blockedUntil?: null | number;
      hits: number;
      kind: "identifier" | "ip" | "userAgent" | "country";
      prefix: string;
      updatedAt: number;
      value: string;
      _id: Id<"ratelimit_protection_hit">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "blockedUntil"
      | "hits"
      | "kind"
      | "prefix"
      | "updatedAt"
      | "value";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_prefix: ["prefix", "_creationTime"];
      by_prefix_value_kind: ["prefix", "value", "kind", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  ratelimit_state: {
    document: {
      auxTs?: null | number;
      auxValue?: null | number;
      key?: null | string;
      name: string;
      shard: number;
      ts: number;
      value: number;
      _id: Id<"ratelimit_state">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "auxTs"
      | "auxValue"
      | "key"
      | "name"
      | "shard"
      | "ts"
      | "value";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      by_name_key: ["name", "key", "_creationTime"];
      by_name_key_shard: ["name", "key", "shard", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  session: {
    document: {
      activeOrganizationId?: null | string;
      createdAt?: number;
      expiresAt: number;
      impersonatedBy?: null | string;
      ipAddress?: null | string;
      token: string;
      updatedAt: number;
      userAgent?: null | string;
      userId: string;
      _id: Id<"session">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "activeOrganizationId"
      | "createdAt"
      | "expiresAt"
      | "impersonatedBy"
      | "ipAddress"
      | "token"
      | "updatedAt"
      | "userAgent"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      expiresAt: ["expiresAt", "_creationTime"];
      expiresAt_userId: ["expiresAt", "userId", "_creationTime"];
      token: ["token", "_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  subscriptions: {
    document: {
      amount?: null | number;
      cancelAtPeriodEnd: boolean;
      checkoutId?: null | string;
      createdAt: string;
      currency?: null | string;
      currentPeriodEnd?: null | string;
      currentPeriodStart: string;
      customerCancellationComment?: null | string;
      customerCancellationReason?: null | string;
      endedAt?: null | string;
      metadata: Record<string, any>;
      modifiedAt?: null | string;
      organizationId: string;
      priceId?: null | string;
      productId: string;
      recurringInterval?: null | string;
      startedAt?: null | string;
      status: string;
      subscriptionId: string;
      userId: string;
      _id: Id<"subscriptions">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "amount"
      | "cancelAtPeriodEnd"
      | "checkoutId"
      | "createdAt"
      | "currency"
      | "currentPeriodEnd"
      | "currentPeriodStart"
      | "customerCancellationComment"
      | "customerCancellationReason"
      | "endedAt"
      | "metadata"
      | `metadata.${string}`
      | "modifiedAt"
      | "organizationId"
      | "priceId"
      | "productId"
      | "recurringInterval"
      | "startedAt"
      | "status"
      | "subscriptionId"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      organizationId_status: ["organizationId", "status", "_creationTime"];
      subscriptionId: ["subscriptionId", "_creationTime"];
      userId_endedAt: ["userId", "endedAt", "_creationTime"];
      userId_organizationId_status: [
        "userId",
        "organizationId",
        "status",
        "_creationTime",
      ];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  tags: {
    document: {
      color: string;
      createdAt?: number;
      createdBy: string;
      name: string;
      _id: Id<"tags">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "color"
      | "createdAt"
      | "createdBy"
      | "name";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      createdBy: ["createdBy", "_creationTime"];
      name: ["name", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  todoComments: {
    document: {
      content: string;
      createdAt?: number;
      parentId?: null | string;
      todoId: string;
      userId: string;
      _id: Id<"todoComments">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "content"
      | "createdAt"
      | "parentId"
      | "todoId"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      parentId: ["parentId", "_creationTime"];
      todoId: ["todoId", "_creationTime"];
      userId: ["userId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  todos: {
    document: {
      completed: boolean;
      createdAt?: number;
      deletionTime?: null | number;
      description?: null | string;
      dueDate?: null | number;
      priority?: null | "low" | "medium" | "high";
      projectId?: null | string;
      title: string;
      userId: string;
      _id: Id<"todos">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "completed"
      | "createdAt"
      | "deletionTime"
      | "description"
      | "dueDate"
      | "priority"
      | "projectId"
      | "title"
      | "userId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      completed: ["completed", "_creationTime"];
      dueDate: ["dueDate", "_creationTime"];
      priority: ["priority", "_creationTime"];
      projectId: ["projectId", "_creationTime"];
      userId: ["userId", "_creationTime"];
      user_completed: ["userId", "completed", "_creationTime"];
    };
    searchIndexes: {
      search_title_description: {
        searchField: "title";
        filterFields: "completed" | "projectId" | "userId";
      };
    };
    vectorIndexes: {};
  };
  todoTags: {
    document: {
      createdAt?: number;
      tagId: string;
      todoId: string;
      _id: Id<"todoTags">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "tagId" | "todoId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      tagId: ["tagId", "_creationTime"];
      tagId_todoId: ["tagId", "todoId", "_creationTime"];
      todoId: ["todoId", "_creationTime"];
      todoId_tagId: ["todoId", "tagId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  triggerDemoAudit: {
    document: {
      createdAt?: number;
      hook: string;
      message?: null | string;
      operation: string;
      ownerId: string;
      recordId?: null | string;
      runId: string;
      _id: Id<"triggerDemoAudit">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "hook"
      | "message"
      | "operation"
      | "ownerId"
      | "recordId"
      | "runId";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      ownerId: ["ownerId", "_creationTime"];
      ownerId_runId: ["ownerId", "runId", "_creationTime"];
      runId: ["runId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  triggerDemoRecord: {
    document: {
      createdAt?: number;
      deleteGuard: boolean;
      email: string;
      lifecycleTag?: null | string;
      name: string;
      ownerId: string;
      recursivePatchCount: number;
      runId: string;
      status?: null | "draft" | "active" | "archived";
      test: string;
      updatedAt: number;
      _id: Id<"triggerDemoRecord">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "deleteGuard"
      | "email"
      | "lifecycleTag"
      | "name"
      | "ownerId"
      | "recursivePatchCount"
      | "runId"
      | "status"
      | "test"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      ownerId: ["ownerId", "_creationTime"];
      ownerId_runId: ["ownerId", "runId", "_creationTime"];
      runId: ["runId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  triggerDemoRun: {
    document: {
      createdAt?: number;
      ownerId: string;
      summary: any;
      _id: Id<"triggerDemoRun">;
      _creationTime: number;
    };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "ownerId" | "summary";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      ownerId: ["ownerId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  triggerDemoStats: {
    document: {
      changeCount: number;
      createCount: number;
      createdAt?: number;
      deleteCount: number;
      ownerId: string;
      runId: string;
      updateCount: number;
      updatedAt: number;
      _id: Id<"triggerDemoStats">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "changeCount"
      | "createCount"
      | "createdAt"
      | "deleteCount"
      | "ownerId"
      | "runId"
      | "updateCount"
      | "updatedAt";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      ownerId: ["ownerId", "_creationTime"];
      runId: ["runId", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  user: {
    document: {
      banExpires?: null | number;
      banReason?: null | string;
      banned?: null | boolean;
      bio?: null | string;
      createdAt?: number;
      customerId?: null | string;
      deletedAt?: null | number;
      email: string;
      emailVerified: boolean;
      firstName?: null | string;
      github?: null | string;
      image?: null | string;
      isAnonymous?: null | boolean;
      lastActiveOrganizationId?: null | string;
      lastName?: null | string;
      linkedin?: null | string;
      location?: null | string;
      name: string;
      personalOrganizationId?: null | string;
      role?: null | string;
      updatedAt: number;
      username?: null | string;
      website?: null | string;
      x?: null | string;
      _id: Id<"user">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "banExpires"
      | "banned"
      | "banReason"
      | "bio"
      | "createdAt"
      | "customerId"
      | "deletedAt"
      | "email"
      | "emailVerified"
      | "firstName"
      | "github"
      | "image"
      | "isAnonymous"
      | "lastActiveOrganizationId"
      | "lastName"
      | "linkedin"
      | "location"
      | "name"
      | "personalOrganizationId"
      | "role"
      | "updatedAt"
      | "username"
      | "website"
      | "x";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      customerId: ["customerId", "_creationTime"];
      email: ["email", "_creationTime"];
      email_name: ["email", "name", "_creationTime"];
      lastActiveOrganizationId: ["lastActiveOrganizationId", "_creationTime"];
      name: ["name", "_creationTime"];
      personalOrganizationId: ["personalOrganizationId", "_creationTime"];
      username: ["username", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
  verification: {
    document: {
      createdAt?: number;
      expiresAt: number;
      identifier: string;
      updatedAt: number;
      value: string;
      _id: Id<"verification">;
      _creationTime: number;
    };
    fieldPaths:
      | "_creationTime"
      | "_id"
      | "createdAt"
      | "expiresAt"
      | "identifier"
      | "updatedAt"
      | "value";
    indexes: {
      by_id: ["_id"];
      by_creation_time: ["_creationTime"];
      expiresAt: ["expiresAt", "_creationTime"];
      identifier: ["identifier", "_creationTime"];
    };
    searchIndexes: {};
    vectorIndexes: {};
  };
};

/**
 * The names of all of your Convex tables.
 */
export type TableNames = TableNamesInDataModel<DataModel>;

/**
 * The type of a document stored in Convex.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Doc<TableName extends TableNames> = DocumentByName<
  DataModel,
  TableName
>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(tableName, id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> =
  GenericId<TableName>;
