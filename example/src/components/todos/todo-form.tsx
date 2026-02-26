'use client';

import type { ApiInputs } from '@convex/api';
import { useMutation, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarIcon, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';
import { TagPicker } from './tag-picker';

type TodoPriority = NonNullable<ApiInputs['todos']['create']['priority']>;

export function TodoForm({
  onSuccess,
  defaultProjectId,
}: {
  onSuccess?: () => void;
  defaultProjectId?: string;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TodoPriority | undefined>();
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [projectId, setProjectId] = useState<string | undefined>(
    defaultProjectId
  );
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const crpc = useCRPC();
  const createTodo = useMutation(crpc.todos.create.mutationOptions());
  const { data: projects } = useQuery(
    crpc.projects.listForDropdown.queryOptions({}, { skipUnauth: true })
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    toast.promise(
      createTodo.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        dueDate,
        projectId,
        tagIds: selectedTagIds,
      }),
      {
        loading: 'Creating todo...',
        success: () => {
          setTitle('');
          setDescription('');
          setPriority(undefined);
          setDueDate(undefined);
          setProjectId(defaultProjectId);
          setSelectedTagIds([]);
          setIsOpen(false);
          onSuccess?.();
          return 'Todo created!';
        },
        error: (e) => e.data?.message ?? 'Failed to create todo',
      }
    );
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority(undefined);
    setDueDate(undefined);
    setProjectId(defaultProjectId);
    setSelectedTagIds([]);
  };

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          Add Todo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[500px] p-0">
        <form className="space-y-4 p-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              autoFocus
              id="title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              value={title}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              value={description}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <Select
              onValueChange={(v) =>
                setProjectId(v === 'no-project' ? undefined : v)
              }
              value={projectId || 'no-project'}
            >
              <SelectTrigger id="project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-project">No Project</SelectItem>
                {projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} {project.isOwner ? '(Owner)' : '(Member)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                onValueChange={(v) => setPriority(v as TodoPriority)}
                value={priority}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-muted-foreground'
                    )}
                    id="dueDate"
                    variant="outline"
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    onSelect={setDueDate}
                    selected={dueDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tags (optional)</Label>
            <TagPicker
              disabled={createTodo.isPending}
              onTagsChange={setSelectedTagIds}
              selectedTagIds={selectedTagIds}
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-2">
            <Button
              disabled={createTodo.isPending}
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={createTodo.isPending} type="submit">
              Create Todo
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
