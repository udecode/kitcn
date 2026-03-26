import fs from 'node:fs';
import { join } from 'node:path';
import { createJiti } from 'jiti';
import { OrmSchemaExtensions } from '../../orm/symbols.js';
import type {
  PluginLockfile,
  PluginLockfileEntry,
  PluginRootSchemaOwnership,
  SupportedPlugin,
} from '../types.js';
import { isSupportedPluginKey } from './index.js';
import { normalizeLockfileScaffoldPath } from './path-utils.js';

export const getPluginLockfilePath = (functionsDir: string): string =>
  join(functionsDir, 'plugins.lock.json');

export const getSchemaFilePath = (functionsDir: string): string =>
  join(functionsDir, 'schema.ts');

export const assertSchemaFileExists = (functionsDir: string): string => {
  const schemaPath = getSchemaFilePath(functionsDir);
  if (!fs.existsSync(schemaPath)) {
    throw new Error(
      `Missing schema file at ${schemaPath.replace(`${process.cwd()}/`, '')}. Create schema.ts before installing plugins.`
    );
  }
  return schemaPath;
};

export const readPluginLockfile = (lockfilePath: string): PluginLockfile => {
  if (!fs.existsSync(lockfilePath)) {
    return {
      plugins: {},
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        plugins: {},
      };
    }
    const rawPlugins = (parsed as { plugins?: unknown }).plugins;
    if (
      !rawPlugins ||
      typeof rawPlugins !== 'object' ||
      Array.isArray(rawPlugins)
    ) {
      return {
        plugins: {},
      };
    }
    const plugins: PluginLockfile['plugins'] = {};
    for (const [pluginKey, pluginEntry] of Object.entries(
      rawPlugins as Record<string, unknown>
    ).sort(([a], [b]) => a.localeCompare(b))) {
      if (
        !pluginEntry ||
        typeof pluginEntry !== 'object' ||
        Array.isArray(pluginEntry)
      ) {
        continue;
      }
      const packageName = (pluginEntry as { package?: unknown }).package;
      if (typeof packageName !== 'string' || packageName.length === 0) {
        continue;
      }
      const rawFiles = (pluginEntry as { files?: unknown }).files;
      const normalizedFiles: Record<string, string> = {};
      if (
        rawFiles &&
        typeof rawFiles === 'object' &&
        !Array.isArray(rawFiles)
      ) {
        for (const [templateId, templatePath] of Object.entries(
          rawFiles as Record<string, unknown>
        ).sort(([a], [b]) => a.localeCompare(b))) {
          const normalizedPath = normalizeLockfileScaffoldPath(templatePath);
          if (normalizedPath) {
            normalizedFiles[templateId] = normalizedPath;
          }
        }
      }
      const schemaOwnership = readPluginRootSchemaOwnership(
        (pluginEntry as { schema?: unknown }).schema
      );
      const nextEntry: PluginLockfileEntry = {
        package: packageName,
      };
      if (Object.keys(normalizedFiles).length > 0) {
        nextEntry.files = normalizedFiles;
      }
      if (schemaOwnership) {
        nextEntry.schema = schemaOwnership;
      }
      plugins[pluginKey] = nextEntry;
    }
    return {
      plugins,
    };
  } catch {
    return {
      plugins: {},
    };
  }
};

export const renderPluginLockfileContent = (
  lockfile: PluginLockfile
): string => {
  const normalizedPlugins: PluginLockfile['plugins'] = {};
  for (const plugin of Object.keys(lockfile.plugins).sort((a, b) =>
    a.localeCompare(b)
  )) {
    const pluginEntry = lockfile.plugins[plugin];
    if (
      !pluginEntry ||
      typeof pluginEntry.package !== 'string' ||
      pluginEntry.package.length === 0
    ) {
      continue;
    }
    const normalizedFiles: Record<string, string> = {};
    const rawFiles = pluginEntry.files;
    if (rawFiles && typeof rawFiles === 'object' && !Array.isArray(rawFiles)) {
      for (const [templateId, templatePath] of Object.entries(rawFiles).sort(
        ([a], [b]) => a.localeCompare(b)
      )) {
        const normalizedPath = normalizeLockfileScaffoldPath(templatePath);
        if (normalizedPath) {
          normalizedFiles[templateId] = normalizedPath;
        }
      }
    }
    const nextEntry: PluginLockfileEntry = {
      package: pluginEntry.package,
    };
    if (Object.keys(normalizedFiles).length > 0) {
      nextEntry.files = normalizedFiles;
    }
    if (pluginEntry.schema) {
      nextEntry.schema = normalizePluginRootSchemaOwnership(pluginEntry.schema);
    }
    normalizedPlugins[plugin] = nextEntry;
  }
  return `${JSON.stringify(
    {
      plugins: normalizedPlugins,
    },
    null,
    2
  )}\n`;
};

const normalizePluginRootSchemaOwnership = (
  schema: PluginRootSchemaOwnership
): PluginRootSchemaOwnership => {
  const tables = Object.fromEntries(
    Object.entries(schema.tables)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tableName, entry]) => {
        if (entry.owner === 'managed') {
          return [
            tableName,
            {
              checksum: entry.checksum,
              owner: 'managed' as const,
            },
          ];
        }

        return [
          tableName,
          {
            owner: 'local' as const,
          },
        ];
      })
  );

  return {
    path: normalizeLockfileScaffoldPath(schema.path) ?? schema.path,
    tables,
  };
};

const readPluginRootSchemaOwnership = (
  value: unknown
): PluginRootSchemaOwnership | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const pathValue = normalizeLockfileScaffoldPath(
    (value as { path?: unknown }).path
  );
  const rawTables = (value as { tables?: unknown }).tables;
  if (
    !pathValue ||
    !rawTables ||
    typeof rawTables !== 'object' ||
    Array.isArray(rawTables)
  ) {
    return undefined;
  }

  const tables: PluginRootSchemaOwnership['tables'] = {};
  for (const [tableName, tableEntry] of Object.entries(
    rawTables as Record<string, unknown>
  ).sort(([a], [b]) => a.localeCompare(b))) {
    if (
      !tableEntry ||
      typeof tableEntry !== 'object' ||
      Array.isArray(tableEntry)
    ) {
      continue;
    }

    const owner = (tableEntry as { owner?: unknown }).owner;
    if (owner === 'local') {
      tables[tableName] = { owner: 'local' };
      continue;
    }
    if (owner !== 'managed') {
      continue;
    }

    const checksum = (tableEntry as { checksum?: unknown }).checksum;
    if (typeof checksum !== 'string' || checksum.length === 0) {
      continue;
    }
    tables[tableName] = { checksum, owner: 'managed' };
  }

  if (Object.keys(tables).length === 0) {
    return undefined;
  }

  return {
    path: pathValue,
    tables,
  };
};

export const resolveSchemaInstalledPlugins = async (
  functionsDir: string
): Promise<SupportedPlugin[]> => {
  const schemaPath = getSchemaFilePath(functionsDir);
  if (!fs.existsSync(schemaPath)) {
    return [];
  }

  const jiti = createJiti(process.cwd(), {
    interopDefault: true,
    moduleCache: false,
  });
  try {
    const schemaModule = await jiti.import(schemaPath);
    const schemaValue =
      schemaModule && typeof schemaModule === 'object'
        ? ((schemaModule as Record<string, unknown>).default ?? schemaModule)
        : null;
    if (!schemaValue || typeof schemaValue !== 'object') {
      return [];
    }
    const plugins = (schemaValue as Record<symbol, unknown>)[
      OrmSchemaExtensions
    ];
    if (!Array.isArray(plugins)) {
      return [];
    }
    return plugins
      .map((plugin) =>
        plugin && typeof plugin === 'object' && 'key' in plugin
          ? String((plugin as { key: unknown }).key)
          : ''
      )
      .filter((key): key is SupportedPlugin => isSupportedPluginKey(key))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
};

export const collectInstalledPluginKeys = (
  lockfile: PluginLockfile,
  schemaPlugins: readonly SupportedPlugin[]
): SupportedPlugin[] =>
  [
    ...new Set([
      ...(Object.keys(lockfile.plugins).filter((key) =>
        isSupportedPluginKey(key)
      ) as SupportedPlugin[]),
      ...schemaPlugins,
    ]),
  ].sort((a, b) => a.localeCompare(b));
