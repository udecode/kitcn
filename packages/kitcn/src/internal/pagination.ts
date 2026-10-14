import type { PaginationResult } from 'convex/server';

type SplitPaginationResult<T> = PaginationResult<T> & {
  splitCursor: string;
};

export const shouldSplitPaginationPage = <T>(
  page: PaginationResult<T>,
  initialNumItems?: number
): page is SplitPaginationResult<T> =>
  Boolean(page.splitCursor) &&
  (page.pageStatus === 'SplitRecommended' ||
    page.pageStatus === 'SplitRequired' ||
    (initialNumItems !== undefined && page.page.length > initialNumItems * 2));

export const isInvalidPaginationCursor = (error: unknown): boolean => {
  if (error instanceof Error && error.message.includes('InvalidCursor')) {
    return true;
  }
  if (!error || typeof error !== 'object' || !('data' in error)) return false;

  const data = (error as { data: unknown }).data;
  return Boolean(
    data &&
      typeof data === 'object' &&
      'isConvexSystemError' in data &&
      data.isConvexSystemError === true &&
      'paginationError' in data &&
      data.paginationError === 'InvalidCursor'
  );
};
