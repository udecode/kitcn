import type { FilterExpression } from '../filter-expression';
import { evaluateFilter } from '../mutation-utils';
import { EnableRLS, RlsPolicies } from '../symbols';
import type { ConvexTable } from '../table';
import type { RlsPolicy, RlsPolicyToOption } from './policies';
import { isRlsRole } from './roles';
import type { RlsContext } from './types';

export type RlsOperation = 'select' | 'insert' | 'update' | 'delete';

type PolicyCheckType = 'using' | 'withCheck';

type EvaluatePolicyInput = {
  table: ConvexTable<any>;
  operation: RlsOperation;
  checkType: PolicyCheckType;
  row: Record<string, unknown>;
  rls?: RlsContext;
};

export function isRlsEnabled(table: ConvexTable<any>): boolean {
  return Boolean((table as any)[EnableRLS] || getRlsPolicies(table).length > 0);
}

export function getRlsPolicies(table: ConvexTable<any>): RlsPolicy[] {
  return ((table as any)[RlsPolicies] ?? []) as RlsPolicy[];
}

function policyApplies(policy: RlsPolicy, operation: RlsOperation): boolean {
  const target = policy.for ?? 'all';
  return target === 'all' || target === operation;
}

function flattenRoles(
  target: RlsPolicyToOption | undefined
): 'public' | string[] {
  if (!target) return 'public';

  const roles: string[] = [];
  let hasPublic = false;

  const visit = (value: RlsPolicyToOption) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === 'public') {
      hasPublic = true;
      return;
    }
    if (isRlsRole(value)) {
      roles.push(value.name);
      return;
    }
    roles.push(value as string);
  };

  visit(target);

  return hasPublic ? 'public' : roles;
}

function roleMatches(policy: RlsPolicy, rls?: RlsContext): boolean {
  const resolver = rls?.roleResolver;
  if (!resolver) return true;

  const roles = resolver(rls?.ctx ?? {}) ?? [];
  const targetRoles = flattenRoles(policy.to);

  if (targetRoles === 'public') return true;
  return targetRoles.some((role) => roles.includes(role));
}

async function resolveExpression(
  policy: RlsPolicy,
  checkType: PolicyCheckType,
  ctx: unknown,
  table: ConvexTable<any>
): Promise<FilterExpression<boolean> | undefined> {
  const candidate =
    checkType === 'withCheck'
      ? (policy.withCheck ?? policy.using)
      : policy.using;

  if (!candidate) return;
  if (typeof candidate === 'function') {
    return await candidate(ctx as any, table as any);
  }
  return candidate as FilterExpression<boolean>;
}

async function evaluatePolicySet({
  table,
  operation,
  checkType,
  row,
  rls,
}: EvaluatePolicyInput): Promise<boolean> {
  if (!isRlsEnabled(table)) return true;
  if (rls?.mode === 'skip') return true;

  const ctx = rls?.ctx ?? {};
  const policies = getRlsPolicies(table).filter(
    (policy) => policyApplies(policy, operation) && roleMatches(policy, rls)
  );

  if (policies.length === 0) {
    return false;
  }

  const permissive = policies.filter(
    (policy) => (policy.as ?? 'permissive') !== 'restrictive'
  );

  if (permissive.length === 0) {
    return false;
  }

  let permissivePasses = false;
  for (const policy of permissive) {
    const expression = await resolveExpression(policy, checkType, ctx, table);
    if (!expression || evaluateFilter(row, expression)) {
      permissivePasses = true;
      break;
    }
  }
  if (!permissivePasses) return false;

  const restrictive = policies.filter(
    (policy) => (policy.as ?? 'permissive') === 'restrictive'
  );

  for (const policy of restrictive) {
    const expression = await resolveExpression(policy, checkType, ctx, table);
    if (!expression) continue;
    if (!evaluateFilter(row, expression)) return false;
  }

  return true;
}

export async function canSelectRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'select',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
  });
}

export async function canInsertRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'insert',
    checkType: 'withCheck',
    row: options.row,
    rls: options.rls,
  });
}

export async function canDeleteRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'delete',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
  });
}

export async function canUpdateRow(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
}): Promise<boolean> {
  const decision = await evaluateUpdateDecision(options);
  return decision.allowed;
}

export async function evaluateUpdateDecision(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
}): Promise<{
  allowed: boolean;
  usingAllowed: boolean;
  withCheckAllowed: boolean;
}> {
  const usingAllowed = await evaluatePolicySet({
    table: options.table,
    operation: 'update',
    checkType: 'using',
    row: options.existingRow,
    rls: options.rls,
  });

  const withCheckAllowed = await evaluatePolicySet({
    table: options.table,
    operation: 'update',
    checkType: 'withCheck',
    row: options.updatedRow,
    rls: options.rls,
  });

  return {
    allowed: usingAllowed && withCheckAllowed,
    usingAllowed,
    withCheckAllowed,
  };
}

export async function filterSelectRows(options: {
  table: ConvexTable<any>;
  rows: Record<string, unknown>[];
  rls?: RlsContext;
}): Promise<Record<string, unknown>[]> {
  if (!isRlsEnabled(options.table)) return options.rows;
  if (options.rls?.mode === 'skip') return options.rows;

  const rows: Record<string, unknown>[] = [];
  for (const row of options.rows) {
    if (await canSelectRow({ table: options.table, row, rls: options.rls })) {
      rows.push(row);
    }
  }
  return rows;
}
