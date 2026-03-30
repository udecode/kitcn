import { isAbsolute, posix } from 'node:path';

export const normalizePath = (filePath: string): string =>
  filePath.replace(/\\/g, '/');

export const normalizeRelativePathOrThrow = (
  value: string,
  fieldName: string
): string => {
  if (value.includes('\0')) {
    throw new Error(`Invalid ${fieldName}: null byte is not allowed.`);
  }
  if (isAbsolute(value)) {
    throw new Error(`Invalid ${fieldName}: absolute paths are not allowed.`);
  }
  const normalized = posix.normalize(value.replace(/\\/g, '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    throw new Error(`Invalid ${fieldName}: path traversal is not allowed.`);
  }
  return normalized;
};

export const normalizeLockfileScaffoldPath = (
  value: unknown
): string | null => {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  if (value.includes('\0') || isAbsolute(value)) {
    return null;
  }
  const normalized = posix.normalize(value.replace(/\\/g, '/'));
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.startsWith('/')
  ) {
    return null;
  }
  return normalized;
};
