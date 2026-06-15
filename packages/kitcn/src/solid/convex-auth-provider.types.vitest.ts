import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]) =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });

describe('Solid ConvexAuthProvider types', () => {
  test(
    'accepts Better Auth and structural auth clients',
    { timeout: 15_000 },
    () => {
      const rootDir = process.cwd();
      const tmpRoot = path.join(rootDir, 'tmp');
      fs.mkdirSync(tmpRoot, { recursive: true });
      const fixtureDir = fs.mkdtempSync(
        path.join(tmpRoot, 'kitcn-solid-convex-auth-provider-types-')
      );
      const fixtureFile = path.join(fixtureDir, 'repro.ts');

      try {
        fs.writeFileSync(
          fixtureFile,
          `import type { ConvexClient } from "convex/browser";
import { createAuthClient } from "better-auth/solid";
import {
  inferAdditionalFields,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import {
  ConvexAuthProvider,
} from "../../packages/kitcn/src/solid/convex-auth-provider";
import type {
  SolidAuthClient,
  SolidAuthProviderClient,
} from "../../packages/kitcn/src/solid/types";
import { convexClient } from "../../packages/kitcn/src/auth/internal/convex-client";

const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    convexClient(),
    inferAdditionalFields({
      user: {
        lastActiveOrganizationId: {
          required: false,
          type: "string",
        },
      },
    }),
    organizationClient({
      teams: { enabled: true },
    }),
    usernameClient(),
  ],
});

declare const client: ConvexClient;

const typedAuthClient: SolidAuthClient = authClient;
const typedProviderClient: SolidAuthProviderClient = authClient;

ConvexAuthProvider({
  authClient: typedProviderClient,
  children: "ok",
  client,
});

const structuralClient: SolidAuthProviderClient = {
  convex: {
    token: async () => ({ data: { token: "convex-jwt" } }),
  },
  getSession: async () => null,
  useSession: () => () => ({
    data: {
      session: {
        id: "session-id",
        token: "token",
        userId: "user-id",
      },
      user: {
        email: "user@example.com",
        id: "user-id",
        lastActiveOrganizationId: "org-id",
      },
    },
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: async () => null,
  }),
};

ConvexAuthProvider({
  authClient: structuralClient,
  children: "ok",
  client,
});
`
        );

        const program = ts.createProgram([fixtureFile], {
          allowImportingTsExtensions: true,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: 'solid-js',
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          strictFunctionTypes: true,
          target: ts.ScriptTarget.ES2022,
          types: ['bun-types'],
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);

        expect(formatDiagnostics(diagnostics)).toBe('');
      } finally {
        fs.rmSync(fixtureDir, { force: true, recursive: true });
      }
    }
  );
});
