import fs from 'node:fs';
import { defineInternalRegistryItem } from '../../define-item.js';
import { createRegistryFile } from '../../files.js';
import { INIT_CRPC_TEMPLATE } from '../../init/init-crpc.template.js';
import {
  createPlanFile,
  getCrpcFilePath,
  renderInitTemplateContent,
} from '../../plan-helpers.js';
import type { PluginRegistryBuildPlanFilesParams } from '../../types.js';
import { RATELIMIT_PLUGIN_TEMPLATE } from './ratelimit-plugin.template.js';
import { RATELIMIT_SCHEMA_TEMPLATE } from './ratelimit-schema.template.js';

const CRPC_META_RATELIMIT_RE = /ratelimit\?: string;/;
const CRPC_RATELIMIT_BUCKET_RE = /ratelimit\?: RatelimitBucket;/;
const CRPC_CREATE_LINE_RE = /const c = initCRPC\.create\(\);/;
const CRPC_META_CREATE_RE =
  /const c = initCRPC\s*\.meta<\{\s*([\s\S]*?)\s*\}>\(\)\s*\.create\(\);/;
const PUBLIC_MUTATION_LINE_RE =
  /export const publicMutation = c\.mutation(?:\.use\(ratelimit\.middleware\(\)\))?;/;

const RATELIMIT_FILES = [
  createRegistryFile({
    id: 'ratelimit-schema',
    path: 'schema.ts',
    target: 'lib',
    content: RATELIMIT_SCHEMA_TEMPLATE,
  }),
  createRegistryFile({
    id: 'ratelimit-plugin',
    path: 'plugin.ts',
    target: 'lib',
    content: RATELIMIT_PLUGIN_TEMPLATE,
    requires: ['ratelimit-schema'],
  }),
] as const;

function buildRatelimitCrpcRegistrationPlanFile(
  params: PluginRegistryBuildPlanFilesParams
) {
  const crpcPath = getCrpcFilePath(params.config);
  const baselineCrpcSource = renderInitTemplateContent({
    template: INIT_CRPC_TEMPLATE,
    filePath: crpcPath,
    functionsDir: params.functionsDir,
    crpcFilePath: crpcPath,
  });
  let source = fs.existsSync(crpcPath)
    ? fs.readFileSync(crpcPath, 'utf8')
    : baselineCrpcSource;

  if (!source.includes("from './plugins/ratelimit/plugin'")) {
    if (source.includes('import type { ActionCtx, MutationCtx, QueryCtx }')) {
      source = source.replace(
        "import type { ActionCtx, MutationCtx, QueryCtx } from '../functions/generated/server';",
        `import { type RatelimitBucket, ratelimit } from './plugins/ratelimit/plugin';
import type { ActionCtx, MutationCtx, QueryCtx } from '../functions/generated/server';`
      );
    } else {
      source = `import { type RatelimitBucket, ratelimit } from './plugins/ratelimit/plugin';\n${source}`;
    }
  }

  if (CRPC_META_RATELIMIT_RE.test(source)) {
    source = source.replace(
      CRPC_META_RATELIMIT_RE,
      'ratelimit?: RatelimitBucket;'
    );
  }

  if (!CRPC_RATELIMIT_BUCKET_RE.test(source)) {
    if (CRPC_META_CREATE_RE.test(source)) {
      source = source.replace(CRPC_META_CREATE_RE, (_match, fields: string) => {
        const nextFields = [
          ...fields
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          'ratelimit?: RatelimitBucket;',
        ]
          .map((line) => `    ${line}`)
          .join('\n');

        return `const c = initCRPC\n  .meta<{\n${nextFields}\n  }>()\n  .create();`;
      });
    } else if (CRPC_CREATE_LINE_RE.test(source)) {
      source = source.replace(
        CRPC_CREATE_LINE_RE,
        `const c = initCRPC
  .meta<{
    ratelimit?: RatelimitBucket;
  }>()
  .create();`
      );
    }
  }

  if (PUBLIC_MUTATION_LINE_RE.test(source)) {
    source = source.replace(
      PUBLIC_MUTATION_LINE_RE,
      'export const publicMutation = c.mutation.use(ratelimit.middleware());'
    );
  }

  return createPlanFile({
    kind: 'scaffold',
    filePath: crpcPath,
    content: source,
    managedBaselineContent: baselineCrpcSource,
    createReason: 'Create crpc.ts with ratelimit middleware.',
    updateReason: 'Register ratelimit middleware in crpc.ts.',
    skipReason: 'Ratelimit middleware is already registered in crpc.ts.',
  });
}

export const ratelimitRegistryItem = defineInternalRegistryItem({
  item: {
    name: 'ratelimit',
    type: 'registry:item',
    title: 'Ratelimit',
    description:
      'Reusable server-side rate limiting plugin with schema-backed buckets.',
    categories: ['ratelimit', 'rate-limit', 'throttle'],
    docs: 'https://better-convex.vercel.app/docs/plugins/ratelimit',
    dependencies: ['better-convex'],
    files: RATELIMIT_FILES,
  },
  internal: {
    localDocsPath: 'www/content/docs/plugins/ratelimit.mdx',
    schemaRegistration: {
      importName: 'ratelimitExtension',
      path: 'schema.ts',
      target: 'lib',
    },
    defaultPreset: 'server-first',
    presets: [
      {
        name: 'server-first',
        description:
          'Scaffold a reusable ratelimit plugin and auto-register schema extension.',
        registryDependencies: ['ratelimit-schema', 'ratelimit-plugin'],
      },
      {
        name: 'schema-only',
        description: 'Only register ratelimit extension in schema.',
        registryDependencies: ['ratelimit-schema'],
      },
    ],
    integration: {
      buildPlanFiles: (params) => [
        buildRatelimitCrpcRegistrationPlanFile(params),
      ],
    },
  },
});
