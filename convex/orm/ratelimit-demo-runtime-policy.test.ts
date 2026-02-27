import { describe, expect, it } from 'vitest';
import {
  createStaticProbeResult,
  RATELIMIT_COVERAGE_DEFINITIONS,
  RATELIMIT_LIVE_PROBE_IDS,
} from '../../example/convex/functions/ratelimitDemo.coverage';

describe('ratelimit demo runtime probe policy', () => {
  it('keeps live probes focused on mutation-safe core checks', () => {
    expect(RATELIMIT_LIVE_PROBE_IDS.has('fixed-window-limit')).toBe(true);
    expect(RATELIMIT_LIVE_PROBE_IDS.has('sliding-window-limit')).toBe(true);
    expect(RATELIMIT_LIVE_PROBE_IDS.has('token-bucket-reserve')).toBe(true);
    expect(RATELIMIT_LIVE_PROBE_IDS.has('get-remaining')).toBe(true);

    expect(
      RATELIMIT_LIVE_PROBE_IDS.has('block-until-ready-mutation-blocked')
    ).toBe(false);
  });

  it('returns deterministic static probe results for non-live rows', () => {
    const blockedDefinition = RATELIMIT_COVERAGE_DEFINITIONS.find(
      (entry) => entry.id === 'block-until-ready-mutation-blocked'
    );
    const supportedDefinition = RATELIMIT_COVERAGE_DEFINITIONS.find(
      (entry) => entry.id === 'dynamic-limit-override'
    );

    expect(blockedDefinition).toBeDefined();
    expect(supportedDefinition).toBeDefined();

    const blockedProbe = createStaticProbeResult(blockedDefinition!);
    const supportedProbe = createStaticProbeResult(supportedDefinition!);

    expect(blockedProbe.ok).toBe(false);
    expect(blockedProbe.errorCode).toBe('PROBE_FAILED');
    expect(supportedProbe.ok).toBe(true);
    expect(supportedProbe.error).toBeNull();
  });
});
