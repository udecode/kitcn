export const AUTH_EXPO_PAGE_TEMPLATE = `import { useMutation } from '@tanstack/react-query';
import { useAuth } from 'kitcn/react';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  authClient,
  useSignInMutationOptions,
  useSignOutMutationOptions,
  useSignUpMutationOptions,
} from '@/lib/convex/auth-client';

export default function AuthPage() {
  const { hasSession } = useAuth();
  const authSession = authClient.useSession();
  const session = authSession.data;
  const user = session?.user ?? null;
  const hasSignedInUser = hasSession || Boolean(user);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const signIn = useMutation(useSignInMutationOptions());
  const signUp = useMutation(useSignUpMutationOptions());
  const signOut = useMutation(useSignOutMutationOptions());

  const errorMessage =
    signIn.error?.message ??
    signUp.error?.message ??
    signOut.error?.message ??
    null;
  const isPending =
    signIn.isPending || signUp.isPending || signOut.isPending;

  function handleSubmit() {
    if (mode === 'signup') {
      signUp.mutate({
        email,
        name,
        password,
      });
      return;
    }

    signIn.mutate({
      email,
      password,
    });
  }

  if (hasSignedInUser) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <Text style={styles.kicker}>Signed in</Text>
            <Text style={styles.title}>
              {user?.name || user?.email || email}
            </Text>
            <Text style={styles.copy}>{user?.email || email}</Text>
          </View>
          <Pressable
            disabled={isPending}
            onPress={() => signOut.mutate()}
            style={[styles.button, isPending && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Auth demo</Text>
          <Text style={styles.title}>
            {mode === 'signup' ? 'Create an account' : 'Sign in'}
          </Text>
          <Text style={styles.copy}>
            Minimal Better Auth wiring on top of the Expo baseline.
          </Text>
        </View>

        <View style={styles.form}>
          {mode === 'signup' ? (
            <TextInput
              autoCapitalize="words"
              onChangeText={setName}
              placeholder="Name"
              style={styles.input}
              value={name}
            />
          ) : null}
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            style={styles.input}
            value={email}
          />
          <TextInput
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            disabled={isPending}
            onPress={handleSubmit}
            style={[styles.button, isPending && styles.buttonDisabled]}
          >
            <Text style={styles.buttonText}>
              {isPending
                ? 'Working…'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Sign in'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          <Text style={styles.link}>
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </Text>
        </Pressable>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  screen: {
    flex: 1,
    gap: 20,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    gap: 8,
  },
  kicker: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    gap: 12,
  },
  input: {
    borderColor: '#d1d5db',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  link: {
    color: '#4b5563',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
  },
});
`;
