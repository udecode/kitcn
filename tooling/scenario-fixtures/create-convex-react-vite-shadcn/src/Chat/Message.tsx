import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Message({
  author,
  viewer,
  children,
}: {
  author: string;
  viewer: string;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        'flex flex-col text-sm',
        author === viewer ? 'items-end self-end' : 'items-start self-start'
      )}
    >
      <div className="mb-1 font-medium text-sm">{author}</div>
      <p
        className={cn(
          'rounded-xl bg-muted px-3 py-2',
          author === viewer ? 'rounded-tr-none' : 'rounded-tl-none'
        )}
      >
        {children}
      </p>
    </li>
  );
}
