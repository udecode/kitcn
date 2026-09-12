import { isInvalidPaginationCursor } from './pagination';

describe('isInvalidPaginationCursor', () => {
  test('recognizes the legacy error message', () => {
    expect(isInvalidPaginationCursor(new Error('InvalidCursor'))).toBe(true);
  });

  test('recognizes the structured Convex pagination error', () => {
    expect(
      isInvalidPaginationCursor({
        data: {
          isConvexSystemError: true,
          paginationError: 'InvalidCursor',
        },
      })
    ).toBe(true);
  });

  test('leaves unrelated page errors visible', () => {
    expect(isInvalidPaginationCursor(new Error('Permission denied'))).toBe(
      false
    );
  });
});
