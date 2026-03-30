import type { ComponentProps, ReactNode } from 'react';
import { isValidElement } from 'react';
import { CopyButton } from '@/components/copy-button';
import { cn } from '@/lib/cn';

function extractTextContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((child) => extractTextContent(child)).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractTextContent(node.props.children);
  }

  return '';
}

export function CodeBlock({
  className,
  children,
  ...props
}: ComponentProps<'pre'>) {
  const value = extractTextContent(children).trimEnd();

  return (
    <div className="group relative my-6">
      <pre
        className={cn(
          'no-scrollbar min-w-0 overflow-x-auto overflow-y-auto overscroll-y-auto overscroll-x-contain px-4 py-3.5 outline-none has-[[data-slot=tabs]]:p-0 has-[[data-highlighted-line]]:px-0 has-[[data-line-numbers]]:px-0',
          className
        )}
        {...props}
      >
        {children}
      </pre>
      {value ? <CopyButton value={value} /> : null}
    </div>
  );
}
