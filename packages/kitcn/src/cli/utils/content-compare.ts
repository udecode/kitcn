import { parse } from '@babel/parser';

const AST_COMPARABLE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]);
const JSON_EXTENSIONS = new Set(['.json']);
const METADATA_KEYS = new Set([
  'comments',
  'start',
  'end',
  'loc',
  'range',
  'extra',
  'errors',
  'tokens',
  'leadingComments',
  'trailingComments',
  'innerComments',
]);

const normalizeLineEndings = (value: string): string =>
  value.replace(/\r\n/g, '\n').trim();

const getExtension = (filePath: string): string => {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot >= 0 ? filePath.slice(lastDot).toLowerCase() : '';
};

const normalizeAst = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAst(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !METADATA_KEYS.has(key))
      .map(([key, child]) => [key, normalizeAst(child)])
  );
};

const parseComparableAst = (content: string, filePath: string): unknown => {
  const extension = getExtension(filePath);
  const isTypeScript = ['.ts', '.tsx', '.mts', '.cts'].includes(extension);
  const isJsx = ['.jsx', '.tsx'].includes(extension);

  return normalizeAst(
    parse(content, {
      sourceType: 'unambiguous',
      errorRecovery: false,
      plugins: [
        'decorators-legacy',
        'importAttributes',
        ...(isTypeScript ? (['typescript'] as const) : []),
        ...(isJsx ? (['jsx'] as const) : []),
      ],
    })
  );
};

const normalizeJson = (content: string): string => {
  return JSON.stringify(JSON.parse(content));
};

export const isContentEquivalent = (params: {
  filePath: string;
  existingContent: string;
  nextContent: string;
}): boolean => {
  const existingContent = normalizeLineEndings(params.existingContent);
  const nextContent = normalizeLineEndings(params.nextContent);

  if (existingContent === nextContent) {
    return true;
  }

  const extension = getExtension(params.filePath);

  try {
    if (JSON_EXTENSIONS.has(extension)) {
      return normalizeJson(existingContent) === normalizeJson(nextContent);
    }

    if (AST_COMPARABLE_EXTENSIONS.has(extension)) {
      return (
        JSON.stringify(parseComparableAst(existingContent, params.filePath)) ===
        JSON.stringify(parseComparableAst(nextContent, params.filePath))
      );
    }
  } catch {
    return false;
  }

  return false;
};
