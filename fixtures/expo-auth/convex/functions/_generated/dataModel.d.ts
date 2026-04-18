/* eslint-disable */
/**
 * Generated data model types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx concave codegen`.
 * @module
 */

import type { AnyDataModel, DocumentByName, TableNamesInDataModel, SystemTableNames } from "convex/server";
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
    document: { accountId: string; providerId: string; userId: string; accessToken?: null | string; refreshToken?: null | string; idToken?: null | string; accessTokenExpiresAt?: null | number; refreshTokenExpiresAt?: null | number; scope?: null | string; password?: null | string; createdAt: number; updatedAt: number; _id: Id<"account">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "accessToken" | "accessTokenExpiresAt" | "accountId" | "createdAt" | "idToken" | "password" | "providerId" | "refreshToken" | "refreshTokenExpiresAt" | "scope" | "updatedAt" | "userId";
    indexes: {
      "accountId": ["accountId"];
      "accountId_providerId": ["accountId","providerId"];
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "providerId_userId": ["providerId","userId"];
      "userId": ["userId"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_bucket: {
    document: { tableKey: string; indexName: string; keyHash: string; keyParts: Array<null | any>; count: number; sumValues: Record<string, number>; nonNullCountValues: Record<string, number>; updatedAt: number; _id: Id<"aggregate_bucket">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "count" | "indexName" | "keyHash" | "keyParts" | "nonNullCountValues" | `nonNullCountValues.${string}` | "sumValues" | `sumValues.${string}` | "tableKey" | "updatedAt";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_table_index": ["tableKey","indexName"];
      "by_table_index_hash": ["tableKey","indexName","keyHash"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_extrema: {
    document: { tableKey: string; indexName: string; keyHash: string; fieldName: string; valueHash: string; value: any; sortKey: string; count: number; updatedAt: number; _id: Id<"aggregate_extrema">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "count" | "fieldName" | "indexName" | "keyHash" | "sortKey" | "tableKey" | "updatedAt" | "value" | "valueHash";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_table_index": ["tableKey","indexName"];
      "by_table_index_hash_field_sort": ["tableKey","indexName","keyHash","fieldName","sortKey"];
      "by_table_index_hash_field_value": ["tableKey","indexName","keyHash","fieldName","valueHash"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_member: {
    document: { kind: string; tableKey: string; indexName: string; docId: string; keyHash: string; keyParts: Array<null | any>; sumValues: Record<string, number>; nonNullCountValues: Record<string, number>; extremaValues: Record<string, null | any>; rankNamespace?: null | any; rankKey?: null | any; rankSumValue?: null | number; updatedAt: number; _id: Id<"aggregate_member">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "docId" | "extremaValues" | `extremaValues.${string}` | "indexName" | "keyHash" | "keyParts" | "kind" | "nonNullCountValues" | `nonNullCountValues.${string}` | "rankKey" | "rankNamespace" | "rankSumValue" | "sumValues" | `sumValues.${string}` | "tableKey" | "updatedAt";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_kind_table_index": ["kind","tableKey","indexName"];
      "by_kind_table_index_doc": ["kind","tableKey","indexName","docId"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_rank_node: {
    document: { aggregate?: null | { count: number; sum: number }; items: Array<{ k: null | any; v: null | any; s: number }>; subtrees: Array<string>; _id: Id<"aggregate_rank_node">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "aggregate" | "aggregate.count" | "aggregate.sum" | "items" | "subtrees";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_rank_tree: {
    document: { aggregateName: string; maxNodeSize: number; namespace?: null | any; root: Id<"aggregate_rank_node">; _id: Id<"aggregate_rank_tree">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "aggregateName" | "maxNodeSize" | "namespace" | "root";
    indexes: {
      "by_aggregate_name": ["aggregateName"];
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_namespace": ["namespace"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  aggregate_state: {
    document: { kind: string; tableKey: string; indexName: string; keyDefinitionHash: string; metricDefinitionHash: string; status: string; cursor?: null | string; processed: number; startedAt: number; updatedAt: number; completedAt?: null | number; lastError?: null | string; _id: Id<"aggregate_state">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "completedAt" | "cursor" | "indexName" | "keyDefinitionHash" | "kind" | "lastError" | "metricDefinitionHash" | "processed" | "startedAt" | "status" | "tableKey" | "updatedAt";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_kind_status": ["kind","status"];
      "by_kind_table_index": ["kind","tableKey","indexName"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  jwks: {
    document: { publicKey: string; privateKey: string; createdAt: number; expiresAt?: null | number; _id: Id<"jwks">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "expiresAt" | "privateKey" | "publicKey";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  messages: {
    document: { body: string; _id: Id<"messages">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "body";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  migration_run: {
    document: { runId: string; direction: string; status: string; dryRun: boolean; allowDrift: boolean; migrationIds: Array<string>; currentIndex: number; startedAt: number; updatedAt: number; completedAt?: null | number; cancelRequested: boolean; lastError?: null | string; _id: Id<"migration_run">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "allowDrift" | "cancelRequested" | "completedAt" | "currentIndex" | "direction" | "dryRun" | "lastError" | "migrationIds" | "runId" | "startedAt" | "status" | "updatedAt";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_run_id": ["runId"];
      "by_status": ["status"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  migration_state: {
    document: { migrationId: string; checksum: string; applied: boolean; status: string; direction?: null | string; runId?: null | string; cursor?: null | string; processed: number; startedAt?: null | number; updatedAt: number; completedAt?: null | number; lastError?: null | string; writeMode: string; _id: Id<"migration_state">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "applied" | "checksum" | "completedAt" | "cursor" | "direction" | "lastError" | "migrationId" | "processed" | "runId" | "startedAt" | "status" | "updatedAt" | "writeMode";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "by_migration_id": ["migrationId"];
      "by_status": ["status"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  session: {
    document: { expiresAt: number; token: string; createdAt: number; updatedAt: number; ipAddress?: null | string; userAgent?: null | string; userId: string; _id: Id<"session">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "expiresAt" | "ipAddress" | "token" | "updatedAt" | "userAgent" | "userId";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "expiresAt": ["expiresAt"];
      "expiresAt_userId": ["expiresAt","userId"];
      "session_token_unique": ["token"];
      "userId": ["userId"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  user: {
    document: { name: string; email: string; emailVerified: boolean; image?: null | string; createdAt: number; updatedAt: number; userId?: null | string; _id: Id<"user">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "email" | "emailVerified" | "image" | "name" | "updatedAt" | "userId";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "email_name": ["email","name"];
      "name": ["name"];
      "user_email_unique": ["email"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
  };
  verification: {
    document: { identifier: string; value: string; expiresAt: number; createdAt: number; updatedAt: number; _id: Id<"verification">; _creationTime: number };
    fieldPaths: "_creationTime" | "_id" | "createdAt" | "expiresAt" | "identifier" | "updatedAt" | "value";
    indexes: {
      "by_creation_time": ["_creationTime"];
      "by_id": ["_id"];
      "expiresAt": ["expiresAt"];
      "identifier": ["identifier"];
    };
    searchIndexes: {
    };
    vectorIndexes: {
    };
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
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;

/**
 * An identifier for a document in Convex.
 *
 * Convex documents are uniquely identified by their `Id`, which is accessible
 * on the `_id` field. To learn more, see [Document IDs](https://docs.convex.dev/using/document-ids).
 *
 * Documents can be loaded using `db.get(id)` in query and mutation functions.
 *
 * IDs are just strings at runtime, but this type can be used to distinguish them from other
 * strings when type checking.
 *
 * @typeParam TableName - A string literal type of the table name (like "users").
 */
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;