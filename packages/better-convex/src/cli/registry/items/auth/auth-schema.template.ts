export const AUTH_SCHEMA_TEMPLATE = `import {
  boolean,
  convexTable,
  defineSchemaExtension,
  index,
  integer,
  text,
  timestamp,
} from 'better-convex/orm';

export const userTable = convexTable(
  'user',
  {
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: integer().notNull(),
  },
  (t) => [index('email').on(t.email)]
);

export const sessionTable = convexTable(
  'session',
  {
    token: text().notNull(),
    expiresAt: integer().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: integer().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().references(() => userTable.id).notNull(),
  },
  (t) => [index('token').on(t.token), index('userId').on(t.userId)]
);

export const accountTable = convexTable(
  'account',
  {
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().references(() => userTable.id).notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer(),
    refreshTokenExpiresAt: integer(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: integer().notNull(),
  },
  (t) => [index('accountId').on(t.accountId), index('userId').on(t.userId)]
);

export const verificationTable = convexTable(
  'verification',
  {
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: integer().notNull(),
    createdAt: timestamp(),
    updatedAt: integer(),
  },
  (t) => [index('identifier').on(t.identifier)]
);

export const jwksTable = convexTable('jwks', {
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export function authExtension() {
  return defineSchemaExtension('auth', {
    user: userTable,
    session: sessionTable,
    account: accountTable,
    verification: verificationTable,
    jwks: jwksTable,
  });
}
`;

export const AUTH_CONVEX_SCHEMA_TEMPLATE = `import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const authSchema = {
  account: defineTable({
    accountId: v.string(),
    providerId: v.string(),
    userId: v.id('user'),
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    idToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    refreshTokenExpiresAt: v.optional(v.number()),
    scope: v.optional(v.string()),
    password: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('accountId', ['accountId'])
    .index('userId', ['userId']),
  jwks: defineTable({
    publicKey: v.string(),
    privateKey: v.string(),
    createdAt: v.number(),
  }),
  session: defineTable({
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    userId: v.id('user'),
  })
    .index('token', ['token'])
    .index('userId', ['userId']),
  user: defineTable({
    name: v.optional(v.string()),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('email', ['email']),
  verification: defineTable({
    identifier: v.string(),
    value: v.string(),
    expiresAt: v.number(),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  }).index('identifier', ['identifier']),
};
`;
