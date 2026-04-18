import { expoClient } from '@better-auth/expo/client';
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
