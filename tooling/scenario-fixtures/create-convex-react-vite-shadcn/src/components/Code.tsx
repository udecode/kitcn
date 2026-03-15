import type { ReactNode } from 'react';

export const Code = ({ children }: { children: ReactNode }) => {
  return (
    <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
      {children}
    </code>
  );
};
