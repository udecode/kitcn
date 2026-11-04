import { cleanup } from '@solidjs/testing-library';
import { afterEach } from 'vitest';

// Cleanup DOM between tests
afterEach(() => {
  cleanup();
});
