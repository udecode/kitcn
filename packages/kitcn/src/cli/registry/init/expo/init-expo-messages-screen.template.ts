export const INIT_EXPO_MESSAGES_SCREEN_TEMPLATE = `import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useCRPC } from '@/lib/convex/crpc';

export default function MessagesScreen() {
  const crpc = useCRPC();
  const [draft, setDraft] = useState('');
  const messagesQuery = useQuery(crpc.messages.list.queryOptions());
  const createMessage = useMutation(crpc.messages.create.mutationOptions());

  async function handleSubmit() {
    const body = draft.trim();
    if (!body || createMessage.isPending) return;

    try {
      await createMessage.mutateAsync({ body });
      setDraft('');
    } catch {}
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>kitcn</Text>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.copy}>
            This screen is a tiny live query and mutation over kitcn. Start the
            backend, add a message, and watch the list update.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="sentences"
            maxLength={120}
            onChangeText={setDraft}
            placeholder="Write a message"
            style={styles.input}
            value={draft}
          />
          <Pressable
            disabled={createMessage.isPending || draft.trim().length === 0}
            onPress={() => {
              void handleSubmit();
            }}
            style={[
              styles.button,
              (createMessage.isPending || draft.trim().length === 0) &&
                styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {createMessage.isPending ? 'Saving...' : 'Add message'}
            </Text>
          </Pressable>
        </View>

        {messagesQuery.isPending ? (
          <Text style={styles.muted}>Loading messages...</Text>
        ) : messagesQuery.isError ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Backend not ready. Start kitcn dev and reload the app.
            </Text>
          </View>
        ) : messagesQuery.data.length === 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>No messages yet. Add the first one.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {messagesQuery.data.map((message) => (
              <View key={message.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardBody}>{message.body}</Text>
                  <Text style={styles.cardTime}>
                    {message.createdAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    gap: 8,
  },
  kicker: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 2,
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
  muted: {
    color: '#6b7280',
    fontSize: 14,
  },
  notice: {
    borderColor: '#d1d5db',
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  noticeText: {
    color: '#4b5563',
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardBody: {
    color: '#111827',
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  cardTime: {
    color: '#6b7280',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
`;
