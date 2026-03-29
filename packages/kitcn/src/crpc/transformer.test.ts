import {
  createTaggedTransformer,
  DATE_CODEC_TAG,
  decodeWire,
  encodeWire,
  getTransformer,
} from './transformer';

describe('crpc transformer', () => {
  test('default transformer encodes and decodes Date recursively', () => {
    const input = {
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      nested: [{ at: new Date('2024-01-02T00:00:00.000Z') }],
    };

    const encoded = encodeWire(input) as any;
    expect(encoded.createdAt).toEqual({
      __crpc: 1,
      t: DATE_CODEC_TAG,
      v: input.createdAt.getTime(),
    });
    expect(encoded.nested[0].at).toEqual({
      __crpc: 1,
      t: DATE_CODEC_TAG,
      v: input.nested[0].at.getTime(),
    });

    const decoded = decodeWire(encoded) as any;
    expect(decoded.createdAt).toBeInstanceOf(Date);
    expect(decoded.createdAt.getTime()).toBe(input.createdAt.getTime());
    expect(decoded.nested[0].at).toBeInstanceOf(Date);
    expect(decoded.nested[0].at.getTime()).toBe(input.nested[0].at.getTime());
  });

  test('supports split input/output transformers', () => {
    const transformer = getTransformer({
      input: {
        serialize: (value) => ({ wrappedInput: value }),
        deserialize: (value) => ({ inputDecoded: value }),
      },
      output: {
        serialize: (value) => ({ wrappedOutput: value }),
        deserialize: (value) => ({ outputDecoded: value }),
      },
    });

    expect(transformer.input.serialize('a')).toEqual({ wrappedInput: 'a' });
    expect(transformer.output.serialize('b')).toEqual({ wrappedOutput: 'b' });
    expect(transformer.input.deserialize('c')).toEqual({ inputDecoded: 'c' });
    expect(transformer.output.deserialize('d')).toEqual({ outputDecoded: 'd' });
  });

  test('always keeps Date transformer enabled when custom transformer is provided', () => {
    const transformer = getTransformer({
      input: {
        serialize: (value) => ({ wrapped: value }),
        deserialize: (value) => (value as any)?.wrapped ?? value,
      },
      output: {
        serialize: (value) => ({ wrapped: value }),
        deserialize: (value) => (value as any)?.wrapped ?? value,
      },
    });

    const now = new Date('2024-01-01T00:00:00.000Z');
    const encoded = transformer.input.serialize({ at: now }) as any;

    expect(encoded).toEqual({
      wrapped: {
        at: {
          __crpc: 1,
          t: DATE_CODEC_TAG,
          v: now.getTime(),
        },
      },
    });

    const decoded = transformer.input.deserialize(encoded) as any;
    expect(decoded.at).toBeInstanceOf(Date);
    expect(decoded.at.getTime()).toBe(now.getTime());
  });

  test('codec registration supports custom tagged types', () => {
    class CustomValue {
      constructor(public readonly value: string) {}
    }

    const custom = createTaggedTransformer([
      {
        tag: '$custom',
        isType: (value): value is CustomValue => value instanceof CustomValue,
        encode: (value) => (value as CustomValue).value,
        decode: (value) => new CustomValue(String(value)),
      },
    ]);

    const encoded = custom.serialize({ item: new CustomValue('ok') }) as any;
    expect(encoded).toEqual({
      item: { __crpc: 1, t: '$custom', v: 'ok' },
    });

    const decoded = custom.deserialize(encoded) as any;
    expect(decoded.item).toBeInstanceOf(CustomValue);
    expect(decoded.item.value).toBe('ok');
  });

  test('unknown tags pass through unchanged', () => {
    const input = {
      value: { $unknown: 'x' },
      nested: [{ $stillUnknown: 1 }],
    };

    const decoded = decodeWire(input);
    expect(decoded).toEqual(input);
  });

  test('avoids cloning payloads when no codec matches', () => {
    const input = {
      count: 1,
      nested: { ok: true },
      list: [{ status: 'ready' }],
    };

    expect(encodeWire(input)).toBe(input);
    expect(decodeWire(input)).toBe(input);
  });

  test('memoizes resolved transformers', () => {
    const custom = {
      input: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      },
      output: {
        serialize: (value: unknown) => value,
        deserialize: (value: unknown) => value,
      },
    };

    expect(getTransformer()).toBe(getTransformer());
    expect(getTransformer(custom)).toBe(getTransformer(custom));
  });

  test('wire payload never uses keys starting with $', () => {
    const encoded = encodeWire({
      list: [new Date('2024-01-01T00:00:00.000Z')],
      nested: {
        at: new Date('2024-01-02T00:00:00.000Z'),
      },
    });

    const walk = (value: unknown) => {
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item);
        }
        return;
      }

      if (!value || typeof value !== 'object') {
        return;
      }

      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>
      )) {
        expect(key.startsWith('$')).toBe(false);
        walk(nested);
      }
    };

    walk(encoded);
  });

  test('throws on duplicate codec tags', () => {
    expect(() =>
      createTaggedTransformer([
        {
          tag: '$x',
          isType: () => false,
          encode: (value) => value,
          decode: (value) => value,
        },
        {
          tag: '$x',
          isType: () => false,
          encode: (value) => value,
          decode: (value) => value,
        },
      ])
    ).toThrow(/Duplicate wire codec tag/);
  });
});
