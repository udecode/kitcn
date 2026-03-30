import {
  convexTable,
  type DatabaseWithMutations,
  defineRelations,
  defineSchema,
  eq,
  extractRelationsConfig,
  foreignKey,
  id,
  index,
  text,
} from 'kitcn/orm';
import { describe, expect, it } from 'vitest';
import { withOrmCtx } from '../setup.testing';

const users = convexTable(
  'fk_users',
  {
    name: text().notNull(),
    slug: text().notNull(),
  },
  (t) => [index('by_slug').on(t.slug)]
);

const profiles = convexTable('fk_profiles', {
  userId: id('fk_users'),
});

const memberships = convexTable(
  'fk_memberships',
  {
    userSlug: text(),
  },
  (t) => [foreignKey({ columns: [t.userSlug], foreignColumns: [users.slug] })]
);

const profileSlugs = convexTable('fk_profile_slugs', {
  userSlug: text().references(() => users.slug),
});

const teams = convexTable('fk_teams', {
  slug: text().notNull(),
});

const teamMembers = convexTable(
  'fk_team_members',
  {
    teamSlug: text().notNull(),
  },
  (t) => [foreignKey({ columns: [t.teamSlug], foreignColumns: [teams.slug] })]
);

const rawSchema = {
  fk_users: users,
  fk_profiles: profiles,
  fk_memberships: memberships,
  fk_profile_slugs: profileSlugs,
  fk_teams: teams,
  fk_team_members: teamMembers,
};

const schema = defineSchema(rawSchema);
const relations = defineRelations(rawSchema);
const edges = extractRelationsConfig(relations);

const withCtx = async <T>(
  fn: (ctx: { orm: DatabaseWithMutations<typeof relations> }) => Promise<T>
) => withOrmCtx(schema, relations, async ({ orm }) => fn({ orm }));

const asAnyId = (id: unknown) => id as any;

describe('foreign key enforcement', () => {
  it('enforces _id references on insert', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ name: 'Ada', slug: 'ada' })
        .returning();

      await orm
        .insert(profiles)
        .values({ userId: asAnyId(user.id) })
        .returning();

      await expect(
        orm.insert(profiles).values({ userId: 'missing' as any })
      ).rejects.toThrow(/foreign/i);
    }));

  it('enforces _id references on update when changed', async () =>
    withCtx(async ({ orm }) => {
      const [user] = await orm
        .insert(users)
        .values({ name: 'Ada', slug: 'ada' })
        .returning();

      const [profile] = await orm
        .insert(profiles)
        .values({ userId: asAnyId(user.id) })
        .returning();

      await expect(
        orm
          .update(profiles)
          .set({ userId: 'missing' as any })
          .where(eq(profiles.id, asAnyId(profile.id)))
          .returning()
      ).rejects.toThrow(/foreign/i);
    }));

  it('allows null foreign keys', async () =>
    withCtx(async ({ orm }) => {
      await orm.insert(profiles).values({ userId: null });
    }));

  it('requires index for non-_id references', async () =>
    withCtx(async ({ orm }) => {
      await orm.insert(teams).values({ slug: 'alpha' }).returning();

      await expect(
        orm.insert(teamMembers).values({ teamSlug: 'alpha' })
      ).rejects.toThrow(/index/i);
    }));

  it('enforces non-_id references when index exists', async () =>
    withCtx(async ({ orm }) => {
      await orm.insert(users).values({ name: 'Ada', slug: 'ada' }).returning();

      await orm.insert(memberships).values({ userSlug: 'ada' }).returning();

      await expect(
        orm.insert(memberships).values({ userSlug: 'missing' })
      ).rejects.toThrow(/foreign/i);
    }));

  it('enforces column references', async () =>
    withCtx(async ({ orm }) => {
      await orm.insert(users).values({ name: 'Ada', slug: 'ada' }).returning();

      await orm.insert(profileSlugs).values({ userSlug: 'ada' }).returning();

      await expect(
        orm.insert(profileSlugs).values({ userSlug: 'missing' })
      ).rejects.toThrow(/foreign/i);
    }));
});
