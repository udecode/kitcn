import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { admin, organization } from 'better-auth/plugins';
import {
  loadAuthOptionsFromDefinition,
  loadDefaultManagedAuthConfigProvider,
  loadDefaultManagedAuthOptions,
  preserveUserOwnedAuthScaffoldFiles,
  reconcileAuthScaffoldFiles,
  renderManagedAuthSchemaFile,
} from './reconcile-auth-schema';

const baseAuthOptions = {
  baseURL: 'http://localhost:3000',
  emailAndPassword: { enabled: true },
  trustedOrigins: ['http://localhost:3000'],
} as any;

const TEST_TMP_DIR_PREFIX = 'kitcn-auth-reconcile-';
const TEST_TMP_DIR_ROOT = path.join(process.cwd(), 'node_modules', '.tmp-');
const createdTempDirs = new Set<string>();

function mkTempDir() {
  fs.mkdirSync(TEST_TMP_DIR_ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEST_TMP_DIR_ROOT, TEST_TMP_DIR_PREFIX));
  createdTempDirs.add(dir);
  return dir;
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function toImportSpecifier(filePath: string) {
  const normalized = filePath.replaceAll('\\', '/');
  return normalized.startsWith('.') ? normalized : `./${normalized}`;
}

const createAuthScaffoldFiles = async (authOptions: any) =>
  [
    {
      content: await renderManagedAuthSchemaFile({
        authOptions,
        kind: 'extension',
        outputPath: 'convex/lib/plugins/auth/schema.ts',
      }),
      filePath: '/repo/convex/lib/plugins/auth/schema.ts',
      lockfilePath: 'convex/lib/plugins/auth/schema.ts',
      templateId: 'auth-schema',
    },
    {
      content: await renderManagedAuthSchemaFile({
        authOptions,
        kind: 'convex',
        outputPath: 'convex/authSchema.ts',
      }),
      filePath: '/repo/convex/authSchema.ts',
      lockfilePath: 'convex/authSchema.ts',
      templateId: 'auth-schema-convex',
    },
  ] as const;

afterEach(() => {
  for (const dir of createdTempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  createdTempDirs.clear();
});

describe('reconcile auth schema', () => {
  test('keeps the managed convex auth plugin on a lazy internal import path', () => {
    const source = fs.readFileSync(
      fileURLToPath(new URL('./reconcile-auth-schema.ts', import.meta.url)),
      'utf8'
    );

    expect(source).not.toContain("import { convex } from '../../../../auth'");
    expect(source).toContain(
      "await import('../../../../auth/internal/convex-plugin.js')"
    );
  });

  test('loads schema-only default managed auth options without local dev host coupling', async () => {
    const provider = await loadDefaultManagedAuthConfigProvider();
    const authOptions = await loadDefaultManagedAuthOptions();

    expect(provider.issuer).toBe('https://convex.invalid');
    expect(provider.jwks).toBe('https://convex.invalid/api/auth/convex/jwks');

    const content = await renderManagedAuthSchemaFile({
      authOptions,
      kind: 'extension',
      outputPath: 'convex/lib/plugins/auth/schema.ts',
    });

    expect(content).toContain('export const jwksTable = convexTable(');
    expect(content).toContain('"jwks"');
  });

  test('loads auth options from strict env-backed auth definitions', async () => {
    const dir = mkTempDir();
    const authDefinitionPath = path.join(dir, 'convex', 'functions', 'auth.ts');
    const envModulePath = fileURLToPath(
      new URL('../../../../server/env.ts', import.meta.url)
    );

    writeFile(
      path.join(dir, 'convex', 'lib', 'get-env.ts'),
      `
      import { z } from 'zod';
      import { createEnv } from '${toImportSpecifier(
        path.relative(path.join(dir, 'convex', 'lib'), envModulePath)
      )}';

      export const getEnv = createEnv({
        schema: z.object({
          BETTER_AUTH_SECRET: z.string(),
          GITHUB_CLIENT_ID: z.string(),
          GITHUB_CLIENT_SECRET: z.string(),
          GOOGLE_CLIENT_ID: z.string(),
          GOOGLE_CLIENT_SECRET: z.string(),
          SITE_URL: z.string().default('http://localhost:3000'),
          ADMIN: z
            .string()
            .transform((value) => (value ? value.split(',') : []))
            .pipe(z.array(z.string())),
        }),
      });
      `.trim()
    );
    writeFile(
      authDefinitionPath,
      `
      import { admin, organization } from 'better-auth/plugins';
      import { getEnv } from '../lib/get-env';

      export default (_ctx) => {
        const env = getEnv();
        return {
          baseURL: env.SITE_URL,
          emailAndPassword: { enabled: true },
          trustedOrigins: [env.SITE_URL],
          plugins: [admin(), organization()],
        };
      };
      `.trim()
    );

    const authOptions = await loadAuthOptionsFromDefinition(authDefinitionPath);

    expect(authOptions?.baseURL).toBe('http://localhost:3000');
    const content = await renderManagedAuthSchemaFile({
      authOptions: authOptions!,
      kind: 'extension',
      outputPath: 'convex/lib/plugins/auth/schema.ts',
    });
    expect(content).toContain('export const organizationTable = convexTable(');
    expect(content).toContain('export const memberTable = convexTable(');
    expect(content).toContain('role: text()');
  });

  test('loads auth options without importing the generated auth runtime', async () => {
    const dir = mkTempDir();
    const authDefinitionPath = path.join(dir, 'convex', 'functions', 'auth.ts');

    writeFile(
      path.join(dir, 'convex', 'functions', 'schema.ts'),
      `throw new Error("schema should not load during auth schema reconcile");`
    );
    writeFile(
      path.join(dir, 'convex', 'functions', 'generated', 'auth.ts'),
      `
      import schema from '../schema';

      void schema;

      export const defineAuth = (factory) => factory;
      `.trim()
    );
    writeFile(
      authDefinitionPath,
      `
      import { admin } from 'better-auth/plugins';
      import { defineAuth } from './generated/auth';

      export default defineAuth(() => ({
        baseURL: 'http://localhost:3000',
        emailAndPassword: { enabled: true },
        trustedOrigins: ['http://localhost:3000'],
        plugins: [admin()],
      }));
      `.trim()
    );

    const authOptions = await loadAuthOptionsFromDefinition(authDefinitionPath);

    expect(authOptions?.baseURL).toBe('http://localhost:3000');
    expect(authOptions?.plugins).toHaveLength(1);
  });

  test('renders kitcn auth extension content from auth options', async () => {
    const content = await renderManagedAuthSchemaFile({
      authOptions: {
        ...baseAuthOptions,
        plugins: [admin()],
      } as any,
      kind: 'extension',
      outputPath: 'convex/lib/plugins/auth/schema.ts',
    });

    expect(content).toContain('defineSchemaExtension');
    expect(content).toContain('export function authExtension()');
    expect(content).toContain('role: text()');
    expect(content).toContain('banned: boolean()');
    expect(content).toContain('impersonatedBy: text()');
  });

  test('reconciles managed auth schema scaffold files from the current auth definition', async () => {
    const files = await reconcileAuthScaffoldFiles({
      functionsDir: '/repo/convex/functions',
      loadAuthOptions: async () =>
        ({
          ...baseAuthOptions,
          plugins: [admin()],
        }) as any,
      scaffoldFiles: [
        {
          content: 'stale extension',
          filePath: '/repo/convex/lib/plugins/auth/schema.ts',
          lockfilePath: 'convex/lib/plugins/auth/schema.ts',
          templateId: 'auth-schema',
        },
        {
          content: 'stale raw schema',
          filePath: '/repo/convex/authSchema.ts',
          lockfilePath: 'convex/authSchema.ts',
          templateId: 'auth-schema-convex',
        },
      ],
    });

    const extension = files.find((file) => file.templateId === 'auth-schema');
    const raw = files.find((file) => file.templateId === 'auth-schema-convex');

    expect(extension?.content).toContain('defineSchemaExtension');
    expect(extension?.content).toContain('role: text()');
    expect(raw?.content).toContain('export const authSchema = {');
    expect(raw?.content).toContain(
      'role: v.optional(v.union(v.null(), v.string()))'
    );
    expect(raw?.content).toContain(
      'impersonatedBy: v.optional(v.union(v.null(), v.string()))'
    );
  });

  test('reconciles plugin removal from stale admin schema content', async () => {
    const files = await reconcileAuthScaffoldFiles({
      functionsDir: '/repo/convex/functions',
      loadAuthOptions: async () => baseAuthOptions,
      scaffoldFiles: await createAuthScaffoldFiles({
        ...baseAuthOptions,
        plugins: [admin()],
      }),
    });

    const extension = files.find((file) => file.templateId === 'auth-schema');
    const raw = files.find((file) => file.templateId === 'auth-schema-convex');

    expect(extension?.content).not.toContain('banned: boolean()');
    expect(extension?.content).not.toContain('impersonatedBy: text()');
    expect(raw?.content).not.toContain(
      'banned: v.optional(v.union(v.null(), v.boolean()))'
    );
    expect(raw?.content).not.toContain(
      'impersonatedBy: v.optional(v.union(v.null(), v.string()))'
    );
  });

  test('reconciles plugin replacement from admin to organization schema content', async () => {
    const files = await reconcileAuthScaffoldFiles({
      functionsDir: '/repo/convex/functions',
      loadAuthOptions: async () =>
        ({
          ...baseAuthOptions,
          plugins: [organization()],
        }) as any,
      scaffoldFiles: await createAuthScaffoldFiles({
        ...baseAuthOptions,
        plugins: [admin()],
      }),
    });

    const extension = files.find((file) => file.templateId === 'auth-schema');
    const raw = files.find((file) => file.templateId === 'auth-schema-convex');

    expect(extension?.content).toContain(
      'export const organizationTable = convexTable('
    );
    expect(extension?.content).toContain(
      'export const memberTable = convexTable('
    );
    expect(extension?.content).toContain(
      'export const invitationTable = convexTable('
    );
    expect(extension?.content).toContain('organization: {');
    expect(extension?.content).toContain('members: r.many.member({');
    expect(extension?.content).toContain('invitations: r.many.invitation({');
    expect(extension?.content).toContain('member: {');
    expect(extension?.content).toContain('organization: r.one.organization({');
    expect(extension?.content).toContain('user: r.one.user({');
    expect(extension?.content).toContain('invitation: {');
    expect(extension?.content).toContain('inviter: r.one.user({');
    expect(extension?.content).toContain('user: {');
    expect(extension?.content).toContain('members: r.many.member({');
    expect(extension?.content).toContain('invitations: r.many.invitation({');
    expect(extension?.content).not.toContain('banned: boolean()');
    expect(raw?.content).toContain('organization: defineTable({');
    expect(raw?.content).toContain('member: defineTable({');
    expect(raw?.content).toContain('invitation: defineTable({');
    expect(raw?.content).not.toContain(
      'impersonatedBy: v.optional(v.union(v.null(), v.string()))'
    );
  });

  test('preserves user-owned auth runtime and config files on rerun', () => {
    const dir = mkTempDir();
    const authRuntimePath = path.join(dir, 'convex', 'functions', 'auth.ts');
    const authConfigPath = path.join(
      dir,
      'convex',
      'functions',
      'auth.config.ts'
    );

    writeFile(
      authRuntimePath,
      'export default defineAuth(() => ({ plugins: [] }));'
    );
    writeFile(authConfigPath, 'export default { providers: [] };');

    const files = preserveUserOwnedAuthScaffoldFiles([
      {
        content: 'managed auth runtime',
        filePath: authRuntimePath,
        lockfilePath: 'convex/functions/auth.ts',
        templateId: 'auth-runtime',
      },
      {
        content: 'managed auth config',
        filePath: authConfigPath,
        lockfilePath: 'convex/functions/auth.config.ts',
        templateId: 'auth-config',
      },
      {
        content: 'managed schema',
        filePath: path.join(
          dir,
          'convex',
          'lib',
          'plugins',
          'auth',
          'schema.ts'
        ),
        lockfilePath: 'convex/lib/plugins/auth/schema.ts',
        templateId: 'auth-schema',
      },
    ]);

    expect(
      files.find((file) => file.templateId === 'auth-runtime')?.content
    ).toBe('export default defineAuth(() => ({ plugins: [] }));');
    expect(
      files.find((file) => file.templateId === 'auth-config')?.content
    ).toBe('export default { providers: [] };');
    expect(
      files.find((file) => file.templateId === 'auth-schema')?.content
    ).toBe('managed schema');
  });
});
