import fs from 'node:fs';
import { resolve } from 'node:path';
import {
  BETTER_AUTH_INSTALL_SPEC,
  OPENTELEMETRY_API_INSTALL_SPEC,
} from '../../../supported-dependencies.js';
import { defineInternalRegistryItem } from '../../define-item.js';
import { createRegistryFile } from '../../files.js';
import { INIT_EXPO_CONVEX_PROVIDER_TEMPLATE } from '../../init/expo/init-expo-convex-provider.template.js';
import { INIT_CRPC_TEMPLATE } from '../../init/init-crpc.template.js';
import { INIT_HTTP_TEMPLATE } from '../../init/init-http.template.js';
import { INIT_NEXT_CONVEX_PROVIDER_TEMPLATE } from '../../init/next/init-next-convex-provider.template.js';
import { INIT_NEXT_SERVER_TEMPLATE } from '../../init/next/init-next-server.template.js';
import { INIT_REACT_CONVEX_PROVIDER_TEMPLATE } from '../../init/react/init-react-convex-provider.template.js';
import { INIT_START_CONVEX_PROVIDER_TEMPLATE } from '../../init/start/init-start-convex-provider.template.js';
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
import {
  AUTH_CONVEX_TEMPLATE,
  AUTH_EXPO_TEMPLATE,
  AUTH_TEMPLATE,
} from './auth.template.js';
import {
  AUTH_CLIENT_TEMPLATE,
  AUTH_CONVEX_CLIENT_TEMPLATE,
  AUTH_CONVEX_REACT_CLIENT_TEMPLATE,
  AUTH_EXPO_CLIENT_TEMPLATE,
  AUTH_REACT_CLIENT_TEMPLATE,
  AUTH_START_CLIENT_TEMPLATE,
} from './auth-client.template.js';
import {
  AUTH_CONFIG_TEMPLATE,
  AUTH_CONVEX_CONFIG_TEMPLATE,
} from './auth-config.template.js';
import { AUTH_CONVEX_PROVIDER_TEMPLATE } from './auth-convex-provider.template.js';
import { renderAuthCrpcTemplate } from './auth-crpc.template.js';
import { AUTH_EXPO_CONVEX_PROVIDER_TEMPLATE } from './auth-expo-convex-provider.template.js';
import { AUTH_EXPO_PAGE_TEMPLATE } from './auth-expo-page.template.js';
import { AUTH_NEXT_ROUTE_TEMPLATE } from './auth-next-route.template.js';
import { AUTH_NEXT_SERVER_TEMPLATE } from './auth-next-server.template.js';
import { AUTH_PAGE_TEMPLATE } from './auth-page.template.js';
import { AUTH_REACT_CONVEX_PROVIDER_TEMPLATE } from './auth-react-convex-provider.template.js';
import { AUTH_CONVEX_SCHEMA_TEMPLATE } from './auth-schema.template.js';
import { AUTH_START_CONVEX_PROVIDER_TEMPLATE } from './auth-start-convex-provider.template.js';
import { AUTH_START_PAGE_TEMPLATE } from './auth-start-page.template.js';
import { AUTH_START_ROUTE_TEMPLATE } from './auth-start-route.template.js';
import { AUTH_START_SERVER_TEMPLATE } from './auth-start-server.template.js';
import { AUTH_START_SERVER_CALL_TEMPLATE } from './auth-start-server-call.template.js';
import {
  loadAuthOptionsFromDefinition,
  preserveUserOwnedAuthScaffoldFiles,
  reconcileAuthScaffoldFiles,
  resolveManagedAuthSchemaUnits,
} from './reconcile-auth-schema.js';

const INIT_HTTP_API_USE_BLOCK_RE =
  /app\.use\(\s*['"]\/api\/\*['"][\s\S]*?\);\n?/;
const AUTH_CONVEX_HTTP_CALL_RE = /registerRoutes\(http,\s*getAuth,\s*\{/;
const AUTH_CONVEX_HTTP_ROUTER_RE = /const\s+http\s*=\s*httpRouter\(\);?/;
const AUTH_CONVEX_HTTP_IMPORT_RE = /from\s+['"]kitcn\/auth\/http['"]/;
const AUTH_CONVEX_HTTP_GET_AUTH_IMPORT_RE =
  /from\s+['"]\.\/generated\/auth['"]/;
const AUTH_CONVEX_SCHEMA_CALL_RE = /defineSchema\(\s*\{/;
const AUTH_CONVEX_APP_IMPORT_RE = /import App from ['"][^'"]+['"];?/;
const AUTH_CONVEX_PROVIDER_IMPORT_RE =
  /import\s+\{\s*ConvexProvider,\s*ConvexReactClient\s*\}\s+from\s+['"]convex\/react['"];?/;
const AUTH_PROVIDER_REACT_NODE_IMPORT_RE =
  /import\s+type\s+\{\s*ReactNode\s*\}\s+from\s+['"]react['"];?/;
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
  {
    key: 'CONVEX_SITE_URL',
    schema: 'z.string().optional()',
  },
] as const;
const BETTER_AUTH_EXPO_INSTALL_SPEC = '@better-auth/expo@1.6.5';
const EXPO_SECURE_STORE_INSTALL_SPEC = 'expo-secure-store@~55.0.8';
const EXPO_NETWORK_INSTALL_SPEC = 'expo-network@~55.0.8';

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
    dependencyHintMessage:
      'Auth runtime depends on OpenTelemetry API and kitcn runtime helpers.',
    dependencyHints: [OPENTELEMETRY_API_INSTALL_SPEC, 'kitcn'],
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
  const authSchemaLock = params.lockfile.plugins.auth?.schema ?? null;
  const result = await reconcileRootSchemaOwnership({
    claimMatchingManaged:
      params.applyScope === 'schema' && authSchemaLock === null,
    lock: authSchemaLock,
    overwrite: params.overwrite,
    overwriteManaged: params.applyScope === 'schema',
    pluginKey: 'auth',
    preview: params.preview,
    promptAdapter: params.promptAdapter,
    schemaPath,
    source,
    tables: await resolveManagedAuthSchemaUnits({
      authDefinitionPath,
      loadAuthOptions: loadAuthOptionsFromDefinition,
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
    manualActions: result.manualActions,
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

  if (!source.includes("from 'kitcn/auth/http'")) {
    source = `import { authMiddleware } from 'kitcn/auth/http';\n${source}`;
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
  const projectContext = params.roots.projectContext;
  if (!projectContext) {
    throw new Error(
      'Auth scaffolding requires a supported app baseline. Run `kitcn init --yes` in a supported app, or bootstrap one with `kitcn init -t <next|expo|start|vite>` first.'
    );
  }

  if (projectContext.framework === 'expo') {
    const providerPath = resolve(
      process.cwd(),
      projectContext.convexClientDir,
      'convex-provider.tsx'
    );

    return createPlanFile({
      kind: 'scaffold',
      filePath: providerPath,
      content: AUTH_EXPO_CONVEX_PROVIDER_TEMPLATE,
      managedBaselineContent: INIT_EXPO_CONVEX_PROVIDER_TEMPLATE,
      createReason: 'Create auth-aware kitcn provider for the Expo scaffold.',
      updateReason: 'Update kitcn provider with auth-aware client wiring.',
      skipReason: 'kitcn provider already matches the auth scaffold.',
    });
  }

  if (projectContext.framework === 'tanstack-start') {
    const providerPath = resolve(
      process.cwd(),
      projectContext.convexClientDir,
      'convex-provider.tsx'
    );

    return createPlanFile({
      kind: 'scaffold',
      filePath: providerPath,
      content: AUTH_START_CONVEX_PROVIDER_TEMPLATE,
      managedBaselineContent: INIT_START_CONVEX_PROVIDER_TEMPLATE,
      createReason: 'Create auth-aware kitcn provider for the app scaffold.',
      updateReason: 'Update kitcn provider with auth-aware client wiring.',
      skipReason: 'kitcn provider already matches the auth scaffold.',
    });
  }

  const providerPath = resolve(
    process.cwd(),
    projectContext.convexClientDir,
    'convex-provider.tsx'
  );
  const isNextApp = projectContext.mode === 'next-app';

  return createPlanFile({
    kind: 'scaffold',
    filePath: providerPath,
    content: isNextApp
      ? AUTH_CONVEX_PROVIDER_TEMPLATE
      : AUTH_REACT_CONVEX_PROVIDER_TEMPLATE,
    managedBaselineContent: isNextApp
      ? INIT_NEXT_CONVEX_PROVIDER_TEMPLATE
      : INIT_REACT_CONVEX_PROVIDER_TEMPLATE,
    createReason: 'Create auth-aware kitcn provider for the app scaffold.',
    updateReason: 'Update kitcn provider with auth-aware client wiring.',
    skipReason: 'kitcn provider already matches the auth scaffold.',
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

function buildAuthStartServerPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'tanstack-start') {
    throw new Error(
      'Auth scaffolding requires a supported TanStack Start shell.'
    );
  }

  const serverPath = resolve(
    process.cwd(),
    projectContext.convexClientDir,
    'auth-server.ts'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: serverPath,
    content: AUTH_START_SERVER_TEMPLATE,
    createReason: 'Create auth-aware Start server helpers.',
    updateReason: 'Update Start server helpers with auth route support.',
    skipReason: 'Start server helpers already include auth route support.',
  });
}

function buildAuthStartRoutePlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'tanstack-start') {
    throw new Error(
      'Auth scaffolding requires a supported TanStack Start shell.'
    );
  }

  const routePath = resolve(
    process.cwd(),
    projectContext.usesSrc ? 'src' : '',
    'routes',
    'api',
    'auth',
    '$.ts'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: routePath,
    content: AUTH_START_ROUTE_TEMPLATE,
    createReason: 'Create the Start auth proxy route.',
    updateReason: 'Update the Start auth proxy route.',
    skipReason: 'The Start auth proxy route already exists.',
  });
}

function buildAuthStartServerCallPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'tanstack-start') {
    throw new Error(
      'Auth scaffolding requires a supported TanStack Start shell.'
    );
  }

  const serverPath = resolve(
    process.cwd(),
    projectContext.convexClientDir,
    'server.ts'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: serverPath,
    content: AUTH_START_SERVER_CALL_TEMPLATE,
    createReason: 'Create auth-aware Start server caller helpers.',
    updateReason: 'Update Start server caller helpers with auth token wiring.',
    skipReason:
      'Start server caller helpers already include auth token wiring.',
  });
}

function buildAuthStartPagePlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'tanstack-start') {
    throw new Error(
      'Auth scaffolding requires a supported TanStack Start shell.'
    );
  }

  const pagePath = resolve(
    process.cwd(),
    projectContext.usesSrc ? 'src' : '',
    'routes',
    'auth.tsx'
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: pagePath,
    content: AUTH_START_PAGE_TEMPLATE,
    createReason: 'Create the Start auth demo route.',
    updateReason: 'Update the Start auth demo route.',
    skipReason: 'The Start auth demo route already exists.',
  });
}

function buildAuthExpoPagePlanFile(params: PluginRegistryBuildPlanFilesParams) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'expo') {
    throw new Error('Auth scaffolding requires a supported Expo shell.');
  }

  const pagePath = resolve(process.cwd(), projectContext.appDir, 'auth.tsx');

  return createPlanFile({
    kind: 'scaffold',
    filePath: pagePath,
    content: AUTH_EXPO_PAGE_TEMPLATE,
    createReason: 'Create the Expo auth demo route.',
    updateReason: 'Update the Expo auth demo route.',
    skipReason: 'The Expo auth demo route already exists.',
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
    : `import { registerRoutes } from 'kitcn/auth/http';
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

  if (!AUTH_CONVEX_HTTP_IMPORT_RE.test(source)) {
    source = `import { registerRoutes } from 'kitcn/auth/http';\n${source}`;
  }
  if (!AUTH_CONVEX_HTTP_GET_AUTH_IMPORT_RE.test(source)) {
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

function patchAuthConvexProviderSource(source: string) {
  let nextSource = source;

  if (!nextSource.includes("from 'kitcn/auth/client'")) {
    nextSource = nextSource.replace(
      AUTH_CONVEX_PROVIDER_IMPORT_RE,
      "import { ConvexAuthProvider } from 'kitcn/auth/client';\nimport { ConvexReactClient } from 'convex/react';"
    );
  }
  if (
    !nextSource.includes(
      "import { authClient } from '@/lib/convex/auth-client';"
    )
  ) {
    nextSource = nextSource.replace(
      AUTH_PROVIDER_REACT_NODE_IMPORT_RE,
      "import type { ReactNode } from 'react';\nimport { authClient } from '@/lib/convex/auth-client';"
    );
  }
  if (!nextSource.includes('<ConvexAuthProvider')) {
    nextSource = nextSource.replace(
      AUTH_CONVEX_NEXT_PROVIDER_RETURN_RE,
      '<ConvexAuthProvider authClient={authClient} client={convex}>{children}</ConvexAuthProvider>'
    );
  }

  return nextSource;
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
  source = patchAuthConvexProviderSource(source);

  return createPlanFile({
    kind: 'scaffold',
    filePath: providerPath,
    content: source,
    createReason: 'Create auth-aware Convex client provider.',
    updateReason: 'Update Convex client provider with auth.',
    skipReason: 'Convex client provider already includes auth.',
  });
}

function buildAuthConvexStartProviderPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const projectContext = params.roots.projectContext;
  if (!projectContext || projectContext.framework !== 'tanstack-start') {
    throw new Error(
      'Auth preset "convex" requires a supported TanStack Start app shell.'
    );
  }

  const providerPath = resolve(
    process.cwd(),
    projectContext.convexClientDir,
    'convex-provider.tsx'
  );
  if (!fs.existsSync(providerPath)) {
    throw new Error(
      'Auth preset "convex" for TanStack Start expects src/lib/convex/convex-provider.tsx.'
    );
  }

  const source = patchAuthConvexProviderSource(
    fs.readFileSync(providerPath, 'utf8')
  );

  return createPlanFile({
    kind: 'scaffold',
    filePath: providerPath,
    content: source,
    createReason: 'Create auth-aware Start provider.',
    updateReason: 'Update Start provider with auth.',
    skipReason: 'Start provider already includes auth.',
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
  if (!projectContext.clientEntryFile) {
    throw new Error(
      'Auth preset "convex" requires a Vite-style client entry file (main.tsx/main.jsx).'
    );
  }

  const entryPath = resolve(process.cwd(), projectContext.clientEntryFile);
  let source = fs.readFileSync(entryPath, 'utf8');

  if (!source.includes("from 'kitcn/auth/client'")) {
    source = source.replace(
      "import { ConvexProvider, ConvexReactClient } from 'convex/react';",
      "import { ConvexAuthProvider } from 'kitcn/auth/client';\nimport { ConvexReactClient } from 'convex/react';"
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
  const projectContext = params.roots.projectContext;
  if (projectContext?.mode === 'next-app') {
    return buildAuthConvexNextProviderPlanFile(params);
  }
  if (projectContext?.framework === 'tanstack-start') {
    return buildAuthConvexStartProviderPlanFile(params);
  }

  return buildAuthConvexReactEntryPlanFile(params);
}

export const authRegistryItem = defineInternalRegistryItem({
  item: {
    name: 'auth',
    type: 'registry:item',
    title: 'Auth',
    description:
      'Minimal Better Auth wiring on top of the universal kitcn init baseline.',
    categories: ['auth', 'better-auth', 'signin', 'session'],
    docs: 'https://kitcn.vercel.app/docs/auth/server',
    dependencies: [BETTER_AUTH_INSTALL_SPEC],
    files: [...AUTH_FILES, ...AUTH_CONVEX_FILES],
  },
  internal: {
    localDocsPath: 'www/content/docs/auth/server.mdx',
    planningDependencies: [OPENTELEMETRY_API_INSTALL_SPEC],
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
          'Adopt a raw Convex app with auth only, without kitcn baseline files.',
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

        if (roots.projectContext.framework === 'expo') {
          return templates
            .filter((template) => template.id !== 'auth-page')
            .map((template) => {
              if (template.id === 'auth-runtime') {
                return {
                  ...template,
                  content: AUTH_EXPO_TEMPLATE,
                  dependencyHintMessage:
                    'Expo auth runtime needs the Better Auth Expo plugin.',
                  dependencyHints: [
                    OPENTELEMETRY_API_INSTALL_SPEC,
                    BETTER_AUTH_EXPO_INSTALL_SPEC,
                  ],
                };
              }
              if (template.id === 'auth-client') {
                return {
                  ...template,
                  content: AUTH_EXPO_CLIENT_TEMPLATE,
                  dependencyHintMessage:
                    'Expo auth client needs native Better Auth and Expo storage dependencies.',
                  dependencyHints: [
                    BETTER_AUTH_EXPO_INSTALL_SPEC,
                    EXPO_SECURE_STORE_INSTALL_SPEC,
                    EXPO_NETWORK_INSTALL_SPEC,
                  ],
                };
              }

              return template;
            });
        }

        if (roots.projectContext.framework === 'tanstack-start') {
          return templates
            .filter(
              (template) =>
                template.id !== 'auth-page' &&
                template.id !== 'auth-page-convex'
            )
            .map((template) => {
              if (template.id === 'auth-client') {
                return {
                  ...template,
                  content: AUTH_START_CLIENT_TEMPLATE,
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
        } else if (roots.projectContext?.framework === 'expo') {
          files.push(buildAuthExpoPagePlanFile(params));
        } else if (roots.projectContext?.framework === 'tanstack-start') {
          files.push(
            buildAuthStartServerPlanFile(params),
            buildAuthStartRoutePlanFile(params),
            buildAuthStartServerCallPlanFile(params),
            buildAuthStartPagePlanFile(params)
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
