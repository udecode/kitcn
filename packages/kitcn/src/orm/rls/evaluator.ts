import type { FilterExpression } from '../filter-expression';
import {
  evaluateCheckConstraintTriState,
  getTableName,
} from '../mutation-utils';
import { EnableRLS, RlsPolicies } from '../symbols';
import type { ConvexTable } from '../table';
import { runInOrmUserCallback } from '../write-batch';
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
  cache?: RlsPolicyResolutionCache;
};

/**
 * Per-execution memo of everything in a policy set that does not depend on the
 * row: which policies apply (including role matching, so `roleResolver` runs
 * once instead of once per row per policy) and each policy's resolved
 * expression.
 *
 * SECURITY: a resolved expression embeds the calling identity from `rls.ctx`,
 * and inside a mutation it can embed state a later write invalidates. Scope one
 * cache to a single query execution or write-free mutation decision phase —
 * never across writes, or on a table, module, `RlsPolicy`, or request-scoped
 * ORM context.
 */
export type RlsPolicyResolutionCache = {
  applicable: WeakMap<ConvexTable<any>, Map<RlsOperation, RlsPolicy[]>>;
  expressions: WeakMap<
    RlsPolicy,
    Map<PolicyCheckType, Promise<FilterExpression<boolean> | undefined>>
  >;
};

export function createRlsPolicyResolutionCache(): RlsPolicyResolutionCache {
  return {
    applicable: new WeakMap(),
    expressions: new WeakMap(),
  };
}

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

/**
 * SQL pseudo-roles always resolve to the calling user, so they apply to every
 * caller and never need a role resolver. Only `rlsRole()` values and bare role
 * names are matched against resolved roles.
 */
const PSEUDO_ROLES = new Set([
  'public',
  'current_role',
  'current_user',
  'session_user',
]);

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
    if (typeof value === 'string' && PSEUDO_ROLES.has(value)) {
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

function roleResolverRequiredError(
  policy: RlsPolicy,
  table: ConvexTable<any>,
  targetRoles: string[]
): Error {
  const roleList = targetRoles.map((role) => `'${role}'`).join(', ');
  return new Error(
    `RLS_ROLE_RESOLVER_REQUIRED: policy '${policy.name}' on table ` +
      `'${getTableName(table)}' targets role(s) ${roleList}, but no ` +
      "'roleResolver' is configured. Pass 'rls.roleResolver' when creating " +
      "the ORM database, or remove the policy's 'to' clause."
  );
}

/**
 * A named-role policy cannot be evaluated without a role resolver. Validate
 * that from the table's policy set alone so the failure depends only on
 * configuration, never on whether the table currently holds matching rows.
 */
export function assertRlsRolesResolvable(options: {
  table: ConvexTable<any>;
  operation: RlsOperation;
  rls?: RlsContext;
}): void {
  const { table, operation, rls } = options;
  if (!isRlsEnabled(table)) return;
  if (rls?.mode === 'skip') return;
  if (rls?.roleResolver) return;

  for (const policy of getRlsPolicies(table)) {
    if (!policyApplies(policy, operation)) continue;
    const targetRoles = flattenRoles(policy.to);
    if (targetRoles === 'public') continue;
    throw roleResolverRequiredError(policy, table, targetRoles);
  }
}

function roleMatches(policy: RlsPolicy, rls?: RlsContext): boolean {
  const targetRoles = flattenRoles(policy.to);
  if (targetRoles === 'public') return true;

  // `assertRlsRolesResolvable` rejects a missing resolver before any row is
  // evaluated; treating it as an empty role list here keeps this fail-closed.
  const resolver = rls?.roleResolver;
  const roles = resolver ? (resolver(rls?.ctx ?? {}) ?? []) : [];
  return targetRoles.some((role) => roles.includes(role));
}

/**
 * Policy expressions follow SQL RLS semantics: an expression that evaluates to
 * NULL/unknown is treated as false. A nullish document field or a nullish
 * context value therefore never satisfies a policy.
 */
function policyExpressionPasses(
  row: Record<string, unknown>,
  expression: FilterExpression<boolean>
): boolean {
  return evaluateCheckConstraintTriState(row, expression) === true;
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
    return await runInOrmUserCallback(() =>
      candidate(ctx as any, table as any)
    );
  }
  return candidate as FilterExpression<boolean>;
}

/**
 * The applicable-policy set depends only on `(table, operation, rls)`, never on
 * a row, so it is computed once per cache. `assertRlsRolesResolvable` is folded
 * in to keep the fail-closed ordering: configuration errors still throw before
 * any policy expression is resolved.
 */
function getApplicablePolicies(
  table: ConvexTable<any>,
  operation: RlsOperation,
  rls: RlsContext | undefined,
  cache: RlsPolicyResolutionCache
): RlsPolicy[] {
  const byOperation = cache.applicable.get(table);
  const cached = byOperation?.get(operation);
  if (cached) {
    return cached;
  }

  assertRlsRolesResolvable({ table, operation, rls });
  const policies = getRlsPolicies(table).filter(
    (policy) => policyApplies(policy, operation) && roleMatches(policy, rls)
  );

  if (byOperation) {
    byOperation.set(operation, policies);
  } else {
    cache.applicable.set(table, new Map([[operation, policies]]));
  }
  return policies;
}

/**
 * Resolved lazily and per policy, so the permissive short-circuit still means a
 * later policy's callback is never invoked. The promise (not the value) is
 * memoized so concurrent rows cannot double-invoke a user callback.
 */
function resolveExpressionCached(
  policy: RlsPolicy,
  checkType: PolicyCheckType,
  ctx: unknown,
  table: ConvexTable<any>,
  cache: RlsPolicyResolutionCache
): Promise<FilterExpression<boolean> | undefined> {
  const byCheckType = cache.expressions.get(policy);
  const cached = byCheckType?.get(checkType);
  if (cached) {
    return cached;
  }

  const pending = resolveExpression(policy, checkType, ctx, table);
  if (byCheckType) {
    byCheckType.set(checkType, pending);
  } else {
    cache.expressions.set(policy, new Map([[checkType, pending]]));
  }
  return pending;
}

async function evaluatePolicySet({
  table,
  operation,
  checkType,
  row,
  rls,
  cache,
}: EvaluatePolicyInput): Promise<boolean> {
  if (!isRlsEnabled(table)) return true;
  if (rls?.mode === 'skip') return true;

  const resolution = cache ?? createRlsPolicyResolutionCache();
  const ctx = rls?.ctx ?? {};
  const policies = getApplicablePolicies(table, operation, rls, resolution);

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
    const expression = await resolveExpressionCached(
      policy,
      checkType,
      ctx,
      table,
      resolution
    );
    if (!expression || policyExpressionPasses(row, expression)) {
      permissivePasses = true;
      break;
    }
  }
  if (!permissivePasses) return false;

  const restrictive = policies.filter(
    (policy) => (policy.as ?? 'permissive') === 'restrictive'
  );

  for (const policy of restrictive) {
    const expression = await resolveExpressionCached(
      policy,
      checkType,
      ctx,
      table,
      resolution
    );
    if (!expression) continue;
    if (!policyExpressionPasses(row, expression)) return false;
  }

  return true;
}

export async function canSelectRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
  cache?: RlsPolicyResolutionCache;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'select',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
    cache: options.cache,
  });
}

export async function canInsertRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
  cache?: RlsPolicyResolutionCache;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'insert',
    checkType: 'withCheck',
    row: options.row,
    rls: options.rls,
    cache: options.cache,
  });
}

export async function canDeleteRow(options: {
  table: ConvexTable<any>;
  row: Record<string, unknown>;
  rls?: RlsContext;
  cache?: RlsPolicyResolutionCache;
}): Promise<boolean> {
  return evaluatePolicySet({
    table: options.table,
    operation: 'delete',
    checkType: 'using',
    row: options.row,
    rls: options.rls,
    cache: options.cache,
  });
}

export async function canUpdateRow(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
  cache?: RlsPolicyResolutionCache;
}): Promise<boolean> {
  const decision = await evaluateUpdateDecision(options);
  return decision.allowed;
}

export async function evaluateUpdateDecision(options: {
  table: ConvexTable<any>;
  existingRow: Record<string, unknown>;
  updatedRow: Record<string, unknown>;
  rls?: RlsContext;
  cache?: RlsPolicyResolutionCache;
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
    cache: options.cache,
  });

  const withCheckAllowed = await evaluatePolicySet({
    table: options.table,
    operation: 'update',
    checkType: 'withCheck',
    row: options.updatedRow,
    rls: options.rls,
    cache: options.cache,
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
  cache?: RlsPolicyResolutionCache;
}): Promise<Record<string, unknown>[]> {
  if (!isRlsEnabled(options.table)) return options.rows;
  if (options.rls?.mode === 'skip') return options.rows;

  // Runs before the row loop so an empty result set still rejects a table whose
  // policies cannot be evaluated.
  assertRlsRolesResolvable({
    table: options.table,
    operation: 'select',
    rls: options.rls,
  });

  // Callers that stream rows one at a time pass their own cache; without it
  // each call would re-resolve the whole policy set for a single row.
  const cache = options.cache ?? createRlsPolicyResolutionCache();
  const rows: Record<string, unknown>[] = [];
  for (const row of options.rows) {
    if (
      await canSelectRow({ cache, table: options.table, row, rls: options.rls })
    ) {
      rows.push(row);
    }
  }
  return rows;
}
