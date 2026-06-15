import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]) =>
  ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n',
  });

describe('ConvexAuthProvider types', () => {
  test('accepts a Better Auth client with organization plugins', () => {
    const rootDir = process.cwd();
    const tmpRoot = path.join(rootDir, 'tmp');
    fs.mkdirSync(tmpRoot, { recursive: true });
    const fixtureDir = fs.mkdtempSync(
      path.join(tmpRoot, 'kitcn-convex-auth-provider-types-')
    );
    const fixtureFile = path.join(fixtureDir, 'repro.ts');

    try {
      fs.writeFileSync(
        fixtureFile,
        `import type { ConvexReactClient } from "convex/react";
import { createAuthClient } from "better-auth/react";
import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
  usernameClient,
} from "better-auth/client/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  type AuthClient,
  type ConvexAuthProviderClient,
  ConvexAuthProvider,
  convexClient,
} from "../../packages/kitcn/src/auth-client/index";

type SessionData = ReturnType<AuthClient['useSession']>['data'];
type IsNever<T> = [T] extends [never] ? true : false;
type ProviderSessionDataIsNotNever =
  IsNever<SessionData> extends true ? never : true;
const providerSessionDataIsNotNever: ProviderSessionDataIsNotNever = true;

const statements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
} as const;

const ac = createAccessControl(statements);
const roles = {
  admin: ac.newRole({
    invitation: ["create", "cancel"],
    member: ["create", "update", "delete"],
    organization: ["update"],
    team: ["create", "update", "delete"],
  }),
  member: ac.newRole({
    organization: ["update"],
  }),
  owner: ac.newRole({
    invitation: ["create", "cancel"],
    member: ["create", "update", "delete"],
    organization: ["update", "delete"],
    team: ["create", "update", "delete"],
  }),
};

const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [
    convexClient(),
    inferAdditionalFields({
      user: {
        firstName: {
          required: false,
          type: "string",
        },
        lastActiveOrganizationId: {
          required: false,
          type: "string",
        },
        onboardingCompleted: {
          defaultValue: false,
          input: false,
          required: true,
          type: "boolean",
        },
      },
    }),
    adminClient(),
    organizationClient({
      ac,
      roles,
      teams: { enabled: true },
    }),
    usernameClient(),
  ],
});

declare const client: ConvexReactClient;

const sessionData = authClient.useSession().data;
if (sessionData) {
  const firstName: string | null | undefined = sessionData.user.firstName;
  const lastActiveOrganizationId: string | null | undefined =
    sessionData.user.lastActiveOrganizationId;
  const onboardingCompleted: boolean = sessionData.user.onboardingCompleted;
  firstName;
  lastActiveOrganizationId;
  onboardingCompleted;
}

const activeOrganization = authClient.useActiveOrganization().data;
if (activeOrganization) {
  const organizationName: string = activeOrganization.name;
  const organizationSlug: string = activeOrganization.slug;
  organizationName;
  organizationSlug;
}

const typedAuthClient: AuthClient = authClient;
const typedProviderClient: ConvexAuthProviderClient = authClient;
providerSessionDataIsNotNever;

ConvexAuthProvider({
  authClient,
  children: "ok",
  client,
});

ConvexAuthProvider({
  authClient: typedProviderClient,
  children: "ok",
  client,
});

const structuralClient: ConvexAuthProviderClient = {
  convex: {
    token: async () => ({ data: { token: "convex-jwt" } }),
  },
  getSession: async () => null,
  useSession: () => ({
    data: {
      session: {
        id: "session-id",
        token: "token",
        userId: "user-id",
      },
      user: {
        email: "user@example.com",
        firstName: "Ada",
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
  });
});
