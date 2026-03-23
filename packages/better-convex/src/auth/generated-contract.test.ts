import { describe, expect, test } from 'bun:test';
import { resolveGeneratedAuthDefinition } from './generated-contract';

describe('auth/generated-contract', () => {
  test('resolveGeneratedAuthDefinition defers a default getter that is still in TDZ', () => {
    type AuthDefinition = (ctx: { userId: string }) => { userId: string };

    let initialized = false;
    let currentDefinition: AuthDefinition | undefined;

    const moduleNamespace = {};
    Object.defineProperty(moduleNamespace, 'default', {
      enumerable: true,
      get() {
        if (!initialized) {
          throw new ReferenceError(
            "Cannot access 'default' before initialization"
          );
        }
        return currentDefinition;
      },
    });

    const resolved = resolveGeneratedAuthDefinition<AuthDefinition>(
      moduleNamespace,
      'auth unavailable'
    );

    initialized = true;
    currentDefinition = (ctx) => ({ userId: ctx.userId });

    expect(resolved({ userId: 'user_123' })).toEqual({
      userId: 'user_123',
    });
  });

  test('resolveGeneratedAuthDefinition defers a default export that is temporarily undefined', () => {
    type AuthDefinition = (ctx: { userId: string }) => { userId: string };

    let currentDefinition: AuthDefinition | undefined;

    const moduleNamespace = {};
    Object.defineProperty(moduleNamespace, 'default', {
      enumerable: true,
      get() {
        return currentDefinition;
      },
    });

    const resolved = resolveGeneratedAuthDefinition<AuthDefinition>(
      moduleNamespace,
      'auth unavailable'
    );

    currentDefinition = (ctx) => ({ userId: ctx.userId });

    expect(resolved({ userId: 'user_456' })).toEqual({
      userId: 'user_456',
    });
  });
});
