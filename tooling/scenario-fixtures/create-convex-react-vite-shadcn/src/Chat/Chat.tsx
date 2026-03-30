'use client';

import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Message } from '@/Chat/Message';
import { MessageList } from '@/Chat/MessageList';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '../../convex/_generated/api';

export function Chat({ viewer }: { viewer: string }) {
  const [newMessageText, setNewMessageText] = useState('');
  const messages = useQuery(api.messages.list);
  const sendMessage = useMutation(api.messages.send);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewMessageText('');
    sendMessage({ body: newMessageText, author: viewer }).catch((error) => {
      console.error('Failed to send message:', error);
    });
  };

  return (
    <>
      <MessageList messages={messages}>
        {messages?.map((message) => (
          <Message author={message.author} key={message._id} viewer={viewer}>
            {message.body}
          </Message>
        ))}
      </MessageList>
      <div className="border-t">
        <form className="container flex gap-2 py-4" onSubmit={handleSubmit}>
          <Input
            onChange={(event) => setNewMessageText(event.target.value)}
            placeholder="Write a message…"
            value={newMessageText}
          />
          <Button disabled={newMessageText === ''} type="submit">
            Send
          </Button>
        </form>
      </div>
    </>
  );
}
