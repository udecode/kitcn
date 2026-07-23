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
