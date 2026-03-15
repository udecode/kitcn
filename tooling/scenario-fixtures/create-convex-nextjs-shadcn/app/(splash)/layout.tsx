import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export default function SplashPageLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <header className="sticky top-0 z-10 flex h-20 border-b bg-background/80 px-4 backdrop-blur md:px-6">
        <nav className="container hidden w-full justify-between gap-6 font-medium text-lg md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
          <Link href="/">
            <h1 className="font-semibold text-base">Next.js Template</h1>
          </Link>
          <div className="flex items-center gap-4">
            <SplashPageNav />
          </div>
        </nav>
      </header>
      <main className="flex grow flex-col">{children}</main>
      <footer className="border-t">
        <div className="container py-4 text-sm leading-loose">
          Built with ❤️ at{' '}
          <FooterLink href="https://www.convex.dev/">Convex</FooterLink>.
          Powered by Convex,{' '}
          <FooterLink href="https://nextjs.org/">Next.js</FooterLink> and{' '}
          <FooterLink href="https://ui.shadcn.com/">shadcn/ui</FooterLink>.
        </div>
      </footer>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      className="underline underline-offset-4 hover:no-underline"
      href={href}
      target="_blank"
    >
      {children}
    </Link>
  );
}

function SplashPageNav() {
  return (
    <>
      <Link
        className="text-muted-foreground transition-colors hover:text-foreground"
        href="https://docs.convex.dev"
      >
        Docs
      </Link>
      <Link
        className="text-muted-foreground transition-colors hover:text-foreground"
        href="https://stack.convex.dev"
      >
        Stack
      </Link>
      <Link
        className="text-muted-foreground transition-colors hover:text-foreground"
        href="https://www.convex.dev/community"
      >
        Discord
      </Link>
      <Link href="/product">
        <Button>Get Started</Button>
      </Link>
    </>
  );
}
