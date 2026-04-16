import {
  AUTH_CLIENT_TEMPLATE,
  AUTH_CONVEX_CLIENT_TEMPLATE,
  AUTH_CONVEX_REACT_CLIENT_TEMPLATE,
  AUTH_REACT_CLIENT_TEMPLATE,
  AUTH_START_CLIENT_TEMPLATE,
} from './auth-client.template';

describe('auth client templates', () => {
  test('use the package wrapped auth client without user-code casts', () => {
    for (const template of [
      AUTH_CLIENT_TEMPLATE,
      AUTH_REACT_CLIENT_TEMPLATE,
      AUTH_START_CLIENT_TEMPLATE,
      AUTH_CONVEX_CLIENT_TEMPLATE,
      AUTH_CONVEX_REACT_CLIENT_TEMPLATE,
    ]) {
      expect(template).toContain(
        "import { createAuthClient } from 'better-auth/react';"
      );
      expect(template).toContain(
        "import { convexClient } from 'kitcn/auth/client';"
      );
      expect(template).not.toContain(
        "import { convexClient, createAuthClient } from 'kitcn/auth/client';"
      );
      expect(template).not.toContain('KitcnAuthClient');
      expect(template).not.toContain('as unknown as');
    }
  });
});
