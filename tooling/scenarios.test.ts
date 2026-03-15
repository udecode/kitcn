import { describe, expect, mock, test } from 'bun:test';
import {
  FULL_CONVEX_SCENARIO_KEYS,
  SCENARIO_DEFINITIONS,
} from './scenario.config';
import {
  checkScenarios,
  parseScenarioArgs,
  resolveScenarioKeysForCheck,
} from './scenarios';

describe('tooling/scenarios', () => {
  test('parseScenarioArgs supports the scenario command surface', () => {
    expect(parseScenarioArgs(['materialize', 'all'])).toEqual({
      mode: 'materialize',
      target: 'all',
    });

    expect(parseScenarioArgs(['dev', 'next-auth'])).toEqual({
      mode: 'dev',
      target: 'next-auth',
    });

    expect(() => parseScenarioArgs(['check', 'nope'])).toThrow(
      'Unknown scenario target "nope".'
    );
  });

  test('resolveScenarioKeysForCheck keeps CI checks scoped to non-committed scenarios', () => {
    expect(resolveScenarioKeysForCheck()).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'create-convex-bare',
      'create-convex-nextjs-shadcn',
      'create-convex-react-vite-shadcn',
    ]);
  });

  test('checkScenarios validates the CI scenario subset by default', async () => {
    const callOrder: string[] = [];

    await checkScenarios({
      checkScenarioFn: mock(async (scenarioKey) => {
        callOrder.push(scenarioKey);
      }) as typeof checkScenarios extends (params?: infer T) => Promise<unknown>
        ? NonNullable<T extends { checkScenarioFn?: infer U } ? U : never>
        : never,
    });

    expect(callOrder).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
      'create-convex-bare',
      'create-convex-nextjs-shadcn',
      'create-convex-react-vite-shadcn',
    ]);
  });

  test('scenario registry skips lint for slow adoption checks', () => {
    expect(SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].backend).toBe(
      'convex'
    );
    expect(
      SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].env?.CONVEX_AGENT_MODE
    ).toBe('anonymous');
    expect(
      SCENARIO_DEFINITIONS['convex-next-auth-bootstrap'].validation.beforeCheck
    ).toEqual([
      ['convex', 'init'],
      ['better-convex', 'dev', '--once', '--typecheck', 'disable'],
      ['better-convex', 'env', 'push', '--auth'],
    ]);
    expect(SCENARIO_DEFINITIONS['convex-vite-auth-bootstrap']).toMatchObject({
      backend: 'convex',
      check: true,
    });
    expect(FULL_CONVEX_SCENARIO_KEYS).toEqual([
      'convex-next-auth-bootstrap',
      'convex-vite-auth-bootstrap',
    ]);
    expect(SCENARIO_DEFINITIONS['create-convex-bare'].validation.lint).toBe(
      false
    );
    expect(
      SCENARIO_DEFINITIONS['create-convex-nextjs-shadcn'].validation.lint
    ).toBe(false);
    expect(
      SCENARIO_DEFINITIONS['create-convex-react-vite-shadcn'].validation.lint
    ).toBe(false);
  });
});
