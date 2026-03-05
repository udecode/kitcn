'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useMaybeAuth } from 'better-convex/react';
import {
  Activity,
  BarChart3,
  Building2,
  CheckSquare,
  ChevronDown,
  FolderOpen,
  Gauge,
  GitBranch,
  Loader2,
  LogIn,
  LogOut,
  Route as RouteIcon,
  ShieldUser,
  Tags,
  TestTube2,
  User,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { OrganizationSwitcher } from '@/components/organization/organization-switcher';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSignOutMutationOptions } from '@/lib/convex/auth-client';
import { useCRPC } from '@/lib/convex/crpc';
import { useCurrentUser } from '@/lib/convex/hooks';

const APP_NAV_ITEMS = [
  {
    href: '/' as const,
    label: 'Todos',
    icon: CheckSquare,
    match: (p: string) => p === '/',
  },
  {
    href: '/projects' as const,
    label: 'Projects',
    icon: FolderOpen,
    match: (p: string) => p.startsWith('/projects'),
  },
  {
    href: '/tags' as const,
    label: 'Tags',
    icon: Tags,
    match: (p: string) => p.startsWith('/tags'),
  },
];

const LAB_NAV_ITEMS = [
  {
    href: '/auth' as const,
    label: 'Auth',
    icon: ShieldUser,
    match: (p: string) => p.startsWith('/auth'),
  },
  {
    href: '/aggregate' as const,
    label: 'Aggregate',
    icon: BarChart3,
    match: (p: string) => p.startsWith('/aggregate'),
  },
  {
    href: '/orm' as const,
    label: 'ORM',
    icon: GitBranch,
    match: (p: string) => p.startsWith('/orm'),
  },
  {
    href: '/ratelimit' as const,
    label: 'Ratelimit',
    icon: Gauge,
    match: (p: string) => p.startsWith('/ratelimit'),
  },
  {
    href: '/triggers' as const,
    label: 'Triggers',
    icon: Activity,
    match: (p: string) => p.startsWith('/triggers'),
  },
  {
    href: '/migrations' as const,
    label: 'Migrations',
    icon: RouteIcon,
    match: (p: string) => p.startsWith('/migrations'),
  },
];

type NavSection = 'app' | 'labs';

function activeSectionFromPath(pathname: string): NavSection {
  if (
    pathname.startsWith('/aggregate') ||
    pathname.startsWith('/orm') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/ratelimit') ||
    pathname.startsWith('/triggers') ||
    pathname.startsWith('/migrations')
  ) {
    return 'labs';
  }
  return 'app';
}

export function BreadcrumbNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const isAuth = useMaybeAuth();

  const crpc = useCRPC();
  const generateSamplesAction = useMutation(
    crpc.seed.generateSamples.mutationOptions()
  );
  const signOutMutation = useMutation(
    useSignOutMutationOptions({
      onSuccess: () => router.push('/login'),
      onError: () => toast.error('Failed to sign out'),
    })
  );

  const { data: projectsData } = useQuery(
    crpc.projects.list.queryOptions(
      { limit: 1, cursor: null },
      {
        placeholderData: { page: [], isDone: true, continueCursor: '' },
      }
    )
  );
  const hasData = projectsData && projectsData.page.length > 0;
  const activeSection = activeSectionFromPath(pathname);
  const scopedNavItems =
    activeSection === 'labs' ? LAB_NAV_ITEMS : APP_NAV_ITEMS;
  const labsRootHref = '/orm';

  return (
    <header className="sticky top-0 z-50 border-border/40 border-b bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto px-6">
        <div className="flex h-14 items-center justify-between">
          <div className="inline-flex shrink-0 items-center rounded-lg bg-secondary/60 p-1">
            <Link
              className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
                activeSection === 'app'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              href="/"
            >
              App
            </Link>
            <Link
              className={`rounded-md px-3 py-1.5 font-medium text-xs transition-colors ${
                activeSection === 'labs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              href={labsRootHref}
            >
              Labs
            </Link>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {isAuth ? (
              <>
                <OrganizationSwitcher />
                {!hasData && (
                  <Button
                    className="gap-2"
                    disabled={generateSamplesAction.isPending}
                    onClick={() => {
                      toast.promise(
                        generateSamplesAction.mutateAsync({ count: 100 }),
                        {
                          loading: 'Generating sample data...',
                          success: (result) =>
                            `Created ${result.created} projects with ${result.todosCreated} todos!`,
                          error: (e) =>
                            e.data?.message ?? 'Failed to generate samples',
                        }
                      );
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <TestTube2 className="size-4" />
                    <span className="hidden sm:inline">Samples</span>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="gap-2" size="sm" variant="ghost">
                      <User className="size-4" />
                      <span className="hidden sm:inline">
                        {user?.name || 'Account'}
                      </span>
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      {user?.name || 'My Account'}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={signOutMutation.isPending}
                      onClick={() => signOutMutation.mutate()}
                    >
                      {signOutMutation.isPending ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <LogOut className="mr-2 size-4" />
                      )}
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : pathname !== '/login' ? (
              <Button asChild size="sm" variant="default">
                <Link className="gap-2" href="/login">
                  <LogIn className="size-4" />
                  Sign in
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex h-12 items-center gap-3 border-border/50 border-t">
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {scopedNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.match(pathname);

              return (
                <Link
                  className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  }`}
                  href={item.href as Route}
                  key={item.href}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            {activeSection === 'app' && user?.activeOrganization?.slug && (
              <Link
                className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 font-medium text-sm transition-colors ${
                  pathname.startsWith('/org')
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                }`}
                href={`/org/${encodeURIComponent(user.activeOrganization.slug)}`}
              >
                <Building2 className="size-4" />
                Organization
              </Link>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
