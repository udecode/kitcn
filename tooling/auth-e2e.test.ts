import { describe, expect, test } from 'bun:test';

import { buildAuthE2EScript, parseAuthE2EArgs } from './auth-e2e';

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

  test('buildAuthE2EScript drives sign-up then sign-out in dev-browser', () => {
    const script = buildAuthE2EScript({
      baseUrl: 'http://localhost:3005',
      user: {
        email: 'e2e@example.com',
        name: 'Browser E2E',
        password: 'BrowserPassword123!',
      },
    });

    expect(script).toContain('const page = await browser.newPage();');
    expect(script).toContain('await page.goto("http://localhost:3005/auth"');
    expect(script).toContain(
      'await page.getByRole("button", { name: "Don\'t have an account? Sign up" }).click();'
    );
    expect(script).toContain(
      'await page.getByPlaceholder("Name").fill("Browser E2E");'
    );
    expect(script).toContain(
      'await page.getByPlaceholder("Email").fill("e2e@example.com");'
    );
    expect(script).toContain(
      'await page.getByPlaceholder("Password").fill("BrowserPassword123!");'
    );
    expect(script).toContain(
      'await page.getByRole("button", { name: "Create account" }).click();'
    );
    expect(script).toContain(
      'await page.getByRole("button", { name: "Sign out" }).click();'
    );
    expect(script).toContain(
      'await page.getByText("Signed in").waitFor({ timeout: 20000 });'
    );
    expect(script).toContain(
      'await page.getByText("Auth demo").waitFor({ timeout: 20000 });'
    );
    expect(script).toContain(
      'console.log(JSON.stringify({ url: page.url(), email: "e2e@example.com" }));'
    );
  });
});
