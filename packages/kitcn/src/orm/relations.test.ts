/**
 * M2 Relations Layer - v1 Validation Tests
 */
/** biome-ignore-all lint/performance/useTopLevelRegex: inline regex assertions are intentional in tests. */

import {
  convexTable,
  defineRelations,
  extractRelationsConfig,
  id,
  text,
} from './index';

describe('M2 Relations Layer (v1)', () => {
  describe('Relation Definition', () => {
    it('should create one() relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        profileId: id('profiles').notNull(),
      });

      const profiles = convexTable('profiles', {
        bio: text().notNull(),
      });

      const relations = defineRelations({ users, profiles }, (r) => ({
        users: {
          profile: r.one.profiles({
            from: r.users.profileId,
            to: r.profiles.id,
          }),
        },
      }));

      expect(relations).toBeDefined();
      expect(relations.users.table).toBe(users);
      expect(relations.users.relations.profile).toBeDefined();
    });

    it('should create many() relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        users: {
          posts: r.many.posts({
            from: r.users.id,
            to: r.posts.authorId,
          }),
        },
      }));

      expect(relations).toBeDefined();
      expect(relations.users.table).toBe(users);
      expect(relations.users.relations.posts).toBeDefined();
    });

    it('should create bidirectional relations', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        users: {
          posts: r.many.posts(),
        },
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
          }),
        },
      }));

      expect(relations.users.relations.posts).toBeDefined();
      expect(relations.posts.relations.author).toBeDefined();
    });
  });

  describe('Schema Extraction', () => {
    it('should extract simple one-to-many relation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        users: {
          posts: r.many.posts({
            from: r.users.id,
            to: r.posts.authorId,
          }),
        },
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
          }),
        },
      }));

      const edges = extractRelationsConfig(relations);

      expect(edges).toHaveLength(2);

      const postsEdge = edges.find((e) => e.edgeName === 'posts');
      expect(postsEdge).toMatchObject({
        sourceTable: 'users',
        edgeName: 'posts',
        targetTable: 'posts',
        cardinality: 'many',
        sourceFields: ['_id'],
        targetFields: ['authorId'],
      });

      const authorEdge = edges.find((e) => e.edgeName === 'author');
      expect(authorEdge).toMatchObject({
        sourceTable: 'posts',
        edgeName: 'author',
        targetTable: 'users',
        cardinality: 'one',
        sourceFields: ['authorId'],
        targetFields: ['_id'],
      });
    });

    it('should detect inverse relations', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        users: {
          posts: r.many.posts(),
        },
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
          }),
        },
      }));

      const edges = extractRelationsConfig(relations);

      const postsEdge = edges.find((e) => e.edgeName === 'posts');
      const authorEdge = edges.find((e) => e.edgeName === 'author');

      expect(postsEdge?.inverseEdge).toBe(authorEdge);
      expect(authorEdge?.inverseEdge).toBe(postsEdge);
    });
  });

  describe('Validation', () => {
    it('should reject relation name that collides with column', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      expect(() => {
        defineRelations({ users, posts }, (r) => ({
          users: {
            name: r.many.posts(),
          },
        }));
      }).toThrow(/relation name collides/);
    });

    it('should reject undefined target table', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
          }),
        },
      }));

      const invalidRelations = {
        posts: relations.posts,
      } as any;

      expect(() => {
        extractRelationsConfig(invalidRelations);
      }).toThrow(/references undefined table/);
    });

    it('should reject columns from the wrong table', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const profiles = convexTable('profiles', {
        bio: text().notNull(),
      });

      expect(() => {
        defineRelations({ users, profiles }, (r) => ({
          users: {
            profile: r.one.profiles({
              // Wrong table: using profiles.id as source
              from: r.profiles.id,
              to: r.profiles.id,
            }),
          },
        }));
      }).toThrow(/from" columns must belong/);
    });

    it('should reject circular dependencies', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        managerId: id('users').notNull(),
      });

      const relations = defineRelations({ users }, (r) => ({
        users: {
          manager: r.one.users({
            from: r.users.managerId,
            to: r.users.id,
          }),
        },
      }));

      expect(() => {
        extractRelationsConfig(relations);
      }).toThrow(/Circular dependency/);
    });
  });

  describe('Alias Disambiguation', () => {
    it('should use alias for disambiguation', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const posts = convexTable('posts', {
        title: text().notNull(),
        authorId: id('users').notNull(),
        editorId: id('users').notNull(),
      });

      const relations = defineRelations({ users, posts }, (r) => ({
        posts: {
          author: r.one.users({
            from: r.posts.authorId,
            to: r.users.id,
            alias: 'authored',
          }),
          editor: r.one.users({
            from: r.posts.editorId,
            to: r.users.id,
            alias: 'edited',
          }),
        },
        users: {
          authoredPosts: r.many.posts({
            from: r.users.id,
            to: r.posts.authorId,
            alias: 'authored',
          }),
          editedPosts: r.many.posts({
            from: r.users.id,
            to: r.posts.editorId,
            alias: 'edited',
          }),
        },
      }));

      const edges = extractRelationsConfig(relations);

      const authorEdge = edges.find((e) => e.edgeName === 'author');
      const authoredPostsEdge = edges.find(
        (e) => e.edgeName === 'authoredPosts'
      );

      expect(authorEdge?.inverseEdge).toBe(authoredPostsEdge);
      expect(authoredPostsEdge?.inverseEdge).toBe(authorEdge);
    });

    it('should pair organization helper relations when the many() side uses aliases and the one() side uses matching edge names', () => {
      const organization = convexTable('organization', {
        name: text().notNull(),
      });

      const user = convexTable('user', {
        name: text().notNull(),
        lastActiveOrganizationId: id('organization'),
        personalOrganizationId: id('organization'),
      });

      const relations = defineRelations({ organization, user }, (r) => ({
        organization: {
          usersAsLastActiveOrganization: r.many.user({
            from: r.organization.id,
            to: r.user.lastActiveOrganizationId,
            alias: 'lastActiveOrganization',
          }),
          usersAsPersonalOrganization: r.many.user({
            from: r.organization.id,
            to: r.user.personalOrganizationId,
            alias: 'personalOrganization',
          }),
        },
        user: {
          lastActiveOrganization: r.one.organization({
            from: r.user.lastActiveOrganizationId,
            to: r.organization.id,
          }),
          personalOrganization: r.one.organization({
            from: r.user.personalOrganizationId,
            to: r.organization.id,
          }),
        },
      }));

      expect(() => extractRelationsConfig(relations)).not.toThrow();

      const edges = extractRelationsConfig(relations);
      const usersAsLastActiveOrganization = edges.find(
        (edge) => edge.edgeName === 'usersAsLastActiveOrganization'
      );
      const lastActiveOrganization = edges.find(
        (edge) => edge.edgeName === 'lastActiveOrganization'
      );
      const usersAsPersonalOrganization = edges.find(
        (edge) => edge.edgeName === 'usersAsPersonalOrganization'
      );
      const personalOrganization = edges.find(
        (edge) => edge.edgeName === 'personalOrganization'
      );

      expect(usersAsLastActiveOrganization?.inverseEdge).toBe(
        lastActiveOrganization
      );
      expect(lastActiveOrganization?.inverseEdge).toBe(
        usersAsLastActiveOrganization
      );
      expect(usersAsPersonalOrganization?.inverseEdge).toBe(
        personalOrganization
      );
      expect(personalOrganization?.inverseEdge).toBe(
        usersAsPersonalOrganization
      );
    });
  });

  describe('Many-to-Many Inverses', () => {
    it('should pair many-to-many inverses via .through()', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const groups = convexTable('groups', {
        name: text().notNull(),
      });

      const usersToGroups = convexTable('usersToGroups', {
        userId: id('users').notNull(),
        groupId: id('groups').notNull(),
      });

      const relations = defineRelations(
        { users, groups, usersToGroups },
        (r) => ({
          users: {
            groups: r.many.groups({
              from: r.users.id.through(r.usersToGroups.userId),
              to: r.groups.id.through(r.usersToGroups.groupId),
              alias: 'users-groups-direct',
            }),
          },
          groups: {
            users: r.many.users({
              from: r.groups.id.through(r.usersToGroups.groupId),
              to: r.users.id.through(r.usersToGroups.userId),
              alias: 'users-groups-direct',
            }),
          },
        })
      );

      expect(() => extractRelationsConfig(relations)).not.toThrow();

      const edges = extractRelationsConfig(relations);
      const usersGroups = edges.find((e) => e.edgeName === 'groups');
      const groupsUsers = edges.find((e) => e.edgeName === 'users');

      expect(usersGroups?.inverseEdge).toBe(groupsUsers);
      expect(groupsUsers?.inverseEdge).toBe(usersGroups);
    });

    it('should pair many-to-many inverses even when another relation between the same tables exists', () => {
      const users = convexTable('users', {
        name: text().notNull(),
      });

      const projects = convexTable('projects', {
        name: text().notNull(),
        ownerId: id('users').notNull(),
      });

      const projectMembers = convexTable('projectMembers', {
        projectId: id('projects').notNull(),
        userId: id('users').notNull(),
      });

      const relations = defineRelations(
        { users, projects, projectMembers },
        (r) => ({
          projects: {
            owner: r.one.users({
              from: r.projects.ownerId,
              to: r.users.id,
              alias: 'ProjectOwner',
            }),
            members: r.many.users({
              from: r.projects.id.through(r.projectMembers.projectId),
              to: r.users.id.through(r.projectMembers.userId),
              alias: 'ProjectMembers',
            }),
          },
          users: {
            ownedProjects: r.many.projects({
              from: r.users.id,
              to: r.projects.ownerId,
              alias: 'ProjectOwner',
            }),
            memberProjects: r.many.projects({
              from: r.users.id.through(r.projectMembers.userId),
              to: r.projects.id.through(r.projectMembers.projectId),
              alias: 'ProjectMembers',
            }),
          },
        })
      );

      expect(() => extractRelationsConfig(relations)).not.toThrow();

      const edges = extractRelationsConfig(relations);

      const projectsOwner = edges.find((e) => e.edgeName === 'owner');
      const usersOwnedProjects = edges.find(
        (e) => e.edgeName === 'ownedProjects'
      );
      expect(projectsOwner?.inverseEdge).toBe(usersOwnedProjects);
      expect(usersOwnedProjects?.inverseEdge).toBe(projectsOwner);

      const projectsMembers = edges.find((e) => e.edgeName === 'members');
      const usersMemberProjects = edges.find(
        (e) => e.edgeName === 'memberProjects'
      );
      expect(projectsMembers?.inverseEdge).toBe(usersMemberProjects);
      expect(usersMemberProjects?.inverseEdge).toBe(projectsMembers);
    });
  });

  describe('Self-Referencing Relations', () => {
    it('should allow self-referencing one() relations when the FK is nullable', () => {
      const users = convexTable('users', {
        name: text().notNull(),
        managerId: id('users'),
      });

      const relations = defineRelations({ users }, (r) => ({
        users: {
          manager: r.one.users({
            from: r.users.managerId,
            to: r.users.id,
            alias: 'manager',
          }),
          reports: r.many.users({
            from: r.users.id,
            to: r.users.managerId,
            alias: 'manager',
          }),
        },
      }));

      expect(() => extractRelationsConfig(relations)).not.toThrow();
    });
  });
});
