import { useState } from 'react';
import { Chat } from '@/Chat/Chat';
import { ChatIntro } from '@/Chat/ChatIntro';
import { randomName } from '@/Chat/randomName';
import { UserMenu } from '@/components/UserMenu';
import { Layout } from '@/Layout';

export default function App() {
  const [viewer] = useState(randomName());
  return (
    <Layout menu={<UserMenu>{viewer}</UserMenu>}>
      <ChatIntro />
      <Chat viewer={viewer} />
    </Layout>
  );
}
