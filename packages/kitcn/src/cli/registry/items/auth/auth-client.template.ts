export const AUTH_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL!,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_START_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';

export const authClient = createAuthClient({
  baseURL:
    typeof window === 'undefined'
      ? (import.meta.env.VITE_SITE_URL as string | undefined)
      : window.location.origin,
  plugins: [convexClient()],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_EXPO_CLIENT_TEMPLATE = `import { expoClient } from '@better-auth/expo/client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';
import { createAuthMutations } from 'kitcn/react';
import { Platform } from 'react-native';

const scheme = Constants.expoConfig?.scheme as string;

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL!,
  plugins: [
    convexClient(),
    ...(Platform.OS === 'web'
      ? []
      : [
          expoClient({
            scheme,
            storagePrefix: scheme,
            storage: SecureStore,
          }),
        ]),
  ],
});

export const {
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} = createAuthMutations(authClient);
`;

export const AUTH_CONVEX_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_SITE_URL!,
  plugins: [convexClient()],
});
`;

export const AUTH_CONVEX_REACT_CLIENT_TEMPLATE = `import { createAuthClient } from 'better-auth/react';
import { convexClient } from 'kitcn/auth/client';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_SITE_URL!,
  plugins: [convexClient()],
});
`;
