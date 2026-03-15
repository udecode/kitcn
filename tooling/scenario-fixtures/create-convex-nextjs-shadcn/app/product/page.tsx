import { Chat } from '@/app/product/Chat/Chat';
import { ChatIntro } from '@/app/product/Chat/ChatIntro';
import { randomName } from '@/app/product/Chat/randomName';
import { UserMenu } from '@/components/UserMenu';

export default function ProductPage() {
  const viewer = randomName();
  return (
    <main className="flex max-h-screen grow flex-col overflow-hidden">
      <div className="flex items-start justify-between border-b p-4">
        <ChatIntro />
        <UserMenu>{viewer}</UserMenu>
      </div>
      <Chat viewer={viewer} />
    </main>
  );
}
