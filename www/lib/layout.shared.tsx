import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { Layers } from 'lucide-react';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <Layers className="size-5" />
          <p className="font-(family-name:--font-geist-sans) select-none font-normal">
            BETTER-CONVEX
          </p>
        </div>
      ),
    },
    links: [
      {
        text: 'Docs',
        url: '/docs',
        on: 'nav',
        active: 'nested-url',
      },
    ],
    githubUrl: 'https://github.com/udecode/kitcn',
  };
}
