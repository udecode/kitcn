import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';

export const authClient = createAuthClient({
  baseURL: 'http://localhost:5173',
  plugins: [
    convexClient(),
    adminClient(),
    organizationClient({
      teams: { enabled: true },
    }),
    usernameClient(),
    inferAdditionalFields({
      user: {
        firstName: {
          required: false,
          type: 'string',
        },
        lastName: {
          required: false,
          type: 'string',
        },
        onboardingCompleted: {
          defaultValue: false,
          input: false,
          required: true,
          type: 'boolean',
        },
      },
    }),
  ],
});

export type ExportedAuthClient = typeof authClient;
export type ExportedSession = typeof authClient.$Infer.Session;

export const readSession = () => authClient.useSession();
export const signInEmail = (email: string, password: string) =>
  authClient.signIn.email({ email, password });
export const signOut = () => authClient.signOut();
