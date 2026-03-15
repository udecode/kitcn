import fs from 'node:fs';
import path from 'node:path';

const SOURCE_FILE_EXTENSION_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DTS_EXTENSION_RE = /\.d\.ts$/;
const RESERVED_IDENTIFIERS = new Set([
  'fullApi',
  'api',
  'internal',
  'components',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'let',
  'static',
  'yield',
  'await',
  'enum',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
]);

function listFilesRecursive(cwd: string, relDir = ''): string[] {
  const absDir = path.join(cwd, relDir);
  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  const files: string[] = [];
  for (const entry of entries) {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(cwd, relPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files;
}

function ensureRelativeImportPath(value: string): string {
  if (value.startsWith('.') || value.startsWith('/')) {
    return value;
  }
  return `./${value}`;
}

function normalizeImportPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function getGeneratedRuntimeApiTypesOutputFile(functionsDir: string): string {
  return path.join(functionsDir, '_generated', 'api.d.ts');
}

function getSourceModuleName(file: string): string {
  return normalizeImportPath(file).replace(SOURCE_FILE_EXTENSION_RE, '');
}

function isConcaveApiTypeModule(file: string): boolean {
  if (!SOURCE_FILE_EXTENSION_RE.test(file) || DTS_EXTENSION_RE.test(file)) {
    return false;
  }

  const moduleName = getSourceModuleName(file);
  if (
    moduleName === 'schema' ||
    moduleName === 'http' ||
    moduleName === 'crons' ||
    moduleName === 'auth' ||
    moduleName === 'convex.config' ||
    moduleName === 'auth.config'
  ) {
    return false;
  }

  if (
    moduleName.startsWith('_generated/') ||
    moduleName.includes('/_generated/') ||
    moduleName.startsWith('_') ||
    moduleName.includes('/_')
  ) {
    return false;
  }

  if (moduleName.startsWith('generated/') && moduleName !== 'generated/auth') {
    return false;
  }

  return true;
}

function getConcaveApiTypeModules(functionsDir: string): string[] {
  return listFilesRecursive(functionsDir)
    .filter((file) => isConcaveApiTypeModule(file))
    .map((file) => getSourceModuleName(file))
    .sort((a, b) => a.localeCompare(b));
}

function getConcaveApiTypeImportPath(
  outputFile: string,
  functionsDir: string,
  moduleName: string
): string {
  const moduleFile = path.join(functionsDir, `${moduleName}.js`);
  const relativePath = path.relative(path.dirname(outputFile), moduleFile);
  return ensureRelativeImportPath(normalizeImportPath(relativePath));
}

function getConcaveApiTypeSafeName(moduleName: string): string {
  let safeName = moduleName.replace(/[/-]/g, '_');
  if (RESERVED_IDENTIFIERS.has(safeName)) {
    safeName = `${safeName}_`;
  }
  return safeName;
}

export function writeGeneratedConcaveApiTypes(functionsDir: string): void {
  const outputFile = getGeneratedRuntimeApiTypesOutputFile(functionsDir);
  const moduleNames = getConcaveApiTypeModules(functionsDir);
  const imports = moduleNames
    .map((moduleName) => {
      const safeName = getConcaveApiTypeSafeName(moduleName);
      const importPath = getConcaveApiTypeImportPath(
        outputFile,
        functionsDir,
        moduleName
      );
      return `import type * as ${safeName} from ${JSON.stringify(importPath)};`;
    })
    .join('\n');
  const moduleMap = moduleNames
    .map((moduleName) => {
      const safeName = getConcaveApiTypeSafeName(moduleName);
      return `  ${JSON.stringify(moduleName)}: typeof ${safeName},`;
    })
    .join('\n');
  const content = `/* eslint-disable */
/**
 * Generated \`api\` utility with precise source types.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`better-convex codegen\`.
 * @module
 */

${imports ? `${imports}\n` : ''}
import type {
  AnyComponents,
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
declare const fullApi: ApiFromModules<{
${moduleMap}
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: AnyComponents;
`;

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, content);
}
