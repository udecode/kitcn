export type AuthCoverageStatus =
  | 'supported'
  | 'partial'
  | 'blocked'
  | 'missing';

export type AuthCoverageExpectation = 'success' | 'failure';

export type AuthCoverageProbeMode = 'live' | 'static';

export type AuthCoverageId =
  | 'anonymous-sign-in'
  | 'anonymous-flag'
  | 'anonymous-email-domain'
  | 'anonymous-generate-name'
  | 'link-account-non-anonymous'
  | 'on-link-account-bio-migration'
  | 'linked-source-anonymous-deleted'
  | 'disable-delete-anonymous-user-option'
  | 'generate-random-email-precedence';

export type AuthCoverageDefinition = {
  id: AuthCoverageId;
  feature: string;
  status: AuthCoverageStatus;
  reason: string;
  example: string;
  expectation: AuthCoverageExpectation;
  probeMode: AuthCoverageProbeMode;
  errorCode?: string;
};

export type AuthCoverageProbeResult = {
  ok: boolean;
  elapsedMs: number;
  error: string | null;
  errorCode: string | null;
  value?: unknown;
};

export const AUTH_COVERAGE_DEFINITIONS: readonly AuthCoverageDefinition[] = [
  {
    id: 'anonymous-sign-in',
    feature: 'anonymous sign-in creates session',
    status: 'supported',
    reason:
      'anonymous() creates an authenticated session and user without PII.',
    example: 'auth.api.signInAnonymous({ headers })',
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'anonymous-flag',
    feature: 'anonymous user flag',
    status: 'supported',
    reason: 'Anonymous users are marked with user.isAnonymous = true.',
    example: 'session.user.isAnonymous === true',
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'anonymous-email-domain',
    feature: 'anonymous email domain configuration',
    status: 'supported',
    reason: 'emailDomainName controls generated anonymous email domain.',
    example: "anonymous({ emailDomainName: 'demo-anon.local' })",
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'anonymous-generate-name',
    feature: 'anonymous generateName hook',
    status: 'supported',
    reason: 'generateName customizes anonymous display names at creation.',
    example: "anonymous({ generateName: () => 'Guest ...' })",
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'link-account-non-anonymous',
    feature: 'link account transitions anonymous -> non-anonymous',
    status: 'supported',
    reason:
      'Linking to email credentials yields a non-anonymous destination user.',
    example:
      'anonymous session + signUpEmail -> linked user.isAnonymous !== true',
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'on-link-account-bio-migration',
    feature: 'onLinkAccount demo migration callback',
    status: 'supported',
    reason:
      'onLinkAccount copies anonymous bio to linked user when destination bio is empty.',
    example: 'anonymous.bio -> newUser.bio in onLinkAccount',
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'linked-source-anonymous-deleted',
    feature: 'default anonymous source deletion after linking',
    status: 'supported',
    reason:
      'Without disableDeleteAnonymousUser, source anonymous user is deleted after linking.',
    example: 'anonymous source user missing after signUpEmail link',
    expectation: 'success',
    probeMode: 'live',
  },
  {
    id: 'disable-delete-anonymous-user-option',
    feature: 'disableDeleteAnonymousUser option contract',
    status: 'supported',
    reason: 'Option keeps anonymous source user after linking when enabled.',
    example: 'anonymous({ disableDeleteAnonymousUser: true })',
    expectation: 'success',
    probeMode: 'static',
  },
  {
    id: 'generate-random-email-precedence',
    feature: 'generateRandomEmail precedence contract',
    status: 'supported',
    reason: 'generateRandomEmail takes precedence over emailDomainName.',
    example: 'anonymous({ generateRandomEmail }) overrides emailDomainName',
    expectation: 'success',
    probeMode: 'static',
  },
] as const;

export const AUTH_LIVE_PROBE_IDS = new Set<AuthCoverageId>(
  AUTH_COVERAGE_DEFINITIONS.filter((entry) => entry.probeMode === 'live').map(
    (entry) => entry.id
  )
);

export function createStaticProbeResult(
  definition: AuthCoverageDefinition
): AuthCoverageProbeResult {
  if (definition.expectation === 'failure') {
    return {
      ok: false,
      elapsedMs: 0,
      error:
        definition.reason ||
        'Intentionally unavailable in current runtime configuration.',
      errorCode: definition.errorCode ?? 'EXPECTED_FAILURE',
    };
  }

  return {
    ok: true,
    elapsedMs: 0,
    error: null,
    errorCode: null,
  };
}
