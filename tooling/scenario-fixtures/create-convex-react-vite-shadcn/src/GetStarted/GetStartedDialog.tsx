import {
  CodeIcon,
  ExternalLinkIcon,
  MagicWandIcon,
  PlayIcon,
  StackIcon,
} from '@radix-ui/react-icons';
import type { ReactNode } from 'react';
import { Code } from '@/components/Code';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ConvexLogo } from '@/GetStarted/ConvexLogo';

export function GetStartedDialog({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100vh-8rem)] max-w-2xl grid-rows-[1fr_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-baseline gap-2">
            Your app powered by <ConvexLogo height={11} width={69} />
          </DialogTitle>
        </DialogHeader>
        <GetStartedContent />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Got it</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GetStartedContent() {
  return (
    <div className="overflow-y-auto">
      <p className="mb-2 text-muted-foreground">
        This template is a starting point for building your fullstack web
        application.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              <PlayIcon /> Play with the app
            </CardTitle>
          </CardHeader>
          <CardContent>Close this dialog to see the app in action.</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              <StackIcon /> Inspect your database
            </CardTitle>
          </CardHeader>
          <CardContent>
            The{' '}
            <a
              className="underline underline-offset-4 hover:no-underline"
              href="https://dashboard.convex.dev/"
              rel="noopener"
              target="_blank"
            >
              Convex dashboard
            </a>{' '}
            is already open in another window.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              <CodeIcon />
              Change the backend
            </CardTitle>
          </CardHeader>
          <CardContent>
            Edit <Code>convex/messages.ts</Code> to change the backend
            functionality.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex gap-2">
              <MagicWandIcon />
              Change the frontend
            </CardTitle>
          </CardHeader>
          <CardContent>
            Edit <Code>src/App.tsx</Code> to change your frontend.
          </CardContent>
        </Card>
      </div>
      <div>
        <h2 className="mt-6 mb-3 font-semibold">Helpful resources</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Resource href="https://docs.convex.dev/home" title="Convex Docs">
            Read comprehensive documentation for all Convex features.
          </Resource>
          <Resource href="https://stack.convex.dev/" title="Stack articles">
            Learn about best practices, use cases, and more from a growing
            collection of articles, videos, and walkthroughs.
          </Resource>
          <Resource href="https://www.convex.dev/community" title="Discord">
            Join our developer community to ask questions, trade tips & tricks,
            and show off your projects.
          </Resource>
          <Resource href="https://search.convex.dev/" title="Search them all">
            Get unblocked quickly by searching across the docs, Stack, and
            Discord chats.
          </Resource>
        </div>
      </div>
    </div>
  );
}

function Resource({
  title,
  children,
  href,
}: {
  title: string;
  children: ReactNode;
  href: string;
}) {
  return (
    <Button
      asChild
      className="flex h-auto flex-col items-start justify-start gap-2 whitespace-normal p-4 font-normal"
      variant="secondary"
    >
      <a href={href} target="_blank">
        <div className="flex items-center gap-1 font-bold text-sm">
          {title}
          <ExternalLinkIcon />
        </div>
        <div className="text-muted-foreground">{children}</div>
      </a>
    </Button>
  );
}
