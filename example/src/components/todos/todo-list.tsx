'use client';

import type { ApiInputs, ApiOutputs } from '@convex/api';
import { skipToken } from '@tanstack/react-query';
import { useInfiniteQuery } from 'kitcn/react';
import { Archive, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WithSkeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCRPC } from '@/lib/convex/crpc';
import { TodoForm } from './todo-form';
import { TodoItem } from './todo-item';
import { TodoSearch } from './todo-search';

type TodoPriority = NonNullable<ApiInputs['todos']['create']['priority']>;
type TodoListItem = ApiOutputs['todos']['list']['page'][number];

type TodoListProps = {
  projectId?: string;
  showFilters?: boolean;
};

const placeholderTodos: TodoListItem[] = [
  {
    id: '0',
    createdAt: new Date('2025-11-04'),
    title: 'Example Todo 1',
    description: 'This is a placeholder todo item',
    completed: false,
    priority: 'medium',
    dueDate: new Date('2025-11-05'),
    userId: 'user1',
    tags: [],
    project: null,
  },
  {
    id: '2',
    createdAt: new Date('2025-11-04'),
    title: 'Example Todo 2',
    description: 'Another placeholder todo item',
    completed: true,
    priority: 'low',
    userId: 'user1',
    tags: [],
    project: null,
  },
];

export function TodoList({ projectId, showFilters = true }: TodoListProps) {
  const [completedFilter, setCompletedFilter] = useState<boolean | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<
    TodoPriority | undefined
  >();
  const [showDeleted, setShowDeleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const crpc = useCRPC();

  const searchResult = useInfiniteQuery(
    crpc.todos.search.infiniteQueryOptions(
      searchQuery
        ? {
            query: searchQuery,
            completed: completedFilter,
            projectId,
            showDeleted,
          }
        : skipToken,
      { placeholderData: placeholderTodos }
    )
  );
  const listResult = useInfiniteQuery(
    crpc.todos.list.infiniteQueryOptions(
      searchQuery
        ? skipToken
        : {
            completed: completedFilter,
            projectId,
            priority: priorityFilter,
            showDeleted,
          },
      { placeholderData: placeholderTodos }
    )
  );

  const {
    data,
    isPlaceholderData: isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = searchQuery ? searchResult : listResult;

  const allTodos = data ?? [];
  const todos = showDeleted
    ? allTodos.filter((todo) => todo.deletionTime)
    : allTodos.filter((todo) => !todo.deletionTime);
  const isEmpty = !isLoading && todos.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-2xl">Todos</h2>
        <div className="flex items-center gap-2">
          <Button
            className={showDeleted ? 'bg-muted' : ''}
            onClick={() => setShowDeleted(!showDeleted)}
            size="sm"
            variant="outline"
          >
            <Archive className="h-4 w-4" />
            {showDeleted ? 'Hide' : 'Show'} Deleted
          </Button>
          <TodoForm defaultProjectId={projectId} />
        </div>
      </div>

      {showFilters && (
        <div className="space-y-4">
          <TodoSearch onSearchChange={setSearchQuery} />

          <div className="flex flex-wrap gap-2">
            <Tabs
              onValueChange={(value) => {
                setCompletedFilter(
                  value === 'all' ? undefined : value === 'completed'
                );
              }}
              value={
                completedFilter === undefined
                  ? 'all'
                  : completedFilter
                    ? 'completed'
                    : 'active'
              }
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select
              onValueChange={(value) =>
                setPriorityFilter(
                  value === 'all' ? undefined : (value as TodoPriority)
                )
              }
              value={priorityFilter || 'all'}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isEmpty ? (
          <div className="py-12 text-center text-muted-foreground">
            {searchQuery
              ? `No todos found for "${searchQuery}"`
              : showDeleted
                ? completedFilter === false
                  ? 'No deleted active todos.'
                  : completedFilter === true
                    ? 'No deleted completed todos.'
                    : 'No deleted todos.'
                : completedFilter === false
                  ? 'No active todos. Great job!'
                  : completedFilter === true
                    ? 'No completed todos yet.'
                    : 'No todos yet. Create your first one!'}
          </div>
        ) : (
          <>
            {todos.map((todo, index: number) => (
              <WithSkeleton
                className="w-full"
                isLoading={isLoading}
                key={todo.id || index}
              >
                <TodoItem todo={todo} />
              </WithSkeleton>
            ))}

            {hasNextPage && (
              <div className="flex justify-center pt-4">
                <Button
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                  variant="outline"
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
