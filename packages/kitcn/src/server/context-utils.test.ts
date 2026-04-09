import type { GenericCtx } from './context-utils';
import {
  isActionCtx,
  isMutationCtx,
  isQueryCtx,
  isRunMutationCtx,
  isSchedulerCtx,
  requireActionCtx,
  requireMutationCtx,
  requireQueryCtx,
  requireRunMutationCtx,
  requireSchedulerCtx,
} from './context-utils';

describe('server/context-utils', () => {
  const queryCtx = { db: {} } as unknown as GenericCtx;
  const mutationCtx = {
    db: {},
    runMutation: async () => null,
    scheduler: {},
  } as unknown as GenericCtx;
  const actionCtx = {
    runAction: async () => null,
    runMutation: async () => null,
    scheduler: {},
  } as unknown as GenericCtx;

  test('detects query, mutation, action and runMutation contexts', () => {
    expect(isQueryCtx(queryCtx)).toBe(true);
    expect(isQueryCtx(actionCtx)).toBe(false);

    expect(isMutationCtx(mutationCtx)).toBe(true);
    expect(isMutationCtx(queryCtx)).toBe(false);

    expect(isActionCtx(actionCtx)).toBe(true);
    expect(isActionCtx(queryCtx)).toBe(false);

    expect(isRunMutationCtx(mutationCtx)).toBe(true);
    expect(isRunMutationCtx(actionCtx)).toBe(true);
    expect(isRunMutationCtx(queryCtx)).toBe(false);

    expect(isSchedulerCtx(mutationCtx)).toBe(true);
    expect(isSchedulerCtx(actionCtx)).toBe(true);
    expect(isSchedulerCtx(queryCtx)).toBe(false);
  });

  test('require helpers return valid contexts', () => {
    expect(() => requireQueryCtx(queryCtx)).not.toThrow();
    expect(() => requireMutationCtx(mutationCtx)).not.toThrow();
    expect(() => requireActionCtx(actionCtx)).not.toThrow();
    expect(() => requireRunMutationCtx(actionCtx)).not.toThrow();
    expect(() => requireSchedulerCtx(actionCtx)).not.toThrow();
    expect(() => requireSchedulerCtx(mutationCtx)).not.toThrow();
  });

  test('require helpers throw on invalid contexts', () => {
    expect(() => requireQueryCtx(actionCtx)).toThrow('Query context required');
    expect(() => requireMutationCtx(queryCtx)).toThrow(
      'Mutation context required'
    );
    expect(() => requireActionCtx(queryCtx)).toThrow('Action context required');
    expect(() => requireActionCtx(mutationCtx)).toThrow(
      'Use requireSchedulerCtx(ctx) with caller.schedule.*.'
    );
    expect(() => requireRunMutationCtx(queryCtx)).toThrow(
      'Mutation or action context required'
    );
    expect(() => requireSchedulerCtx(queryCtx)).toThrow(
      'Mutation or action context with scheduler required'
    );
  });
});
