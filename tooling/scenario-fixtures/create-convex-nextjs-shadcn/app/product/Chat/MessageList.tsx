import { type ReactNode, useEffect, useRef } from 'react';

export function MessageList({
  messages,
  children,
}: {
  messages: unknown;
  children: ReactNode;
}) {
  const messageListRef = useRef<HTMLOListElement>(null);

  // Scrolls the list down when new messages
  // are received or sent.
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTo({
        top: messageListRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);
  return (
    <ol
      className="flex grow flex-col-reverse gap-4 overflow-y-auto px-8 py-4"
      ref={messageListRef}
    >
      {children}
    </ol>
  );
}
