import type { Meta } from '../crpc/types';

export type AuthType = 'required' | 'optional' | undefined;

/** Get auth type from meta for a function */
export function getAuthType(
  meta: Meta | undefined,
  funcName: string
): AuthType {
  const [namespace, fnName] = funcName.split(':');
  return meta?.[namespace]?.[fnName]?.auth as AuthType;
}
