import fs from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { parse as parseDotEnv } from 'dotenv';
import type { CliConfig } from '../config.js';
import {
  GENERATED_AUTH_SECRET_COMMENT,
  generateAuthSecret,
  serializeEnvValue,
} from '../env.js';
import { resolveProjectScaffoldContext } from '../project-context.js';
import {
  FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
  PLUGIN_CONFIG_IMPORT_PLACEHOLDER,
  PLUGIN_SCHEMA_IMPORT_PLACEHOLDER,
  PROJECT_CRPC_IMPORT_PLACEHOLDER,
  PROJECT_GET_ENV_IMPORT_PLACEHOLDER,
  PROJECT_SHARED_API_IMPORT_PLACEHOLDER,
} from '../scaffold-placeholders.js';
import type {
  PluginApplyScope,
  PluginDescriptor,
  PluginEnvReminder,
  PluginInstallPlan,
  PluginInstallPlanFile,
  PluginInstallPlanOperation,
  PluginLiveBootstrapTarget,
  PluginLockfile,
  PromptAdapter,
  ResolvedScaffoldRoots,
  ScaffoldTemplate,
  SupportedPlugin,
} from '../types.js';
import { inspectPluginDependencyInstall } from './dependencies.js';
import {
  normalizeLockfileScaffoldPath,
  normalizePath,
  normalizeRelativePathOrThrow,
} from './path-utils.js';
import { createPlanFile, resolveRelativeImportPath } from './plan-helpers.js';
import {
  assertSchemaFileExists,
  getPluginLockfilePath,
  getSchemaFilePath,
  renderPluginLockfileContent,
} from './state.js';
import type { PluginEnvField, PluginResolvedScaffoldFile } from './types.js';

const DEFINE_SCHEMA_CALL_RE = /defineSchema\s*\(([\s\S]*?)\)/m;
const DEFAULT_ENV_HELPER_BASENAME = 'get-env.ts';
export const LOCAL_CONVEX_ENV_TEMPLATE_ID = '__kitcn-local-env__';
export const KITCN_CONFIG_TEMPLATE_ID = '__kitcn-config__';
export const KITCN_ENV_HELPER_TEMPLATE_ID = '__kitcn-env__';
const BASE_ENV_FIELDS: readonly PluginEnvField[] = [
  {
    bootstrap: {
      kind: 'value',
      value: 'development',
    },
    key: 'DEPLOY_ENV',
    schema: "z.string().default('production')",
  },
  {
    bootstrap: {
      kind: 'value',
      value: 'http://localhost:3000',
    },
    key: 'SITE_URL',
    schema: "z.string().default('http://localhost:3000')",
  },
] as const;
const ENV_SCHEMA_RE = /(const\s+\w+\s*=\s*z\.object\(\{\n)([\s\S]*?)(\n\}\);)/m;
const WHITESPACE_RE = /\s/;

export const resolveEnvBootstrapPlanFileDetails = (templateId: string) => {
  if (templateId === KITCN_CONFIG_TEMPLATE_ID) {
    return {
      createReason: 'Create kitcn config.',
      kind: 'config' as const,
      skipReason: 'kitcn config is already bootstrapped.',
      updateReason: 'Update kitcn config.',
    };
  }

  if (templateId === LOCAL_CONVEX_ENV_TEMPLATE_ID) {
    return {
      createReason: 'Create local Convex env scaffold.',
      kind: 'env' as const,
      skipReason: 'Local Convex env scaffold is already bootstrapped.',
      updateReason: 'Update local Convex env scaffold.',
    };
  }

  return {
    createReason: 'Create typed env helper.',
    kind: 'env' as const,
    skipReason: 'Typed env helper is already bootstrapped.',
    updateReason: 'Update typed env helper.',
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const resolveDefaultEnvHelperPath = (config: CliConfig): string =>
  normalizePath(
    posix.join(
      normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib'),
      DEFAULT_ENV_HELPER_BASENAME
    )
  );

const resolveConfigWritePath = (configPathArg?: string): string =>
  resolve(process.cwd(), configPathArg ?? 'concave.json');

const resolveEnvHelperFilePath = (envPath: string): string => {
  const normalized = normalizeRelativePathOrThrow(envPath, 'paths.env');
  const resolved = resolve(process.cwd(), normalized);
  if (fs.existsSync(resolved) || resolved.endsWith('.ts')) {
    return resolved;
  }
  return `${resolved}.ts`;
};

const resolveLocalConvexEnvFilePath = (config: CliConfig) =>
  resolve(
    process.cwd(),
    normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib'),
    '..',
    '.env'
  );

const resolveBootstrapEnvFields = (envFields: readonly PluginEnvField[]) => {
  const fields = [...BASE_ENV_FIELDS];
  for (const field of envFields) {
    if (!fields.some((existing) => existing.key === field.key)) {
      fields.push(field);
    }
  }
  return fields;
};

export const renderEnvHelperContent = (
  envFields: readonly PluginEnvField[],
  existingContent?: string
): string => {
  const fields = resolveBootstrapEnvFields(envFields);

  if (!existingContent) {
    const fieldLines = fields
      .map((field) => `  ${field.key}: ${field.schema},`)
      .join('\n');
    return `import { createEnv } from 'kitcn/server';\nimport { z } from 'zod';\n\nconst envSchema = z.object({\n${fieldLines}\n});\n\nexport const getEnv = createEnv({\n  schema: envSchema,\n});\n`;
  }

  const match = existingContent.match(ENV_SCHEMA_RE);
  if (!match) {
    throw new Error(
      'Expected env helper to define `const envSchema = z.object({ ... });`.'
    );
  }

  const existingBody = match[2];
  const missingFieldLines = fields
    .filter((field) => {
      const fieldPattern = new RegExp(`(^|\\n)\\s*${field.key}\\s*:`, 'm');
      return !fieldPattern.test(existingBody);
    })
    .map((field) => `  ${field.key}: ${field.schema},`);

  if (missingFieldLines.length === 0) {
    return existingContent;
  }

  const nextBody = `${existingBody}${existingBody.endsWith('\n') ? '' : '\n'}${missingFieldLines.join('\n')}`;
  return existingContent.replace(
    ENV_SCHEMA_RE,
    `${match[1]}${nextBody}${match[3]}`
  );
};

export const renderLocalConvexEnvContent = (
  envFields: readonly PluginEnvField[],
  existingContent?: string
): string | undefined => {
  const fields = resolveBootstrapEnvFields(envFields).filter(
    (field) => field.bootstrap !== undefined
  );
  if (fields.length === 0) {
    return existingContent;
  }

  const existingVars = existingContent ? parseDotEnv(existingContent) : {};
  const needsBootstrap = fields.some((field) => {
    const existingValue = existingVars[field.key];
    return typeof existingValue !== 'string' || existingValue.length === 0;
  });

  if (!needsBootstrap) {
    return existingContent;
  }

  const lines: string[] = [];
  const writtenKeys = new Set<string>();

  for (const field of fields) {
    const existingValue = existingVars[field.key];
    if (typeof existingValue === 'string' && existingValue.length > 0) {
      lines.push(`${field.key}=${serializeEnvValue(existingValue)}`);
      writtenKeys.add(field.key);
      continue;
    }

    if (field.bootstrap?.kind === 'generated-secret') {
      lines.push(GENERATED_AUTH_SECRET_COMMENT);
      lines.push(`${field.key}=${serializeEnvValue(generateAuthSecret())}`);
      writtenKeys.add(field.key);
      continue;
    }

    if (field.bootstrap?.kind === 'value') {
      lines.push(`${field.key}=${serializeEnvValue(field.bootstrap.value)}`);
      writtenKeys.add(field.key);
    }
  }

  for (const [key, value] of Object.entries(existingVars)) {
    if (writtenKeys.has(key)) {
      continue;
    }
    lines.push(`${key}=${serializeEnvValue(value)}`);
  }

  return `${lines.join('\n')}\n`;
};

const renderConfigWithEnvPath = (
  configPath: string,
  config: CliConfig,
  envPath: string
): string => {
  const existingRaw = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : {};
  if (!isPlainObject(existingRaw)) {
    throw new Error(`Invalid config file ${configPath}: expected object.`);
  }

  const nextRoot = { ...existingRaw } as Record<string, unknown>;
  const nextMeta = isPlainObject(nextRoot.meta) ? { ...nextRoot.meta } : {};
  const nextCliConfig = isPlainObject(nextMeta.kitcn)
    ? { ...(nextMeta.kitcn as Record<string, unknown>) }
    : {};
  const nextPaths = isPlainObject(nextCliConfig.paths)
    ? { ...(nextCliConfig.paths as Record<string, unknown>) }
    : {};

  nextPaths.lib = config.paths.lib;
  nextPaths.shared = config.paths.shared;
  nextPaths.env = envPath;

  nextCliConfig.paths = nextPaths;
  if (config.backend !== 'convex' || 'backend' in nextCliConfig) {
    nextCliConfig.backend = config.backend;
  }
  nextMeta.kitcn = nextCliConfig;
  nextRoot.meta = nextMeta;

  return `${JSON.stringify(nextRoot, null, 2)}\n`;
};

export const buildEnvBootstrapFiles = (
  config: CliConfig,
  configPathArg: string | undefined,
  envFields: readonly PluginEnvField[]
): {
  config: CliConfig;
  files: PluginResolvedScaffoldFile[];
} => {
  const envPath = config.paths.env ?? resolveDefaultEnvHelperPath(config);
  const nextConfig = config.paths.env
    ? config
    : {
        ...config,
        paths: {
          ...config.paths,
          env: envPath,
        },
      };

  const envFilePath = resolveEnvHelperFilePath(envPath);
  const envFileContent = renderEnvHelperContent(
    envFields,
    fs.existsSync(envFilePath)
      ? fs.readFileSync(envFilePath, 'utf8')
      : undefined
  );
  const localConvexEnvFilePath = resolveLocalConvexEnvFilePath(nextConfig);
  const localConvexEnvContent = renderLocalConvexEnvContent(
    envFields,
    fs.existsSync(localConvexEnvFilePath)
      ? fs.readFileSync(localConvexEnvFilePath, 'utf8')
      : undefined
  );

  const files: PluginResolvedScaffoldFile[] = [
    {
      templateId: KITCN_ENV_HELPER_TEMPLATE_ID,
      filePath: envFilePath,
      lockfilePath: normalizePath(relative(process.cwd(), envFilePath)),
      content: envFileContent,
    },
  ];

  if (localConvexEnvContent) {
    files.push({
      templateId: LOCAL_CONVEX_ENV_TEMPLATE_ID,
      filePath: localConvexEnvFilePath,
      lockfilePath: normalizePath(
        relative(process.cwd(), localConvexEnvFilePath)
      ),
      content: localConvexEnvContent,
    });
  }

  if (!config.paths.env) {
    const configFilePath = resolveConfigWritePath(configPathArg);
    files.unshift({
      templateId: KITCN_CONFIG_TEMPLATE_ID,
      filePath: configFilePath,
      lockfilePath: normalizePath(relative(process.cwd(), configFilePath)),
      content: renderConfigWithEnvPath(configFilePath, nextConfig, envPath),
    });
  }

  return {
    config: nextConfig,
    files,
  };
};

const resolvePluginEnvReminders = (
  functionsDir: string,
  envFields: readonly PluginEnvField[]
): PluginEnvReminder[] => {
  const envPath = normalizePath(
    relative(process.cwd(), join(functionsDir, '.env'))
  );
  return envFields.flatMap((field) =>
    field.reminder
      ? [
          {
            key: field.key,
            path: envPath,
            message: field.reminder.message,
          } satisfies PluginEnvReminder,
        ]
      : []
  );
};

export const resolvePluginScaffoldRoots = (
  functionsDir: string,
  descriptor: PluginDescriptor,
  config: CliConfig,
  preset = descriptor.defaultPreset
): ResolvedScaffoldRoots => {
  const libDir = normalizeRelativePathOrThrow(config.paths.lib, 'paths.lib');
  const libRoot = resolve(process.cwd(), libDir);
  const projectContext = resolveProjectScaffoldContext({
    allowMissing: true,
    allowUnsupported: true,
  });
  const defaultRoots: ResolvedScaffoldRoots = {
    functionsRootDir: join(functionsDir, 'plugins'),
    libRootDir: join(libRoot, 'plugins', descriptor.key),
    appRootDir:
      projectContext?.mode === 'next-app'
        ? resolve(process.cwd(), projectContext.appDir)
        : null,
    clientLibRootDir: projectContext
      ? resolve(process.cwd(), projectContext.libDir)
      : null,
    crpcFilePath: join(libRoot, 'crpc.ts'),
    sharedApiFilePath: resolve(process.cwd(), config.paths.shared, 'api.ts'),
    envFilePath: resolveEnvHelperFilePath(
      config.paths.env ?? resolveDefaultEnvHelperPath(config)
    ),
    projectContext,
  };

  return {
    ...defaultRoots,
    ...descriptor.integration?.resolveScaffoldRoots?.({
      config,
      functionsDir,
      preset,
      roots: defaultRoots,
    }),
  };
};

const resolveFunctionsDirImportPrefix = (
  filePath: string,
  functionsDir: string
): string => {
  const relativePath = normalizePath(relative(dirname(filePath), functionsDir));
  if (relativePath.length === 0 || relativePath === '.') {
    return '.';
  }
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
};

const resolvePluginConfigImportPrefix = (
  filePath: string,
  libPluginRootDir: string
): string =>
  resolveRelativeImportPath(filePath, join(libPluginRootDir, 'plugin.ts'));

const resolvePluginSchemaImportPrefix = (
  filePath: string,
  libPluginRootDir: string
): string =>
  resolveRelativeImportPath(filePath, join(libPluginRootDir, 'schema.ts'));

const resolveProjectCrpcImportPrefix = (
  filePath: string,
  projectCrpcFilePath: string
): string => resolveRelativeImportPath(filePath, projectCrpcFilePath);

const resolveProjectSharedApiImportPrefix = (
  filePath: string,
  projectSharedApiFilePath: string
): string => resolveRelativeImportPath(filePath, projectSharedApiFilePath);

const resolveProjectGetEnvImportPrefix = (
  filePath: string,
  getEnvFilePath: string
): string => resolveRelativeImportPath(filePath, getEnvFilePath);

const resolvePluginScaffoldFiles = (
  templates: readonly ScaffoldTemplate[],
  roots: ResolvedScaffoldRoots,
  functionsDir: string,
  existingTemplatePathMap: Record<string, string> | undefined,
  descriptor: PluginDescriptor,
  preset: string
): PluginResolvedScaffoldFile[] =>
  templates.map((template) => {
    let rootDir: string;
    if (template.target === 'lib') {
      rootDir = roots.libRootDir;
    } else if (template.target === 'functions') {
      rootDir = roots.functionsRootDir;
    } else if (template.target === 'app') {
      if (!roots.appRootDir) {
        throw new Error(
          `${descriptor.label} scaffolding requires a supported app baseline. Run \`kitcn init --yes\` in a supported app, or bootstrap one with \`kitcn init -t <next|vite>\` first.`
        );
      }
      rootDir = roots.appRootDir;
    } else {
      if (!roots.clientLibRootDir) {
        throw new Error(
          `${descriptor.label} scaffolding requires a supported app baseline. Run \`kitcn init --yes\` in a supported app, or bootstrap one with \`kitcn init -t <next|vite>\` first.`
        );
      }
      rootDir = roots.clientLibRootDir;
    }
    const mappedLockfilePath = existingTemplatePathMap?.[template.id];
    const resolvedLockfilePath =
      normalizeLockfileScaffoldPath(mappedLockfilePath);
    const lockfilePath =
      resolvedLockfilePath ??
      normalizePath(relative(process.cwd(), join(rootDir, template.path)));
    const filePath = resolve(process.cwd(), lockfilePath);
    const getEnvImportPath = resolveProjectGetEnvImportPrefix(
      filePath,
      roots.envFilePath
    );
    const content = template.content
      .replaceAll(
        FUNCTIONS_DIR_IMPORT_PLACEHOLDER,
        resolveFunctionsDirImportPrefix(filePath, functionsDir)
      )
      .replaceAll(
        PROJECT_CRPC_IMPORT_PLACEHOLDER,
        resolveProjectCrpcImportPrefix(filePath, roots.crpcFilePath)
      )
      .replaceAll(
        PROJECT_SHARED_API_IMPORT_PLACEHOLDER,
        resolveProjectSharedApiImportPrefix(filePath, roots.sharedApiFilePath)
      )
      .replaceAll(
        PROJECT_GET_ENV_IMPORT_PLACEHOLDER,
        `import { getEnv } from '${getEnvImportPath}';`
      )
      .replaceAll(
        PLUGIN_CONFIG_IMPORT_PLACEHOLDER,
        resolvePluginConfigImportPrefix(filePath, roots.libRootDir)
      )
      .replaceAll(
        PLUGIN_SCHEMA_IMPORT_PLACEHOLDER,
        resolvePluginSchemaImportPrefix(filePath, roots.libRootDir)
      );

    const allowProcessEnv = descriptor.key === 'auth' && preset === 'convex';
    if (
      !allowProcessEnv &&
      (template.target === 'functions' || template.target === 'lib') &&
      content.includes('process.env')
    ) {
      throw new Error(
        `Scaffold template "${descriptor.key}/${template.id}" contains process.env. Use getEnv() instead.`
      );
    }

    return {
      templateId: template.id,
      filePath,
      lockfilePath,
      content,
    };
  });

const getPlannedFileContent = (
  files: readonly PluginInstallPlanFile[] | undefined,
  absolutePath: string
): string | undefined => {
  const normalizedPath = normalizePath(relative(process.cwd(), absolutePath));
  return files?.find((file) => file.path === normalizedPath)?.content;
};

const skipWhitespace = (source: string, start: number) => {
  let index = start;
  while (index < source.length && WHITESPACE_RE.test(source[index] ?? '')) {
    index += 1;
  }
  return index;
};

const findBalancedParenEnd = (source: string, openParenIndex: number) => {
  let depth = 0;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char !== ')') {
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return index;
    }
  }

  return -1;
};

const findSchemaExtensionInsertIndex = (source: string) => {
  const defineSchemaIndex = source.indexOf('defineSchema(');
  if (defineSchemaIndex < 0) {
    return { closeParenIndex: -1, hasExtend: false, insertIndex: -1 };
  }

  const defineSchemaOpenParenIndex = source.indexOf('(', defineSchemaIndex);
  if (defineSchemaOpenParenIndex < 0) {
    return { closeParenIndex: -1, hasExtend: false, insertIndex: -1 };
  }

  const defineSchemaCloseParenIndex = findBalancedParenEnd(
    source,
    defineSchemaOpenParenIndex
  );
  if (defineSchemaCloseParenIndex < 0) {
    return { closeParenIndex: -1, hasExtend: false, insertIndex: -1 };
  }

  const cursor = defineSchemaCloseParenIndex + 1;

  while (cursor < source.length) {
    const nextSegmentIndex = skipWhitespace(source, cursor);

    if (
      source.startsWith('.relations(', nextSegmentIndex) ||
      source.startsWith('.triggers(', nextSegmentIndex)
    ) {
      return {
        closeParenIndex: -1,
        hasExtend: false,
        insertIndex: nextSegmentIndex,
      };
    }

    if (!source.startsWith('.extend(', nextSegmentIndex)) {
      return {
        closeParenIndex: -1,
        hasExtend: false,
        insertIndex: nextSegmentIndex,
      };
    }

    const extendOpenParenIndex = source.indexOf('(', nextSegmentIndex);
    if (extendOpenParenIndex < 0) {
      return { closeParenIndex: -1, hasExtend: false, insertIndex: -1 };
    }

    const extendCloseParenIndex = findBalancedParenEnd(
      source,
      extendOpenParenIndex
    );
    if (extendCloseParenIndex < 0) {
      return { closeParenIndex: -1, hasExtend: false, insertIndex: -1 };
    }

    return {
      closeParenIndex: extendCloseParenIndex,
      hasExtend: true,
      insertIndex: extendCloseParenIndex,
    };
  }

  return {
    closeParenIndex: -1,
    hasExtend: false,
    insertIndex: cursor,
  };
};

export const buildSchemaRegistrationPlanFile = (
  functionsDir: string,
  descriptor: PluginDescriptor,
  roots: ResolvedScaffoldRoots,
  bootstrapFiles?: readonly PluginInstallPlanFile[]
): PluginInstallPlanFile => {
  const schemaPath = getSchemaFilePath(functionsDir);
  const bootstrappedSchemaSource = getPlannedFileContent(
    bootstrapFiles,
    schemaPath
  );
  if (!fs.existsSync(schemaPath) && !bootstrappedSchemaSource) {
    assertSchemaFileExists(functionsDir);
  }
  const schemaRegistration = descriptor.schemaRegistration;
  const pluginFactory = schemaRegistration.importName;
  const registrationRoot =
    schemaRegistration.target === 'lib'
      ? roots.libRootDir
      : roots.functionsRootDir;
  const pluginImportPath = resolveRelativeImportPath(
    schemaPath,
    join(registrationRoot, schemaRegistration.path)
  );

  let source = bootstrappedSchemaSource ?? fs.readFileSync(schemaPath, 'utf8');
  if (!source.includes(`${pluginFactory}()`)) {
    const importRegex = new RegExp(
      `import\\s+\\{[^}]*\\b${pluginFactory}\\b[^}]*\\}\\s+from\\s+['"]${pluginImportPath}['"];?`
    );
    if (!importRegex.test(source)) {
      source = `import { ${pluginFactory} } from '${pluginImportPath}';\n${source}`;
    }

    const extensionTarget = findSchemaExtensionInsertIndex(source);
    if (extensionTarget.hasExtend && extensionTarget.closeParenIndex >= 0) {
      source = `${source.slice(0, extensionTarget.closeParenIndex)}, ${pluginFactory}()${source.slice(extensionTarget.closeParenIndex)}`;
    } else if (extensionTarget.insertIndex >= 0) {
      source = `${source.slice(0, extensionTarget.insertIndex)}.extend(${pluginFactory}())${source.slice(extensionTarget.insertIndex)}`;
    } else if (DEFINE_SCHEMA_CALL_RE.test(source)) {
      source = source.replace(
        DEFINE_SCHEMA_CALL_RE,
        (match: string) => `${match}.extend(${pluginFactory}())`
      );
    }
  }

  return createPlanFile({
    kind: 'schema',
    filePath: schemaPath,
    content: source,
    createReason: 'Create schema.ts with plugin registration.',
    updateReason: `Register ${descriptor.key} in schema.ts.`,
    skipReason: `${descriptor.key} is already registered in schema.ts.`,
  });
};

const createLockfilePlanFile = (
  functionsDir: string,
  lockfile: PluginLockfile
): PluginInstallPlanFile =>
  createPlanFile({
    kind: 'lockfile',
    filePath: getPluginLockfilePath(functionsDir),
    content: renderPluginLockfileContent(lockfile),
    createReason: 'Create plugin lockfile.',
    updateReason: 'Update plugin lockfile.',
    skipReason: 'Plugin lockfile is already up to date.',
  });

export const buildPluginInstallPlan = async (params: {
  applyScope?: PluginApplyScope;
  descriptor: PluginDescriptor;
  selectedPlugin: SupportedPlugin;
  preset: string;
  selectionSource: PluginInstallPlan['selectionSource'];
  presetTemplateIds: string[];
  selectedTemplateIds: string[];
  selectedTemplates: readonly ScaffoldTemplate[];
  config: CliConfig;
  configPathArg?: string;
  functionsDir: string;
  lockfile: PluginLockfile;
  existingTemplatePathMap: Record<string, string>;
  noCodegen: boolean;
  overwrite: boolean;
  preview: boolean;
  promptAdapter: PromptAdapter;
  yes: boolean;
  includeEnvBootstrap?: boolean;
  bootstrapFiles?: readonly PluginInstallPlanFile[];
  bootstrapOperations?: readonly PluginInstallPlanOperation[];
  liveBootstrapTarget?: PluginLiveBootstrapTarget;
}): Promise<PluginInstallPlan> => {
  const rawConvexAuthPreset =
    params.selectedPlugin === 'auth' && params.preset === 'convex';
  const hasBootstrappedSchema = (params.bootstrapFiles ?? []).some(
    (file) =>
      file.path ===
      normalizePath(
        relative(process.cwd(), getSchemaFilePath(params.functionsDir))
      )
  );
  if (!hasBootstrappedSchema) {
    assertSchemaFileExists(params.functionsDir);
  }
  const envBootstrap =
    params.includeEnvBootstrap === false
      ? {
          config: params.config,
          files: [],
        }
      : buildEnvBootstrapFiles(
          params.config,
          params.configPathArg,
          params.descriptor.envFields ?? []
        );
  const effectiveConfig = envBootstrap.config;
  const roots = resolvePluginScaffoldRoots(
    params.functionsDir,
    params.descriptor,
    effectiveConfig,
    params.preset
  );
  const effectiveTemplates =
    params.descriptor.integration?.resolveTemplates?.({
      config: effectiveConfig,
      functionsDir: params.functionsDir,
      preset: params.preset,
      roots,
      templates: params.selectedTemplates,
    }) ?? params.selectedTemplates;
  const scaffoldFiles = resolvePluginScaffoldFiles(
    effectiveTemplates,
    roots,
    params.functionsDir,
    params.existingTemplatePathMap,
    params.descriptor,
    params.preset
  );
  const reconciledScaffoldFiles =
    (await params.descriptor.integration?.reconcileScaffoldFiles?.({
      config: effectiveConfig,
      functionsDir: params.functionsDir,
      preset: params.preset,
      roots,
      scaffoldFiles,
    })) ?? scaffoldFiles;
  const dependency = await inspectPluginDependencyInstall({
    descriptor: params.descriptor,
  });
  const dependencyHints = [
    ...new Set(
      effectiveTemplates.flatMap((template) => template.dependencyHints)
    ),
  ];
  const dependencyHintCommand =
    dependencyHints.length > 0
      ? `bun add ${dependencyHints.join(' ')}`
      : undefined;
  const envReminders = rawConvexAuthPreset
    ? []
    : resolvePluginEnvReminders(
        params.functionsDir,
        params.descriptor.envFields ?? []
      );
  const nextSteps = dependencyHintCommand
    ? [`Install scaffold dependencies: ${dependencyHintCommand}`]
    : [];
  const codegenCommand = rawConvexAuthPreset
    ? 'kitcn codegen --scope auth'
    : 'kitcn codegen';
  const liveBootstrap =
    params.liveBootstrapTarget &&
    params.descriptor.liveBootstrap?.mode === params.liveBootstrapTarget &&
    (params.descriptor.liveBootstrap.presets === undefined ||
      params.descriptor.liveBootstrap.presets.includes(params.preset))
      ? params.descriptor.liveBootstrap
      : null;

  const pluginScaffoldPaths = {
    ...params.existingTemplatePathMap,
    ...Object.fromEntries(
      reconciledScaffoldFiles.map((file) => [
        file.templateId,
        file.lockfilePath,
      ])
    ),
  };
  const nextPluginEntry =
    Object.keys(pluginScaffoldPaths).length > 0
      ? {
          package: params.descriptor.packageName,
          files: pluginScaffoldPaths,
        }
      : {
          package: params.descriptor.packageName,
        };
  const integrationFiles =
    (await params.descriptor.integration?.buildPlanFiles?.({
      config: effectiveConfig,
      functionsDir: params.functionsDir,
      applyScope: params.applyScope,
      lockfile: params.lockfile,
      overwrite: params.overwrite,
      preset: params.preset,
      preview: params.preview,
      promptAdapter: params.promptAdapter,
      roots,
      yes: params.yes,
    })) ?? [];
  const schemaRegistrationFile =
    (await params.descriptor.integration?.buildSchemaRegistrationPlanFile?.({
      config: effectiveConfig,
      functionsDir: params.functionsDir,
      applyScope: params.applyScope,
      lockfile: params.lockfile,
      overwrite: params.overwrite,
      preset: params.preset,
      preview: params.preview,
      promptAdapter: params.promptAdapter,
      roots,
      yes: params.yes,
    })) ??
    buildSchemaRegistrationPlanFile(
      params.functionsDir,
      params.descriptor,
      roots,
      params.bootstrapFiles
    );
  const nextLockfile: PluginLockfile = {
    plugins: {
      ...params.lockfile.plugins,
      [params.selectedPlugin]: {
        ...nextPluginEntry,
        ...(schemaRegistrationFile.schemaOwnershipLock
          ? { schema: schemaRegistrationFile.schemaOwnershipLock }
          : {}),
      },
    },
  };

  const fileMap = new Map<string, PluginInstallPlanFile>();
  for (const file of [
    ...(params.bootstrapFiles ?? []),
    ...envBootstrap.files.map((file) => {
      const details = resolveEnvBootstrapPlanFileDetails(file.templateId);
      return createPlanFile({
        kind: details.kind,
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        managedBaselineContent:
          file.templateId === KITCN_ENV_HELPER_TEMPLATE_ID
            ? renderEnvHelperContent([], undefined)
            : file.templateId === LOCAL_CONVEX_ENV_TEMPLATE_ID
              ? renderLocalConvexEnvContent([], undefined)
              : undefined,
        createReason: details.createReason,
        updateReason: details.updateReason,
        skipReason: details.skipReason,
      });
    }),
    ...integrationFiles,
    ...reconciledScaffoldFiles.map((file) =>
      createPlanFile({
        kind: 'scaffold',
        templateId: file.templateId,
        filePath: file.filePath,
        content: file.content,
        createReason: 'Create scaffold file.',
        updateReason: 'Update scaffold file.',
        skipReason: 'Scaffold file is already up to date.',
      })
    ),
    schemaRegistrationFile,
    createLockfilePlanFile(params.functionsDir, nextLockfile),
  ]) {
    fileMap.set(file.path, file);
  }
  const files: PluginInstallPlanFile[] = [...fileMap.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  const operations: PluginInstallPlanOperation[] = [
    ...(params.bootstrapOperations ?? []),
    {
      kind: 'dependency_install',
      status: dependency.skipped ? 'skipped' : 'pending',
      reason:
        dependency.reason === 'already_present'
          ? 'Dependency already installed.'
          : dependency.reason === 'missing_package_json'
            ? 'No package.json found for dependency installation.'
            : `Install ${dependency.packageSpec ?? dependency.packageName}.`,
      path: dependency.packageJsonPath
        ? normalizePath(relative(process.cwd(), dependency.packageJsonPath))
        : undefined,
      packageName: dependency.packageSpec ?? dependency.packageName,
      command:
        (dependency.packageSpec ?? dependency.packageName) &&
        dependency.packageJsonPath &&
        !dependency.skipped
          ? `bun add ${dependency.packageSpec ?? dependency.packageName}`
          : undefined,
    },
    {
      kind: 'codegen',
      status: params.noCodegen ? 'skipped' : 'pending',
      reason: params.noCodegen
        ? 'Codegen disabled by flag.'
        : 'Run codegen after scaffold changes.',
      command: params.noCodegen ? undefined : codegenCommand,
    },
    ...(liveBootstrap
      ? [
          {
            kind: 'live_bootstrap' as const,
            status: params.noCodegen
              ? ('skipped' as const)
              : ('pending' as const),
            reason: params.noCodegen
              ? 'Local bootstrap skipped because codegen is disabled by flag.'
              : 'Run local bootstrap after scaffold changes.',
            command: params.noCodegen ? undefined : 'kitcn dev --bootstrap',
          },
        ]
      : []),
    ...effectiveConfig.hooks.postAdd.map((script) => ({
      kind: 'post_add_hook' as const,
      status: 'pending' as const,
      reason: 'Run configured post-add hook.',
      command: script,
    })),
    ...envReminders.map((reminder) => ({
      kind: 'env_reminder' as const,
      status: 'pending' as const,
      reason: 'Set required plugin environment variable.',
      path: reminder.path,
      key: reminder.key,
      message: reminder.message,
    })),
  ];

  return {
    plugin: params.selectedPlugin,
    preset: params.preset,
    applyScope: params.applyScope,
    selectionSource: params.selectionSource,
    presetTemplateIds: params.presetTemplateIds,
    selectedTemplateIds: params.selectedTemplateIds,
    files,
    operations,
    dependencyHints,
    envReminders,
    docs: params.descriptor.docs,
    nextSteps,
    dependency,
  };
};

export const serializePluginInstallPlan = (plan: PluginInstallPlan) => ({
  ...plan,
  dependency: {
    packageName: plan.dependency.packageName,
    packageSpec: plan.dependency.packageSpec,
    packageJsonPath: plan.dependency.packageJsonPath
      ? normalizePath(relative(process.cwd(), plan.dependency.packageJsonPath))
      : undefined,
    installed: plan.dependency.installed,
    skipped: plan.dependency.skipped,
    reason: plan.dependency.reason,
  },
});
