// IMPORTANT: Import polyfills FIRST
import '../lib/polar-polyfills';

import { type BetterAuthOptions, betterAuth } from 'better-auth';
import { admin, organization } from 'better-auth/plugins';
import {
  type AuthFunctions,
  convex,
  createApi,
  createClient,
} from 'better-convex/auth';
import { eq } from 'better-convex/orm';
import { requireActionCtx } from 'better-convex/server';
import { getEnv } from '../lib/get-env';
import { createPersonalOrganization } from '../lib/organization-helpers';
import { ac, roles } from '../shared/auth-shared';
import { internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import { type GenericCtx, type MutationCtx, withOrm } from './generated';
import schema, { sessionTable } from './schema';

const authFunctions: AuthFunctions = internal.auth;

export const authClient = createClient<DataModel, typeof schema, MutationCtx>({
  authFunctions,
  schema,
  context: withOrm,
  triggers: {
    user: {
      beforeCreate: async (_ctx, data) => {
        const env = getEnv();
        const adminEmails = env.ADMIN;

        // Check if this user email is in the admin list and update role
        const role =
          data.role !== 'admin' && adminEmails?.includes(data.email)
            ? 'admin'
            : data.role;

        return {
          ...data,
          role,
        };
      },
      onCreate: async (ctx, user) => {
        // Create personal organization for the new user
        await createPersonalOrganization(ctx, {
          email: user.email,
          image: user.image || null,
          name: user.name,
          userId: user._id,
        });

        // Create Polar customer for the new user
        await ctx.scheduler.runAfter(0, internal.polarCustomer.createCustomer, {
          email: user.email,
          name: user.name,
          userId: user._id,
        });
      },
    },
    session: {
      onCreate: async (ctx, session) => {
        if (!session.activeOrganizationId) {
          const user = await ctx.orm.query.user.findFirst({
            where: { id: session.userId },
          });
          if (!user) return;

          const activeOrganizationId =
            user.lastActiveOrganizationId ??
            user.personalOrganizationId ??
            null;

          await ctx.orm
            .update(sessionTable)
            .set({ activeOrganizationId })
            .where(eq(sessionTable.id, session._id));
        }
      },
    },
  },
});

const getAuthOptions = (ctx: GenericCtx) => {
  const env = getEnv();

  return {
    emailAndPassword: {
      enabled: true,
    },
    account: {
      accountLinking: {
        enabled: true,
        updateUserInfoOnLink: true,
        trustedProviders: ['google', 'github'],
      },
    },
    baseURL: env.SITE_URL,
    plugins: [
      admin(),
      organization({
        ac,
        roles,
        allowUserToCreateOrganization: true, // Will gate with
        creatorRole: 'owner',
        invitationExpiresIn: 24 * 60 * 60 * 7, // 7 days
        membershipLimit: 100,
        organizationLimit: 3,
        schema: {
          organization: {
            additionalFields: {
              monthlyCredits: {
                required: true,
                type: 'number',
              },
            },
          },
        },
        sendInvitationEmail: async (data) => {
          await requireActionCtx(ctx).scheduler.runAfter(
            0,
            internal.email.sendOrganizationInviteEmail,
            {
              acceptUrl: `${env.SITE_URL}/w/${data.organization.slug}?invite=${data.id}`,
              invitationId: data.id,
              inviterEmail: data.inviter.user.email,
              inviterName: data.inviter.user.name || 'Team Admin',
              organizationName: data.organization.name,
              role: data.role,
              to: data.email,
            }
          );
        },
      }),
      convex({
        authConfig,
        jwks: env.JWKS,
        jwt: {
          // expirationSeconds: 70, // testing value, default is 15m expiry (60s leeway)
        },
      }),
      // TODO: polar breaks performance, disable for now
      // polar({
      //   client: new Polar({
      //     accessToken: env.POLAR_ACCESS_TOKEN!,
      //     server:
      //       env.POLAR_SERVER === 'production'
      //         ? 'production'
      //         : 'sandbox',
      //   }),
      //   // NO createCustomerOnSignUp - handled via scheduler in user.onCreate trigger
      //   use: [
      //     checkout({
      //       authenticatedUsersOnly: true,
      //       products: [
      //         {
      //           productId: env.POLAR_PRODUCT_PREMIUM,
      //           slug: 'premium',
      //         },
      //       ],
      //       successUrl: `${env.SITE_URL}/success?checkout_id={CHECKOUT_ID}`,
      //       theme: 'light',
      //     }),
      //     portal(), // Customer portal management
      //     webhooks({
      //       secret: env.POLAR_WEBHOOK_SECRET!,

      //       // Link Polar customer to user via externalId
      //       onCustomerCreated: async (payload) => {
      //         // IMPORTANT: Use externalId, not metadata.userId
      //         const userId = payload?.data.externalId;
      //         if (!userId) return;

      //         await (ctx as ActionCtx).runMutation(
      //           internal.polarCustomer.updateUserPolarCustomerId,
      //           {
      //             customerId: payload.data.id,
      //             userId,
      //           }
      //         );
      //       },

      //       // Create subscription record
      //       onSubscriptionCreated: async (payload) => {
      //         // IMPORTANT: Check customer.externalId, not customer.metadata.userId
      //         if (!payload.data.customer.externalId) return;

      //         await (ctx as ActionCtx).runMutation(
      //           internal.polarSubscription.createSubscription,
      //           { subscription: convertToDatabaseSubscription(payload.data) }
      //         );
      //       },

      //       // Update subscription
      //       onSubscriptionUpdated: async (payload) => {
      //         if (!payload.data.customer.externalId) return;

      //         await (ctx as ActionCtx).runMutation(
      //           internal.polarSubscription.updateSubscription,
      //           { subscription: convertToDatabaseSubscription(payload.data) }
      //         );
      //       },
      //     }),
      //   ],
      // }),
    ],
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 * 15, // 15 days
    },
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        mapProfileToUser: async (profile) => {
          return {
            // Better Auth standard fields
            email: profile.email,
            image: profile.avatar_url,
            name: profile.name || profile.login,
            // Additional fields that will be available in onCreateUser
            bio: profile.bio || undefined,
            firstName: profile.name?.split(' ')[0] || undefined,
            github: profile.login,
            lastName: profile.name?.split(' ').slice(1).join(' ') || undefined,
            location: profile.location || undefined,
            username: profile.login,
            x: profile.twitter_username || undefined,
          };
        },
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        mapProfileToUser: async (profile) => {
          return {
            // Better Auth standard fields
            email: profile.email,
            image: profile.picture,
            name: profile.name,
            // Additional fields that will be available in onCreateUser
            firstName: profile.given_name || undefined,
            lastName: profile.family_name || undefined,
          };
        },
      },
    },
    telemetry: { enabled: false },
    trustedOrigins: [env.SITE_URL],
    user: {
      additionalFields: {
        bio: {
          required: false,
          type: 'string',
        },
        firstName: {
          required: false,
          type: 'string',
        },
        github: {
          required: false,
          type: 'string',
        },
        lastName: {
          required: false,
          type: 'string',
        },
        linkedin: {
          required: false,
          type: 'string',
        },
        location: {
          required: false,
          type: 'string',
        },
        username: {
          required: false,
          type: 'string',
        },
        website: {
          required: false,
          type: 'string',
        },
        x: {
          required: false,
          type: 'string',
        },
      },
      changeEmail: {
        enabled: false,
      },
      deleteUser: {
        enabled: false,
      },
    },
    database: authClient.adapter(ctx, getAuthOptions),
  } satisfies BetterAuthOptions;
};

export const getAuth = (ctx: GenericCtx) => betterAuth(getAuthOptions(ctx));

export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
  getLatestJwks,
  rotateKeys,
} = createApi(schema, getAuth, {
  context: withOrm,
  skipValidation: true,
});

export const {
  beforeCreate,
  beforeDelete,
  beforeUpdate,
  onCreate,
  onDelete,
  onUpdate,
} = authClient.triggersApi();

// biome-ignore lint/suspicious/noExplicitAny: Required for Better Auth CLI
export const auth = betterAuth(getAuthOptions({} as any));
