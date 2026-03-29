import {
  bigint,
  boolean,
  convexTable,
  defineSchema,
  index,
  integer,
  searchIndex,
  text,
  vector,
  vectorIndex,
} from 'kitcn/orm';

// ============================================================================
// kitcn ORM Schema (Drizzle-style)
// ============================================================================

export const users = convexTable(
  'users',
  {
    name: text().notNull(),
    email: text().notNull(),
    height: integer(),
    age: integer(),
    status: text(),
    role: text(),
    deletedAt: integer(),
    cityId: text(),
    homeCityId: text(),
  },
  (t) => [
    index('by_city').on(t.cityId),
    index('by_name').on(t.name),
    index('by_email').on(t.email),
    index('by_status').on(t.status),
    index('by_age').on(t.age),
    index('by_deleted_at').on(t.deletedAt),
  ]
);

export const cities = convexTable('cities', {
  name: text().notNull(),
});

export const posts = convexTable(
  'posts',
  {
    text: text().notNull(),
    numLikes: integer().notNull(),
    type: text().notNull(),
    title: text(),
    content: text(),
    published: boolean(),
    authorId: text(),
    publishedAt: integer(),
    embedding: vector(1536),
  },
  (t) => [
    index('by_author').on(t.authorId),
    index('by_published').on(t.published),
    index('by_published_at').on(t.publishedAt),
    index('by_title').on(t.title),
    index('numLikesAndType').on(t.type, t.numLikes),
    searchIndex('text_search').on(t.text).filter(t.type),
    vectorIndex('embedding_vec')
      .on(t.embedding)
      .dimensions(1536)
      .filter(t.type),
  ]
);

export const comments = convexTable(
  'comments',
  {
    postId: text().notNull(),
    authorId: text(),
    text: text().notNull(),
  },
  (t) => [index('by_post').on(t.postId), index('by_author').on(t.authorId)]
);

export const books = convexTable('books', {
  name: text().notNull(),
});

export const bookAuthors = convexTable(
  'bookAuthors',
  {
    bookId: text().notNull(),
    authorId: text().notNull(),
    role: text().notNull(),
  },
  (t) => [index('by_book').on(t.bookId), index('by_author').on(t.authorId)]
);

export const node = convexTable('node', {
  parentId: text(),
  leftId: text(),
  rightId: text(),
});

export const metrics = convexTable(
  'metrics',
  {
    total: bigint().notNull(),
    ratio: integer(),
    active: boolean().notNull(),
    ownerId: text(),
  },
  (t) => [index('by_owner').on(t.ownerId)]
);

export const tables = {
  users,
  cities,
  posts,
  comments,
  books,
  bookAuthors,
  node,
  metrics,
};

export default defineSchema(tables, {
  defaults: {
    defaultLimit: 1000,
    mutationExecutionMode: 'async',
    mutationBatchSize: 400,
    mutationLeafBatchSize: 1600,
    mutationMaxRows: 10000,
    mutationMaxBytesPerBatch: 2_097_152,
    mutationScheduleCallCap: 800,
    mutationAsyncDelayMs: 0,
  },
}).relations((r) => ({
  users: {
    city: r.one.cities({
      from: r.users.cityId,
      to: r.cities.id,
      alias: 'UsersInCity',
    }),
    homeCity: r.one.cities({
      from: r.users.homeCityId,
      to: r.cities.id,
    }),
    posts: r.many.posts({
      from: r.users.id,
      to: r.posts.authorId,
    }),
    comments: r.many.comments({
      from: r.users.id,
      to: r.comments.authorId,
    }),
  },
  cities: {
    users: r.many.users({
      from: r.cities.id,
      to: r.users.cityId,
      alias: 'UsersInCity',
    }),
  },
  posts: {
    author: r.one.users({
      from: r.posts.authorId,
      to: r.users.id,
    }),
    comments: r.many.comments({
      from: r.posts.id,
      to: r.comments.postId,
    }),
  },
  comments: {
    post: r.one.posts({
      from: r.comments.postId,
      to: r.posts.id,
    }),
    author: r.one.users({
      from: r.comments.authorId,
      to: r.users.id,
    }),
  },
  books: {
    authors: r.many.users({
      from: r.books.id.through(r.bookAuthors.bookId),
      to: r.users.id.through(r.bookAuthors.authorId),
    }),
  },
  bookAuthors: {
    book: r.one.books({
      from: r.bookAuthors.bookId,
      to: r.books.id,
    }),
    author: r.one.users({
      from: r.bookAuthors.authorId,
      to: r.users.id,
    }),
  },
}));
