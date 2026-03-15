import fs from 'node:fs';
import { resolve } from 'node:path';
import { BETTER_AUTH_INSTALL_SPEC } from '../../../supported-dependencies.js';
import { defineInternalRegistryItem } from '../../define-item.js';
import { createRegistryFile } from '../../files.js';
import { INIT_CRPC_TEMPLATE } from '../../init/init-crpc.template.js';
import { INIT_HTTP_TEMPLATE } from '../../init/init-http.template.js';
import { INIT_NEXT_CONVEX_PROVIDER_TEMPLATE } from '../../init/next/init-next-convex-provider.template.js';
import { INIT_REACT_CONVEX_PROVIDER_TEMPLATE } from '../../init/react/init-react-convex-provider.template.js';
import {
  createPlanFile,
  getCrpcFilePath,
  getHttpFilePath,
  renderInitTemplateContent,
  resolveRelativeImportPath,
} from '../../plan-helpers.js';
import type { PluginRegistryBuildPlanFilesParams } from '../../types.js';
import { AUTH_TEMPLATE } from './auth.template.js';
import {
  AUTH_CLIENT_TEMPLATE,
  AUTH_REACT_CLIENT_TEMPLATE,
} from './auth-client.template.js';
import { AUTH_CONFIG_TEMPLATE } from './auth-config.template.js';
import { AUTH_CONVEX_PROVIDER_TEMPLATE } from './auth-convex-provider.template.js';
import { renderAuthCrpcTemplate } from './auth-crpc.template.js';
import { AUTH_PAGE_TEMPLATE } from './auth-page.template.js';
import { AUTH_REACT_CONVEX_PROVIDER_TEMPLATE } from './auth-react-convex-provider.template.js';
import { AUTH_SCHEMA_TEMPLATE } from './auth-schema.template.js';

const INIT_HTTP_API_USE_BLOCK_RE =
  /app\.use\(\s*['"]\/api\/\*['"][\s\S]*?\);\n?/;

const AUTH_FILES = [
  createRegistryFile({
    id: 'auth-schema',
    path: 'schema.ts',
    target: 'lib',
    content: AUTH_SCHEMA_TEMPLATE,
  }),
  createRegistryFile({
    id: 'auth-config',
    path: 'auth.config.ts',
    target: 'functions',
    content: AUTH_CONFIG_TEMPLATE,
    requires: ['auth-schema'],
  }),
  createRegistryFile({
    id: 'auth-runtime',
    path: 'auth.ts',
    target: 'functions',
    content: AUTH_TEMPLATE,
    requires: ['auth-config'],
  }),
  createRegistryFile({
    id: 'auth-client',
    path: 'convex/auth-client.ts',
    target: 'client-lib',
    content: AUTH_CLIENT_TEMPLATE,
    requires: ['auth-runtime'],
  }),
  createRegistryFile({
    id: 'auth-page',
    path: 'auth/page.tsx',
    target: 'app',
    content: AUTH_PAGE_TEMPLATE,
    requires: ['auth-client'],
  }),
] as const;

function buildAuthCrpcRegistrationPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const crpcPath = getCrpcFilePath(params.config);
  const baselineCrpcSource = renderInitTemplateContent({
    template: INIT_CRPC_TEMPLATE,
    filePath: crpcPath,
    functionsDir: params.functionsDir,
    crpcFilePath: crpcPath,
  });
  const source = fs.existsSync(crpcPath)
    ? fs.readFileSync(crpcPath, 'utf8')
    : baselineCrpcSource;
  const withRatelimit =
    source.includes("from './plugins/ratelimit/plugin'") ||
    source.includes('RatelimitBucket') ||
    source.includes('ratelimit.middleware()');

  return createPlanFile({
    kind: 'scaffold',
    filePath: crpcPath,
    content: renderAuthCrpcTemplate({ withRatelimit }),
    managedBaselineContent: baselineCrpcSource,
    createReason: 'Create crpc.ts with auth-aware procedures.',
    updateReason: 'Register auth-aware procedures in crpc.ts.',
    skipReason: 'Auth-aware procedures are already registered in crpc.ts.',
  });
}

function buildAuthHttpRegistrationPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const httpPath = getHttpFilePath(params.functionsDir);
  const baselineHttpSource = renderInitTemplateContent({
    template: INIT_HTTP_TEMPLATE,
    filePath: httpPath,
    functionsDir: params.functionsDir,
    crpcFilePath: params.roots.crpcFilePath,
  });
  const getEnvImportPath = resolveRelativeImportPath(
    httpPath,
    params.roots.envFilePath
  );
  let source = fs.existsSync(httpPath)
    ? fs.readFileSync(httpPath, 'utf8')
    : baselineHttpSource;

  if (!source.includes("from 'better-convex/auth/http'")) {
    source = `import { authMiddleware } from 'better-convex/auth/http';\n${source}`;
  }
  if (!source.includes("from 'hono/cors'")) {
    source = `import { cors } from 'hono/cors';\n${source}`;
  }
  if (!source.includes("from './generated/auth'")) {
    source = `import { getAuth } from './generated/auth';\n${source}`;
  }
  if (!source.includes(`from '${getEnvImportPath}'`)) {
    source = `import { getEnv } from '${getEnvImportPath}';\n${source}`;
  }

  if (!source.includes("app.use(\n  '/api/*',")) {
    source = source.replace(
      'const app = new Hono();',
      `const app = new Hono();

app.use(
  '/api/*',
  cors({
    origin: getEnv().SITE_URL,
    allowHeaders: ['Content-Type', 'Authorization', 'Better-Auth-Cookie'],
    exposeHeaders: ['Set-Better-Auth-Cookie'],
    credentials: true,
  })
);`
    );
  }

  if (!source.includes('app.use(authMiddleware(getAuth));')) {
    source = source.replace(
      INIT_HTTP_API_USE_BLOCK_RE,
      (match) => `${match}\napp.use(authMiddleware(getAuth));\n`
    );
    if (!source.includes('app.use(authMiddleware(getAuth));')) {
      source = source.replace(
        'const app = new Hono();',
        'const app = new Hono();\n\napp.use(authMiddleware(getAuth));'
      );
    }
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: httpPath,
    content: source,
    managedBaselineContent: baselineHttpSource,
    createReason: 'Create http.ts with auth middleware.',
    updateReason: 'Register auth middleware in http.ts.',
    skipReason: 'Auth middleware is already registered in http.ts.',
  });
}

function buildAuthProviderPlanFile(params: PluginRegistryBuildPlanFilesParams) {
  if (!params.roots.projectContext) {
    throw new Error(
      'Auth scaffolding requires a supported app baseline. Run `better-convex create -t next` or `better-convex create -t vite` first.'
    );
  }

  const providerPath = resolve(
    process.cwd(),
    params.roots.projectContext.convexClientDir,
    'convex-provider.tsx'
  );
  const isNextApp = params.roots.projectContext.mode === 'next-app';

  return createPlanFile({
    kind: 'scaffold',
    filePath: providerPath,
    content: isNextApp
      ? AUTH_CONVEX_PROVIDER_TEMPLATE
      : AUTH_REACT_CONVEX_PROVIDER_TEMPLATE,
    managedBaselineContent: isNextApp
      ? INIT_NEXT_CONVEX_PROVIDER_TEMPLATE
      : INIT_REACT_CONVEX_PROVIDER_TEMPLATE,
    createReason:
      'Create auth-aware Better Convex provider for the app scaffold.',
    updateReason:
      'Update Better Convex provider with auth-aware client wiring.',
    skipReason: 'Better Convex provider already matches the auth scaffold.',
  });
}

export const authRegistryItem = defineInternalRegistryItem({
  item: {
    name: 'auth',
    type: 'registry:item',
    title: 'Auth',
    description:
      'Minimal Better Auth wiring on top of the universal Better Convex init baseline.',
    categories: ['auth', 'better-auth', 'signin', 'session'],
    docs: 'https://better-convex.vercel.app/docs/auth/server',
    dependencies: [BETTER_AUTH_INSTALL_SPEC],
    files: AUTH_FILES,
  },
  internal: {
    localDocsPath: 'www/content/docs/auth/server.mdx',
    envFields: [
      {
        bootstrap: {
          kind: 'generated-secret',
        },
        key: 'BETTER_AUTH_SECRET',
        schema: 'z.string().optional()',
      },
      {
        key: 'JWKS',
        schema: 'z.string().optional()',
      },
    ],
    schemaRegistration: {
      importName: 'authExtension',
      path: 'schema.ts',
      target: 'lib',
    },
    defaultPreset: 'default',
    presets: [
      {
        name: 'default',
        description:
          'Scaffold minimal Better Auth server + client wiring on top of init.',
        registryDependencies: AUTH_FILES.map((file) => file.meta.id),
      },
    ],
    integration: {
      resolveScaffoldRoots: ({ functionsDir }) => ({
        functionsRootDir: functionsDir,
      }),
      resolveTemplates: ({ roots, templates }) => {
        if (!roots.projectContext || roots.projectContext.mode === 'next-app') {
          return templates;
        }

        return templates
          .filter((template) => template.id !== 'auth-page')
          .map((template) => {
            if (template.id === 'auth-client') {
              return {
                ...template,
                content: AUTH_REACT_CLIENT_TEMPLATE,
              };
            }

            return template;
          });
      },
      buildPlanFiles: ({ config, functionsDir, roots }) => {
        return [
          buildAuthHttpRegistrationPlanFile({
            config,
            functionsDir,
            roots,
          }),
          buildAuthCrpcRegistrationPlanFile({
            config,
            functionsDir,
            roots,
          }),
          buildAuthProviderPlanFile({
            config,
            functionsDir,
            roots,
          }),
        ];
      },
    },
  },
});
