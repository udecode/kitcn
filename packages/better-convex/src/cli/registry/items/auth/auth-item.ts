import fs from 'node:fs';
import { resolve } from 'node:path';
import {
  BETTER_AUTH_INSTALL_SPEC,
  OPENTELEMETRY_API_INSTALL_SPEC,
} from '../../../supported-dependencies.js';
import { defineInternalRegistryItem } from '../../define-item.js';
import { createRegistryFile } from '../../files.js';
import { INIT_CRPC_TEMPLATE } from '../../init/init-crpc.template.js';
import { INIT_HTTP_TEMPLATE } from '../../init/init-http.template.js';
import { INIT_NEXT_CONVEX_PROVIDER_TEMPLATE } from '../../init/next/init-next-convex-provider.template.js';
import { INIT_NEXT_SERVER_TEMPLATE } from '../../init/next/init-next-server.template.js';
import { INIT_REACT_CONVEX_PROVIDER_TEMPLATE } from '../../init/react/init-react-convex-provider.template.js';
import {
  createPlanFile,
  getCrpcFilePath,
  getHttpFilePath,
  renderInitTemplateContent,
  resolveRelativeImportPath,
} from '../../plan-helpers.js';
import { renderLocalConvexEnvContent } from '../../planner.js';
import { reconcileRootSchemaOwnership } from '../../schema-ownership.js';
import { getSchemaFilePath } from '../../state.js';
import type { PluginRegistryBuildPlanFilesParams } from '../../types.js';
import { AUTH_CONVEX_TEMPLATE, AUTH_TEMPLATE } from './auth.template.js';
import {
  AUTH_CLIENT_TEMPLATE,
  AUTH_CONVEX_CLIENT_TEMPLATE,
  AUTH_CONVEX_REACT_CLIENT_TEMPLATE,
  AUTH_REACT_CLIENT_TEMPLATE,
} from './auth-client.template.js';
import {
  AUTH_CONFIG_TEMPLATE,
  AUTH_CONVEX_CONFIG_TEMPLATE,
} from './auth-config.template.js';
import { AUTH_CONVEX_PROVIDER_TEMPLATE } from './auth-convex-provider.template.js';
import { renderAuthCrpcTemplate } from './auth-crpc.template.js';
import { AUTH_NEXT_ROUTE_TEMPLATE } from './auth-next-route.template.js';
import { AUTH_NEXT_SERVER_TEMPLATE } from './auth-next-server.template.js';
import { AUTH_PAGE_TEMPLATE } from './auth-page.template.js';
import { AUTH_REACT_CONVEX_PROVIDER_TEMPLATE } from './auth-react-convex-provider.template.js';
import { AUTH_CONVEX_SCHEMA_TEMPLATE } from './auth-schema.template.js';
import {
  loadAuthOptionsFromDefinition,
  loadDefaultManagedAuthOptions,
  preserveUserOwnedAuthScaffoldFiles,
  reconcileAuthScaffoldFiles,
  renderManagedAuthSchemaUnits,
} from './reconcile-auth-schema.js';

const INIT_HTTP_API_USE_BLOCK_RE =
  /app\.use\(\s*['"]\/api\/\*['"][\s\S]*?\);\n?/;
const AUTH_CONVEX_HTTP_CALL_RE = /registerRoutes\(http,\s*getAuth,\s*\{/;
const AUTH_CONVEX_HTTP_ROUTER_RE = /const\s+http\s*=\s*httpRouter\(\);?/;
const AUTH_CONVEX_SCHEMA_CALL_RE = /defineSchema\(\s*\{/;
const AUTH_CONVEX_APP_IMPORT_RE = /import App from ['"][^'"]+['"];?/;
const AUTH_CONVEX_NEXT_PROVIDER_IMPORT_RE =
  /import\s+\{\s*ConvexProvider,\s*ConvexReactClient\s*\}\s+from\s+'convex\/react';/;
const AUTH_CONVEX_NEXT_PROVIDER_RETURN_RE =
  /<ConvexProvider client=\{convex\}>[\s\S]*?<\/ConvexProvider>/;
const AUTH_CONVEX_REACT_PROVIDER_OPEN_RE = /<ConvexProvider client=\{convex\}>/;
const AUTH_CONVEX_REACT_PROVIDER_CLOSE_RE = /<\/ConvexProvider>/;
const AUTH_ENV_FIELDS = [
  {
    bootstrap: {
      kind: 'generated-secret' as const,
    },
    key: 'BETTER_AUTH_SECRET',
    schema: 'z.string().optional()',
  },
  {
    key: 'JWKS',
    schema: 'z.string().optional()',
  },
] as const;

const AUTH_FILES = [
  createRegistryFile({
    id: 'auth-config',
    path: 'auth.config.ts',
    target: 'functions',
    content: AUTH_CONFIG_TEMPLATE,
  }),
  createRegistryFile({
    id: 'auth-runtime',
    path: 'auth.ts',
    target: 'functions',
    content: AUTH_TEMPLATE,
    requires: ['auth-config'],
    dependencyHintMessage: 'Auth runtime depends on OpenTelemetry API.',
    dependencyHints: [OPENTELEMETRY_API_INSTALL_SPEC],
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

const AUTH_CONVEX_FILES = [
  createRegistryFile({
    id: 'auth-schema-convex',
    path: 'authSchema.ts',
    target: 'functions',
    content: AUTH_CONVEX_SCHEMA_TEMPLATE,
  }),
  createRegistryFile({
    id: 'auth-config-convex',
    path: 'auth.config.ts',
    target: 'functions',
    content: AUTH_CONVEX_CONFIG_TEMPLATE,
    requires: ['auth-schema-convex'],
  }),
  createRegistryFile({
    id: 'auth-runtime-convex',
    path: 'auth.ts',
    target: 'functions',
    content: AUTH_CONVEX_TEMPLATE,
    requires: ['auth-config-convex'],
    dependencyHintMessage: 'Auth runtime depends on OpenTelemetry API.',
    dependencyHints: [OPENTELEMETRY_API_INSTALL_SPEC],
  }),
  createRegistryFile({
    id: 'auth-client-convex',
    path: 'convex/auth-client.ts',
    target: 'client-lib',
    content: AUTH_CONVEX_CLIENT_TEMPLATE,
    requires: ['auth-runtime-convex'],
  }),
] as const;

async function buildAuthSchemaRegistrationPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  if (params.preset === 'convex') {
    return buildAuthConvexSchemaPlanFile(params);
  }

  const schemaPath = getSchemaFilePath(params.functionsDir);
  const source = fs.readFileSync(schemaPath, 'utf8');
  const authDefinitionPath = resolve(params.functionsDir, 'auth.ts');
  const authOptions =
    (await loadAuthOptionsFromDefinition(authDefinitionPath)) ??
    (await loadDefaultManagedAuthOptions());
  const authSchemaLock = params.lockfile.plugins.auth?.schema ?? null;
  const result = await reconcileRootSchemaOwnership({
    lock: authSchemaLock,
    overwrite:
      params.overwrite ||
      (params.applyScope === 'schema' && authSchemaLock === null),
    overwriteManaged: params.applyScope === 'schema',
    pluginKey: 'auth',
    preview: params.preview,
    promptAdapter: params.promptAdapter,
    schemaPath,
    source,
    tables: await renderManagedAuthSchemaUnits({
      authOptions,
    }),
    yes: params.yes,
  });
  return {
    ...createPlanFile({
      kind: 'schema',
      filePath: schemaPath,
      content: result.content,
      createReason: 'Create schema.ts with auth tables.',
      updateReason: 'Register auth tables in schema.ts.',
      skipReason: 'Auth tables are already registered in schema.ts.',
    }),
    schemaOwnershipLock: result.lock,
  };
}

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
      'Auth scaffolding requires a supported app baseline. Run `better-convex init --yes` in a supported app, or bootstrap one with `better-convex init -t <next|vite>` first.'
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

function buildAuthNextServerPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.mode !== 'next-app') {
    throw new Error('Auth scaffolding requires a supported Next.js app shell.');
  }

  const serverPath = resolve(
    process.cwd(),
    projectContext.convexClientDir,
    'server.ts'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: serverPath,
    content: AUTH_NEXT_SERVER_TEMPLATE,
    managedBaselineContent: INIT_NEXT_SERVER_TEMPLATE,
    createReason: 'Create auth-aware Next server helpers.',
    updateReason: 'Update Next server helpers with auth route support.',
    skipReason: 'Next server helpers already include auth route support.',
  });
}

function buildAuthNextRoutePlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.mode !== 'next-app') {
    throw new Error('Auth scaffolding requires a supported Next.js app shell.');
  }

  const routePath = resolve(
    process.cwd(),
    projectContext.appDir,
    'api',
    'auth',
    '[...all]',
    'route.ts'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: routePath,
    content: AUTH_NEXT_ROUTE_TEMPLATE,
    createReason: 'Create the Next auth proxy route.',
    updateReason: 'Update the Next auth proxy route.',
    skipReason: 'The Next auth proxy route already exists.',
  });
}

function buildAuthConvexLocalEnvPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const envPath = resolve(params.functionsDir, '.env');
  const content =
    renderLocalConvexEnvContent(
      AUTH_ENV_FIELDS,
      fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : undefined
    ) ?? '';

  return createPlanFile({
    kind: 'env',
    filePath: envPath,
    content,
    createReason: 'Create convex/.env with auth defaults.',
    updateReason: 'Update convex/.env with auth defaults.',
    skipReason: 'convex/.env already includes auth defaults.',
  });
}

function buildAuthConvexHttpPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const httpPath = getHttpFilePath(params.functionsDir);
  let source = fs.existsSync(httpPath)
    ? fs.readFileSync(httpPath, 'utf8')
    : `import { registerRoutes } from 'better-convex/auth/http';
import { httpRouter } from 'convex/server';
import { getAuth } from './generated/auth';

const http = httpRouter();

registerRoutes(http, getAuth, {
  cors: {
    allowedOrigins: [process.env.SITE_URL!],
  },
});

export default http;
`;

  if (!source.includes("from 'better-convex/auth/http'")) {
    source = `import { registerRoutes } from 'better-convex/auth/http';\n${source}`;
  }
  if (!source.includes("from './generated/auth'")) {
    source = `import { getAuth } from './generated/auth';\n${source}`;
  }
  if (!AUTH_CONVEX_HTTP_CALL_RE.test(source)) {
    source = source.replace(
      AUTH_CONVEX_HTTP_ROUTER_RE,
      (match) =>
        `${match}\n\nregisterRoutes(http, getAuth, {\n  cors: {\n    allowedOrigins: [process.env.SITE_URL!],\n  },\n});`
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: httpPath,
    content: source,
    createReason: 'Create Convex http.ts with auth routes.',
    updateReason: 'Register auth routes in Convex http.ts.',
    skipReason: 'Convex http.ts already registers auth routes.',
  });
}

function buildAuthConvexSchemaPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const schemaPath = getSchemaFilePath(params.functionsDir);
  let source = fs.readFileSync(schemaPath, 'utf8');

  if (!source.includes("import { authSchema } from './authSchema';")) {
    source = `import { authSchema } from './authSchema';\n${source}`;
  }
  if (!source.includes('...authSchema')) {
    source = source.replace(
      AUTH_CONVEX_SCHEMA_CALL_RE,
      (match) => `${match}\n  ...authSchema,`
    );
  }

  return createPlanFile({
    kind: 'schema',
    filePath: schemaPath,
    content: source,
    createReason: 'Create schema.ts with auth schema registration.',
    updateReason: 'Register auth tables in schema.ts.',
    skipReason: 'schema.ts already registers auth tables.',
  });
}

function buildAuthConvexNextProviderPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.mode !== 'next-app') {
    throw new Error(
      'Auth preset "convex" requires a supported Next or Vite app shell.'
    );
  }

  const providerPath = resolve(
    process.cwd(),
    projectContext.componentsDir,
    'ConvexClientProvider.tsx'
  );
  if (!fs.existsSync(providerPath)) {
    throw new Error(
      'Auth preset "convex" for Next apps expects components/ConvexClientProvider.tsx.'
    );
  }

  let source = fs.readFileSync(providerPath, 'utf8');
  if (!source.includes("from 'better-convex/auth/client'")) {
    source = source.replace(
      AUTH_CONVEX_NEXT_PROVIDER_IMPORT_RE,
      "import { ConvexAuthProvider } from 'better-convex/auth/client';\nimport { ConvexReactClient } from 'convex/react';"
    );
  }
  if (
    !source.includes("import { authClient } from '@/lib/convex/auth-client';")
  ) {
    source = source.replace(
      "import type { ReactNode } from 'react';",
      "import type { ReactNode } from 'react';\nimport { authClient } from '@/lib/convex/auth-client';"
    );
  }
  if (!source.includes('<ConvexAuthProvider')) {
    source = source.replace(
      AUTH_CONVEX_NEXT_PROVIDER_RETURN_RE,
      '<ConvexAuthProvider authClient={authClient} client={convex}>{children}</ConvexAuthProvider>'
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: providerPath,
    content: source,
    createReason: 'Create auth-aware Convex client provider.',
    updateReason: 'Update Convex client provider with auth.',
    skipReason: 'Convex client provider already includes auth.',
  });
}

function buildAuthConvexReactEntryPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.mode !== 'react') {
    throw new Error(
      'Auth preset "convex" requires a supported Next or Vite app shell.'
    );
  }

  const entryPath = resolve(process.cwd(), projectContext.clientEntryFile);
  let source = fs.readFileSync(entryPath, 'utf8');

  if (!source.includes("from 'better-convex/auth/client'")) {
    source = source.replace(
      "import { ConvexProvider, ConvexReactClient } from 'convex/react';",
      "import { ConvexAuthProvider } from 'better-convex/auth/client';\nimport { ConvexReactClient } from 'convex/react';"
    );
  }
  if (
    !source.includes("import { authClient } from '@/lib/convex/auth-client';")
  ) {
    source = source.replace(
      AUTH_CONVEX_APP_IMPORT_RE,
      (match) =>
        `${match}\nimport { authClient } from '@/lib/convex/auth-client';`
    );
  }
  if (!source.includes('<ConvexAuthProvider')) {
    source = source
      .replace(
        AUTH_CONVEX_REACT_PROVIDER_OPEN_RE,
        '<ConvexAuthProvider authClient={authClient} client={convex}>'
      )
      .replace(AUTH_CONVEX_REACT_PROVIDER_CLOSE_RE, '</ConvexAuthProvider>');
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: entryPath,
    content: source,
    createReason: 'Create auth-aware client entry.',
    updateReason: 'Update client entry with auth.',
    skipReason: 'Client entry already includes auth.',
  });
}

function buildAuthConvexProviderPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  return params.roots.projectContext?.mode === 'next-app'
    ? buildAuthConvexNextProviderPlanFile(params)
    : buildAuthConvexReactEntryPlanFile(params);
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
    files: [...AUTH_FILES, ...AUTH_CONVEX_FILES],
  },
  internal: {
    localDocsPath: 'www/content/docs/auth/server.mdx',
    envFields: AUTH_ENV_FIELDS,
    liveBootstrap: {
      mode: 'local',
    },
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
      {
        name: 'convex',
        description:
          'Adopt a raw Convex app with auth only, without Better Convex baseline files.',
        registryDependencies: AUTH_CONVEX_FILES.map((file) => file.meta.id),
      },
    ],
    integration: {
      resolveScaffoldRoots: ({ functionsDir }) => ({
        functionsRootDir: functionsDir,
      }),
      reconcileScaffoldFiles: async ({ functionsDir, scaffoldFiles }) =>
        preserveUserOwnedAuthScaffoldFiles(
          await reconcileAuthScaffoldFiles({
            functionsDir,
            scaffoldFiles,
          })
        ),
      resolveTemplates: ({ roots, templates }) => {
        if (!roots.projectContext || roots.projectContext.mode === 'next-app') {
          return templates;
        }

        return templates
          .filter(
            (template) =>
              template.id !== 'auth-page' && template.id !== 'auth-page-convex'
          )
          .map((template) => {
            if (template.id === 'auth-client') {
              return {
                ...template,
                content: AUTH_REACT_CLIENT_TEMPLATE,
              };
            }
            if (template.id === 'auth-client-convex') {
              return {
                ...template,
                content: AUTH_CONVEX_REACT_CLIENT_TEMPLATE,
              };
            }

            return template;
          });
      },
      buildPlanFiles: (params) => {
        const { preset, roots } = params;
        if (preset === 'convex') {
          return [
            buildAuthConvexLocalEnvPlanFile(params),
            buildAuthConvexHttpPlanFile(params),
            buildAuthConvexProviderPlanFile(params),
          ];
        }

        const files = [
          buildAuthHttpRegistrationPlanFile(params),
          buildAuthCrpcRegistrationPlanFile(params),
          buildAuthProviderPlanFile(params),
        ];

        if (roots.projectContext?.mode === 'next-app') {
          files.push(
            buildAuthNextServerPlanFile(params),
            buildAuthNextRoutePlanFile(params)
          );
        }

        return files;
      },
      buildSchemaRegistrationPlanFile: ({
        applyScope,
        config,
        functionsDir,
        lockfile,
        overwrite,
        preset,
        preview,
        promptAdapter,
        roots,
        yes,
      }) =>
        buildAuthSchemaRegistrationPlanFile({
          applyScope,
          config,
          functionsDir,
          lockfile,
          overwrite,
          preset,
          preview,
          promptAdapter,
          roots,
          yes,
        }),
    },
  },
});
