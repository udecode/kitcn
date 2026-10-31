import { v } from 'convex/values';
import { describe, expect, test } from 'vitest';
import { validate, vRequired } from './validators';

describe('validators (vendored)', () => {
  test('validate requires function handle strings', () => {
    const validator = v.function({ fnType: 'action' });

    expect(validate(validator, 'function://handle')).toBe(true);
    expect(validate(validator, '')).toBe(false);
    expect(validate(validator, 'not-a-handle')).toBe(false);
    expect(validate(validator, 42)).toBe(false);
  });

  test('vRequired keeps the function handle signature', () => {
    const validator = vRequired(
      v.optional(v.function({ fnType: 'query', args: { id: v.string() } }))
    );

    expect(validator.isOptional).toBe('required');
    expect(validator.json).toEqual(
      v.function({ fnType: 'query', args: { id: v.string() } }).json
    );
  });
});
