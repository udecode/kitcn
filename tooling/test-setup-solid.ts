import { cleanup } from '@solidjs/testing-library';
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterEach, expect } from 'vitest';

// Extend vitest expect with Testing Library matchers
expect.extend(matchers);

// Cleanup DOM between tests
afterEach(() => {
  cleanup();
});
