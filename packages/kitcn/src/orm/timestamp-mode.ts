import { Columns } from './symbols';

export const PUBLIC_CREATED_AT_FIELD = 'createdAt';
export const INTERNAL_CREATION_TIME_FIELD = '_creationTime';

export const CREATED_AT_MIGRATION_MESSAGE =
  '`_creationTime` is no longer public. Use `createdAt` instead.';

export const hasUserCreatedAtColumn = (table: unknown): boolean => {
  if (!table || typeof table !== 'object') {
    return false;
  }
  const columns = (table as Record<PropertyKey, unknown>)[Columns];
  if (!columns || typeof columns !== 'object') {
    return false;
  }
  return Object.hasOwn(columns, PUBLIC_CREATED_AT_FIELD);
};

export const usesSystemCreatedAtAlias = (_table: unknown): boolean => true;
