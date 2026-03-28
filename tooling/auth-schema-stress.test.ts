import { describe, expect, test } from 'bun:test';
import { patchAuthSource } from './auth-schema-stress';

describe('tooling/auth-schema-stress', () => {
  test('patchAuthSource injects plugin imports and calls before convex with scaffold indentation', () => {
    const source = `import { convex } from "better-convex/auth";
import { getEnv } from "../lib/get-env";
import authConfig from "./auth.config";
import { defineAuth } from "./generated/auth";

export default defineAuth(() => ({
  plugins: [
    convex({
      authConfig,
      jwks: getEnv().JWKS,
    }),
  ],
}));
`;

    const patched = patchAuthSource(source, ['twoFactor', 'phoneNumber']);

    expect(patched).toContain(
      `import { phoneNumber, twoFactor } from 'better-auth/plugins';`
    );
    expect(patched).toContain(`  plugins: [
    twoFactor(),
    phoneNumber(),
    convex({`);
  });
});
