'use client';

import { useMutation } from '@tanstack/react-query';
import { useInfiniteQuery, useMaybeAuth } from 'kitcn/react';
import { Archive, CheckSquare, Plus, Square, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WithSkeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

export default function ProjectsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    isPublic: false,
  });

  const isAuth = useMaybeAuth();
  const crpc = useCRPC();

  const {
    data: projects,
    hasNextPage,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery(
    crpc.projects.list.infiniteQueryOptions({ includeArchived })
  );

  const createProject = useMutation(
    crpc.projects.create.mutationOptions({
      meta: { errorMessage: 'Failed to create project' },
      onSuccess: () => {
        setShowCreateDialog(false);
        setNewProject({ name: '', description: '', isPublic: false });
        toast.success('Project created successfully');
      },
    })
  );

  const archiveProject = useMutation(crpc.projects.archive.mutationOptions());
  const restoreProject = useMutation(crpc.projects.restore.mutationOptions());

  const handleCreateProject = async () => {
    if (!newProject.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    createProject.mutate({
      name: newProject.name.trim(),
      description: newProject.description.trim() || undefined,
      isPublic: newProject.isPublic,
    });
  };

  const handleArchiveToggle = async (
    projectId: string,
    isArchived: boolean
  ) => {
    const mutation = isArchived ? restoreProject : archiveProject;

    toast.promise(mutation.mutateAsync({ projectId }), {
      loading: isArchived ? 'Restoring project...' : 'Archiving project...',
      success: isArchived ? 'Project restored' : 'Project archived',
      error: (e) => e.data?.message ?? 'Failed to update project',
    });
  };

  return (
    <div className="mx-auto max-w-5xl @3xl:px-8 px-6 @3xl:py-12 py-8">
      <header className="mb-10">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl tracking-tight">Projects</h1>
            <p className="text-muted-foreground text-sm">
              Organize your work into projects
            </p>
          </div>
          {isAuth && (
            <Dialog onOpenChange={setShowCreateDialog} open={showCreateDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="secondary">
                  <Plus className="h-4 w-4" />
                  New
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Project</DialogTitle>
                  <DialogDescription>
                    Create a new project to organize your todos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      onChange={(e) =>
                        setNewProject({ ...newProject, name: e.target.value })
                      }
                      placeholder="My Awesome Project"
                      value={newProject.name}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      onChange={(e) =>
                        setNewProject({
                          ...newProject,
                          description: e.target.value,
                        })
                      }
                      placeholder="Brief description of your project"
                      rows={3}
                      value={newProject.description}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      checked={newProject.isPublic}
                      id="isPublic"
                      onCheckedChange={(checked) =>
                        setNewProject({
                          ...newProject,
                          isPublic: checked as boolean,
                        })
                      }
                    />
                    <Label className="font-normal text-sm" htmlFor="isPublic">
                      Make this project public
                    </Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => setShowCreateDialog(false)}
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={createProject.isPending}
                    onClick={handleCreateProject}
                    variant="secondary"
                  >
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      {isAuth && (
        <div className="mb-6 flex items-center gap-2">
          <Checkbox
            checked={includeArchived}
            id="includeArchived"
            onCheckedChange={(checked) =>
              setIncludeArchived(checked as boolean)
            }
          />
          <Label
            className="font-normal text-muted-foreground text-sm"
            htmlFor="includeArchived"
          >
            Show archived only
          </Label>
        </div>
      )}

      <div className="grid @5xl:grid-cols-3 @xl:grid-cols-2 gap-3">
        {projects.map((project, index) => (
          <WithSkeleton
            className="w-full"
            isLoading={isLoading}
            key={project.id || index}
          >
            <Link className="block" href={`/projects/${project.id}`}>
              <div
                className={cn(
                  'group rounded-lg bg-secondary/40 p-4 transition-colors hover:bg-secondary/60',
                  project.archived && 'opacity-50'
                )}
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="font-medium group-hover:underline">
                      {project.name}
                    </h3>
                    <p className="line-clamp-2 text-muted-foreground text-sm">
                      {project.description || 'No description'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {project.memberCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      {project.completedTodoCount > 0 ? (
                        <CheckSquare className="h-3 w-3" />
                      ) : (
                        <Square className="h-3 w-3" />
                      )}
                      {project.completedTodoCount}/{project.todoCount}
                    </span>
                    <span>{project.isOwner ? 'Owner' : 'Member'}</span>
                  </div>
                  {project.isOwner && (
                    <div className="border-border/50 border-t pt-2">
                      <Button
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.preventDefault();
                          handleArchiveToggle(project.id, project.archived);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <Archive className="h-3 w-3" />
                        {project.archived ? 'Restore' : 'Archive'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </WithSkeleton>
        ))}
      </div>

      {projects.length === 0 && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 rounded-full bg-secondary p-3">
            <Square className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">
            {isAuth
              ? includeArchived
                ? 'No archived projects'
                : 'No projects yet'
              : 'No public projects'}
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            {isAuth
              ? 'Create your first project to get started'
              : 'Check back later'}
          </p>
          {isAuth && (
            <Button
              className="mt-4"
              onClick={() => setShowCreateDialog(true)}
              size="sm"
              variant="secondary"
            >
              <Plus className="h-4 w-4" />
              Create project
            </Button>
          )}
        </div>
      )}

      {hasNextPage && (
        <div className="mt-8 text-center">
          <Button
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
            size="sm"
            variant="ghost"
          >
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
