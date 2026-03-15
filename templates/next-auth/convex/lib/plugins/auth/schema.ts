import {
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
