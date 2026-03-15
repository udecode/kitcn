import type { ReactNode } from 'react';
import { GetStartedDialog } from '@/GetStarted/GetStartedDialog';

export function Layout({
  menu,
  children,
}: {
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex min-h-20 border-b bg-background/80 backdrop-blur">
        <nav className="container flex w-full flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6 md:gap-10">
            <a href="/">
              <h1 className="font-semibold text-base">React Template</h1>
            </a>
            <div className="flex items-center gap-4 text-sm">
              <GetStartedDialog>
                <button className="text-muted-foreground transition-colors hover:text-foreground">
                  Help
                </button>
              </GetStartedDialog>
              <a
                className="text-muted-foreground transition-colors hover:text-foreground"
                href="https://docs.convex.dev"
                rel="noopener"
                target="_blank"
              >
                Docs
              </a>
            </div>
          </div>
          {menu}
        </nav>
      </header>
      <main className="flex grow flex-col overflow-hidden">{children}</main>
      <footer className="hidden border-t sm:block">
        <div className="container py-4 text-sm leading-loose">
          Built with ❤️ at{' '}
          <FooterLink href="https://www.convex.dev/">Convex</FooterLink>.
          Powered by Convex,{' '}
          <FooterLink href="https://vitejs.dev">Vite</FooterLink>,{' '}
          <FooterLink href="https://react.dev/">React</FooterLink> and{' '}
          <FooterLink href="https://ui.shadcn.com/">shadcn/ui</FooterLink>.
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="underline underline-offset-4 hover:no-underline"
      href={href}
      target="_blank"
    >
      {children}
    </a>
  );
}
