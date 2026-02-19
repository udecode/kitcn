'use client';

import type { ApiOutputs } from '@convex/api';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Calendar, Edit, MoreHorizontal, RotateCcw, Trash } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCRPC } from '@/lib/convex/crpc';
import { cn } from '@/lib/utils';

type TodoItemData = ApiOutputs['todos']['list']['page'][number];

type TodoItemProps = {
  todo: TodoItemData;
  onEdit?: () => void;
};

export function TodoItem({ todo, onEdit }: TodoItemProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const crpc = useCRPC();

  const toggleComplete = useMutation(
    crpc.todos.toggleComplete.mutationOptions()
  );
  const deleteTodo = useMutation(crpc.todos.deleteTodo.mutationOptions());
  const restoreTodo = useMutation(crpc.todos.restore.mutationOptions());

  const handleToggleComplete = async () => {
    setIsUpdating(true);
    try {
      await toggleComplete.mutateAsync({ id: todo.id });
    } catch (_error) {
      toast.error('Failed to update todo');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    toast.promise(deleteTodo.mutateAsync({ id: todo.id }), {
      loading: 'Deleting todo...',
      success: 'Todo deleted',
      error: (e) => e.data?.message ?? 'Failed to delete todo',
    });
  };

  const handleRestore = async () => {
    toast.promise(restoreTodo.mutateAsync({ id: todo.id }), {
      loading: 'Restoring todo...',
      success: 'Todo restored',
      error: (e) => e.data?.message ?? 'Failed to restore todo',
    });
  };

  const dueDateMs =
    todo.dueDate instanceof Date ? todo.dueDate.getTime() : todo.dueDate;
  const deletionTimeMs =
    todo.deletionTime instanceof Date
      ? todo.deletionTime.getTime()
      : todo.deletionTime;
  const isOverdue = !!dueDateMs && dueDateMs < Date.now() && !todo.completed;
  const isDeleted = !!deletionTimeMs;

  const priorityColors = {
    low: 'bg-gray-100 text-gray-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  const priorityColor =
    todo.priority && typeof todo.priority === 'string'
      ? priorityColors[todo.priority as keyof typeof priorityColors]
      : undefined;

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg bg-secondary/30 p-4 transition-colors hover:bg-secondary/50',
        todo.completed && 'bg-secondary/20',
        isDeleted && 'bg-destructive/5',
        isOverdue && !isDeleted && 'bg-red-500/5'
      )}
    >
      <Checkbox
        checked={todo.completed}
        className="mt-0.5"
        disabled={isUpdating || isDeleted}
        onCheckedChange={handleToggleComplete}
      />

      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={cn(
              'font-medium',
              todo.completed && 'text-muted-foreground line-through',
              isDeleted && 'text-muted-foreground'
            )}
          >
            {todo.title}
          </h3>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8" size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isDeleted ? (
                <DropdownMenuItem onClick={handleRestore}>
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash className="h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {todo.description && (
          <p className="text-muted-foreground text-sm">{todo.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {todo.priority && (
            <Badge className={cn('text-xs', priorityColor)} variant="secondary">
              {todo.priority}
            </Badge>
          )}

          {dueDateMs && (
            <Badge
              className={cn(
                'text-xs',
                isOverdue && 'border-red-500 text-red-600'
              )}
              variant="outline"
            >
              <Calendar className="mr-1 h-3 w-3" />
              {format(dueDateMs, 'MMM d, yyyy')}
            </Badge>
          )}

          {todo.project && (
            <Badge className="text-xs" variant="outline">
              {todo.project.name}
            </Badge>
          )}

          {todo.tags?.map((tag) => (
            <Badge
              className="text-xs"
              key={tag.id}
              style={{
                backgroundColor: `${tag.color}20`,
                borderColor: tag.color,
                color: tag.color,
              }}
              variant="outline"
            >
              {tag.name}
            </Badge>
          ))}

          {isDeleted && (
            <Badge className="text-xs" variant="destructive">
              Deleted
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
