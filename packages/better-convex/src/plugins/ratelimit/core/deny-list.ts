import type { LimitRequest, ProtectionLists } from '../types';

const DEFAULT_BLOCK_MS = 60_000;
const THRESHOLD_BLOCK_MS = 24 * 60 * 60 * 1000;

const protectionState = new Map<
  string,
  {
    hits: Map<string, number>;
    blockedUntil: Map<string, number>;
  }
>();

function getState(prefix: string) {
  let state = protectionState.get(prefix);
  if (!state) {
    state = { hits: new Map(), blockedUntil: new Map() };
    protectionState.set(prefix, state);
  }
  return state;
}

export function pickDeniedValue(options: {
  prefix: string;
  identifier: string;
  request?: LimitRequest;
  lists?: ProtectionLists;
}): string | undefined {
  const members = getMembers(options.identifier, options.request);
  const state = getState(options.prefix);

  for (const member of members) {
    const until = state.blockedUntil.get(member.value);
    if (until && until > Date.now()) {
      return member.value;
    }
    if (until && until <= Date.now()) {
      state.blockedUntil.delete(member.value);
    }
  }

  if (!options.lists) {
    return undefined;
  }

  const listMatchers: Array<{
    values: readonly string[] | undefined;
    kind: MemberKind;
  }> = [
    { values: options.lists.identifiers, kind: 'identifier' },
    { values: options.lists.ips, kind: 'ip' },
    { values: options.lists.userAgents, kind: 'userAgent' },
    { values: options.lists.countries, kind: 'country' },
  ];

  for (const matcher of listMatchers) {
    if (!matcher.values || matcher.values.length === 0) {
      continue;
    }
    const valueSet = new Set(matcher.values);
    const hit = members.find(
      (member) => member.kind === matcher.kind && valueSet.has(member.value)
    );
    if (hit) {
      state.blockedUntil.set(hit.value, Date.now() + DEFAULT_BLOCK_MS);
      return hit.value;
    }
  }

  return undefined;
}

export function recordRateLimitFailure(options: {
  prefix: string;
  identifier: string;
  request?: LimitRequest;
  threshold: number;
}): void {
  const members = getMembers(options.identifier, options.request);
  const state = getState(options.prefix);

  for (const member of members) {
    const next = (state.hits.get(member.value) ?? 0) + 1;
    state.hits.set(member.value, next);

    if (next >= options.threshold) {
      state.blockedUntil.set(member.value, Date.now() + THRESHOLD_BLOCK_MS);
    }
  }
}

export function clearProtection(prefix: string, identifier: string): void {
  const state = getState(prefix);
  state.hits.delete(identifier);
  state.blockedUntil.delete(identifier);
}

type MemberKind = 'identifier' | 'ip' | 'userAgent' | 'country';

function getMembers(
  identifier: string,
  request?: LimitRequest
): Array<{
  kind: MemberKind;
  value: string;
}> {
  const members: Array<{ kind: MemberKind; value: string | undefined }> = [
    { kind: 'identifier', value: identifier },
    { kind: 'ip', value: request?.ip },
    { kind: 'userAgent', value: request?.userAgent },
    { kind: 'country', value: request?.country },
  ];

  return members.filter(
    (member): member is { kind: MemberKind; value: string } =>
      Boolean(member.value)
  );
}
