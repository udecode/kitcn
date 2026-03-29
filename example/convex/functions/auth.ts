import { admin, anonymous, organization, username } from 'better-auth/plugins';
import { convex } from 'kitcn/auth';
import { requireActionCtx } from 'kitcn/server';
import { getEnv } from '../lib/get-env';
import {
  AUTH_DEMO_ANON_EMAIL_DOMAIN,
  AUTH_DEMO_ANON_NAME_PREFIX,
} from '../shared/auth-anonymous-demo';
import { ac, roles } from '../shared/auth-shared';
import { internal } from './_generated/api';
import authConfig from './auth.config';
import { defineAuth } from './generated/auth';

export default defineAuth((ctx) => {
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
      username(),

      anonymous({
        emailDomainName: AUTH_DEMO_ANON_EMAIL_DOMAIN,
        generateName: async () =>
          `${AUTH_DEMO_ANON_NAME_PREFIX}-${Math.random().toString(36).slice(2, 10)}`,
        onLinkAccount: async ({ anonymousUser, newUser, ctx: linkCtx }) => {
          const sourceBio =
            typeof anonymousUser.user.bio === 'string'
              ? anonymousUser.user.bio.trim()
              : '';
          const destinationBio =
            typeof newUser.user.bio === 'string' ? newUser.user.bio.trim() : '';

          if (!sourceBio || destinationBio) {
            return;
          }

          await linkCtx.context.internalAdapter.updateUser(newUser.user.id, {
            bio: sourceBio,
          });
        },
      }),
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
          const actionCtx = requireActionCtx(ctx);
          const inviterName = data.inviter.user.name || 'Team Admin';
          const organizationName = data.organization.name;
          const roleSuffix = data.role ? ` as ${data.role}` : '';
          const acceptUrl = `${env.SITE_URL}/w/${data.organization.slug}?invite=${data.id}`;

          await actionCtx.scheduler.runAfter(
            0,
            internal.plugins.email.sendTemplatedEmail,
            {
              to: data.email,
              subject: `${inviterName} invited you to join ${organizationName}`,
              title: `Invitation to join ${organizationName}`,
              body: `${inviterName} (${data.inviter.user.email}) invited you to join ${organizationName}${roleSuffix}.`,
              ctaLabel: 'Accept invitation',
              ctaUrl: acceptUrl,
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
  };
});
