import { defineRelations } from 'kitcn/orm';
import {
  bookAuthors,
  books,
  cities,
  comments,
  metrics,
  node,
  posts,
  users,
} from '../../convex/schema';
import { type Equal, Expect } from './utils';

const relations = defineRelations(
  {
    users,
    cities,
    posts,
    comments,
    books,
    bookAuthors,
    node,
    metrics,
  },
  (r) => ({
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
  })
);

export {
  bookAuthors,
  books,
  cities,
  comments,
  metrics,
  node,
  posts,
  relations,
  users,
};

type UsersTableName = typeof users._.name;
Expect<Equal<UsersTableName, 'users'>>;

type UsersRelationKeys = keyof typeof relations.users.relations;
type ExpectedUsersRelationKeys = 'city' | 'homeCity' | 'posts' | 'comments';
Expect<Equal<UsersRelationKeys, ExpectedUsersRelationKeys>>;
