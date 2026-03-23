import { describe, expect, test } from 'bun:test';

import {
  buildAuthE2ECommands,
  parseAuthE2EArgs,
  parsePageState,
} from './auth-e2e';

describe('tooling/auth-e2e', () => {
  test('parseAuthE2EArgs defaults to next-auth', () => {
    expect(parseAuthE2EArgs([])).toEqual({
      target: 'next-auth',
      url: undefined,
    });
    expect(parseAuthE2EArgs(['vite-auth'])).toEqual({
      target: 'vite-auth',
      url: undefined,
    });
    expect(parseAuthE2EArgs(['--url', 'http://localhost:4010'])).toEqual({
      target: 'next-auth',
      url: 'http://localhost:4010',
    });
  });

  test('buildAuthE2ECommands drives sign-up then sign-out', () => {
    expect(
      buildAuthE2ECommands({
        baseUrl: 'http://localhost:3005',
        user: {
          email: 'e2e@example.com',
          name: 'Browser E2E',
          password: 'BrowserPassword123!',
        },
      })
    ).toEqual([
      ['open', 'http://localhost:3005/auth'],
      [
        'find',
        'role',
        'button',
        'click',
        '--name',
        "Don't have an account? Sign up",
      ],
      ['find', 'placeholder', 'Name', 'fill', 'Browser E2E'],
      ['find', 'placeholder', 'Email', 'fill', 'e2e@example.com'],
      ['find', 'placeholder', 'Password', 'fill', 'BrowserPassword123!'],
      ['find', 'role', 'button', 'click', '--name', 'Create account'],
      ['find', 'role', 'button', 'click', '--name', 'Sign out'],
    ]);
  });

  test("parsePageState handles agent-browser's quoted JSON output", () => {
    expect(
      parsePageState(
        JSON.stringify(
          JSON.stringify({
            body: 'Signed in',
            url: 'http://localhost:3005/auth',
          })
        )
      )
    ).toEqual({
      body: 'Signed in',
      url: 'http://localhost:3005/auth',
    });
  });
});
