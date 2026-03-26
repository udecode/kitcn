import {
  boolean,
  convexTable,
  defineSchema,
  index,
  text,
  timestamp,
} from 'better-convex/orm';

export const messagesTable = convexTable('messages', {
  body: text().notNull(),
});

/* better-convex-managed auth:user:declaration:start */
export const userTable = convexTable(
  "user",
  {
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    userId: text(),
  },
  (userTable) => [
    index("email_name").on(userTable.email, userTable.name),
    index("name").on(userTable.name),
  ]
);
/* better-convex-managed auth:user:declaration:end */

/* better-convex-managed auth:session:declaration:start */
export const sessionTable = convexTable(
  "session",
  {
    expiresAt: timestamp().notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => userTable.id),
  },
  (sessionTable) => [
    index("expiresAt").on(sessionTable.expiresAt),
    index("expiresAt_userId").on(sessionTable.expiresAt, sessionTable.userId),
    index("userId").on(sessionTable.userId),
  ]
);
/* better-convex-managed auth:session:declaration:end */

/* better-convex-managed auth:account:declaration:start */
export const accountTable = convexTable(
  "account",
  {
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => userTable.id),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (accountTable) => [
    index("accountId").on(accountTable.accountId),
    index("accountId_providerId").on(accountTable.accountId, accountTable.providerId),
    index("providerId_userId").on(accountTable.providerId, accountTable.userId),
    index("userId").on(accountTable.userId),
  ]
);
/* better-convex-managed auth:account:declaration:end */

/* better-convex-managed auth:verification:declaration:start */
export const verificationTable = convexTable(
  "verification",
  {
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (verificationTable) => [
    index("expiresAt").on(verificationTable.expiresAt),
    index("identifier").on(verificationTable.identifier),
  ]
);
/* better-convex-managed auth:verification:declaration:end */

/* better-convex-managed auth:jwks:declaration:start */
export const jwksTable = convexTable(
  "jwks",
  {
    publicKey: text().notNull(),
    privateKey: text().notNull(),
    createdAt: timestamp().notNull(),
    expiresAt: timestamp(),
  }
);
/* better-convex-managed auth:jwks:declaration:end */

export const tables = {
  messages: messagesTable,
  /* better-convex-managed auth:user:registration:start */
  user: userTable,
  /* better-convex-managed auth:user:registration:end */
  /* better-convex-managed auth:session:registration:start */
  session: sessionTable,
  /* better-convex-managed auth:session:registration:end */
  /* better-convex-managed auth:account:registration:start */
  account: accountTable,
  /* better-convex-managed auth:account:registration:end */
  /* better-convex-managed auth:verification:registration:start */
  verification: verificationTable,
  /* better-convex-managed auth:verification:registration:end */
  /* better-convex-managed auth:jwks:registration:start */
  jwks: jwksTable,
  /* better-convex-managed auth:jwks:registration:end */
};

export default defineSchema(tables).relations((r) => ({
  /* better-convex-managed auth:user:relations:start */
  user: {
      sessions: r.many.session({
        from: r.user.id,
        to: r.session.userId,
      }),
      accounts: r.many.account({
        from: r.user.id,
        to: r.account.userId,
      }),
    },
  /* better-convex-managed auth:user:relations:end */
  /* better-convex-managed auth:session:relations:start */
  session: {
      user: r.one.user({
        from: r.session.userId,
        to: r.user.id,
      }),
    },
  /* better-convex-managed auth:session:relations:end */
  /* better-convex-managed auth:account:relations:start */
  account: {
      user: r.one.user({
        from: r.account.userId,
        to: r.user.id,
      }),
    },
  /* better-convex-managed auth:account:relations:end */
}));
