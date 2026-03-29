import {
  boolean,
  convexTable,
  defineSchema,
  index,
  text,
  timestamp,
} from 'kitcn/orm';

export const messagesTable = convexTable('messages', {
  body: text().notNull(),
});

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

export const jwksTable = convexTable(
  "jwks",
  {
    publicKey: text().notNull(),
    privateKey: text().notNull(),
    createdAt: timestamp().notNull(),
    expiresAt: timestamp(),
  }
);

export const tables = {
  messages: messagesTable,
  user: userTable,
  session: sessionTable,
  account: accountTable,
  verification: verificationTable,
  jwks: jwksTable,
};

export default defineSchema(tables).relations((r) => ({
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
}));
