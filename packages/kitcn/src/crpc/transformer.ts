const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Generic transformer contract (mirrors tRPC shape).
 */
export interface DataTransformer {
  deserialize(object: any): any;
  serialize(object: any): any;
}

/**
 * Separate input/output transformers.
 */
export interface CombinedDataTransformer {
  input: DataTransformer;
  output: DataTransformer;
}

/**
 * Transformer config accepted by cRPC.
 */
export type DataTransformerOptions = CombinedDataTransformer | DataTransformer;

/**
 * Extensible tagged wire codec.
 */
export interface WireCodec {
  decode(value: unknown): unknown;
  encode(value: unknown): unknown;
  isType(value: unknown): boolean;
  readonly tag: `$${string}`;
}

const CODEC_MARKER_KEY = '__crpc';
const CODEC_MARKER_VALUE = 1;
const CODEC_TAG_KEY = 't';
const CODEC_VALUE_KEY = 'v';

const hasOnlyCodecPayloadKeys = (value: Record<string, unknown>): boolean => {
  let keyCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    keyCount += 1;
    if (
      key !== CODEC_MARKER_KEY &&
      key !== CODEC_TAG_KEY &&
      key !== CODEC_VALUE_KEY
    ) {
      return false;
    }
    if (keyCount > 3) {
      return false;
    }
  }
  return keyCount === 3;
};

/**
 * Date wire tag (Convex-style reserved key).
 */
export const DATE_CODEC_TAG = '$date';

/**
 * Built-in Date codec.
 */
export const dateWireCodec: WireCodec = {
  tag: DATE_CODEC_TAG,
  isType: (value): value is Date => value instanceof Date,
  encode: (value) => (value as Date).getTime(),
  decode: (value) => {
    if (typeof value !== 'number') {
      return value;
    }
    return new Date(value);
  },
};

/**
 * Build a recursive tagged transformer from codecs.
 */
export const createTaggedTransformer = (
  codecs: readonly WireCodec[]
): DataTransformer => {
  const codecByTag = new Map<string, WireCodec>();
  for (const codec of codecs) {
    if (!codec.tag.startsWith('$')) {
      throw new Error(
        `Invalid wire codec tag '${codec.tag}'. Tags must start with '$'.`
      );
    }
    if (codecByTag.has(codec.tag)) {
      throw new Error(`Duplicate wire codec tag '${codec.tag}'.`);
    }
    codecByTag.set(codec.tag, codec);
  }

  const serialize = (value: unknown): unknown => {
    for (const codec of codecs) {
      if (codec.isType(value)) {
        return {
          [CODEC_MARKER_KEY]: CODEC_MARKER_VALUE,
          [CODEC_TAG_KEY]: codec.tag,
          [CODEC_VALUE_KEY]: serialize(codec.encode(value)),
        };
      }
    }

    if (Array.isArray(value)) {
      let result: unknown[] | undefined;
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        const serialized = serialize(item);
        if (serialized !== item) {
          if (!result) {
            result = value.slice();
          }
          result[index] = serialized;
        }
      }
      return result ?? value;
    }

    if (isPlainObject(value)) {
      let result: Record<string, unknown> | undefined;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) {
          continue;
        }

        const nested = value[key];
        const serialized = serialize(nested);
        if (serialized !== nested) {
          if (!result) {
            result = { ...value };
          }
          result[key] = serialized;
        }
      }
      return result ?? value;
    }

    return value;
  };

  const deserialize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      let result: unknown[] | undefined;
      for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        const deserialized = deserialize(item);
        if (deserialized !== item) {
          if (!result) {
            result = value.slice();
          }
          result[index] = deserialized;
        }
      }
      return result ?? value;
    }

    if (isPlainObject(value)) {
      const marker = value[CODEC_MARKER_KEY];
      const tag = value[CODEC_TAG_KEY];
      if (
        marker === CODEC_MARKER_VALUE &&
        typeof tag === 'string' &&
        CODEC_VALUE_KEY in value &&
        hasOnlyCodecPayloadKeys(value)
      ) {
        const codec = codecByTag.get(tag);
        if (codec) {
          return codec.decode(deserialize(value[CODEC_VALUE_KEY]));
        }
      }

      let result: Record<string, unknown> | undefined;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) {
          continue;
        }

        const nested = value[key];
        const deserialized = deserialize(nested);
        if (deserialized !== nested) {
          if (!result) {
            result = { ...value };
          }
          result[key] = deserialized;
        }
      }
      return result ?? value;
    }

    return value;
  };

  return {
    serialize,
    deserialize,
  };
};

/**
 * Default cRPC transformer (Date-enabled).
 */
export const defaultCRPCTransformer: DataTransformer = createTaggedTransformer([
  dateWireCodec,
]);

const DEFAULT_COMBINED_TRANSFORMER: CombinedDataTransformer = {
  input: defaultCRPCTransformer,
  output: defaultCRPCTransformer,
};

const IDENTITY_TRANSFORMER: CombinedDataTransformer = {
  input: {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
  output: {
    serialize: (value) => value,
    deserialize: (value) => value,
  },
};

/**
 * Normalize transformer config to split input/output shape.
 */
const normalizeCustomTransformer = (
  transformer?: DataTransformerOptions
): CombinedDataTransformer | undefined => {
  if (!transformer) {
    return;
  }

  if ('input' in transformer && 'output' in transformer) {
    return transformer;
  }

  return {
    input: transformer,
    output: transformer,
  };
};

/**
 * Compose user transformer with default Date transformer.
 *
 * Date transformer is always active:
 * - serialize: user -> default(Date)
 * - deserialize: default(Date) -> user
 */
const composeWithDefault = (transformer?: DataTransformer): DataTransformer => {
  if (!transformer) {
    return defaultCRPCTransformer;
  }

  return {
    serialize: (value) =>
      defaultCRPCTransformer.serialize(transformer.serialize(value)),
    deserialize: (value) =>
      transformer.deserialize(defaultCRPCTransformer.deserialize(value)),
  };
};

const transformerCache = new WeakMap<object, CombinedDataTransformer>();

/**
 * Normalize transformer config to split input/output shape.
 * User transformers are additive and always composed with default Date handling.
 */
export const getTransformer = (
  transformer?: DataTransformerOptions
): CombinedDataTransformer => {
  if (!transformer) {
    return DEFAULT_COMBINED_TRANSFORMER;
  }

  const cacheKey = transformer as object;
  const cached = transformerCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const custom = normalizeCustomTransformer(transformer);
  const resolved = {
    input: composeWithDefault(custom?.input),
    output: composeWithDefault(custom?.output),
  };

  transformerCache.set(cacheKey, resolved);
  return resolved;
};

/**
 * Encode request payloads (input direction).
 */
export const encodeWire = (
  value: unknown,
  transformer?: DataTransformerOptions
): unknown => getTransformer(transformer).input.serialize(value);

/**
 * Decode response payloads (output direction).
 */
export const decodeWire = (
  value: unknown,
  transformer?: DataTransformerOptions
): unknown => getTransformer(transformer).output.deserialize(value);

/**
 * Exposed identity transformer for advanced composition.
 */
export const identityTransformer: CombinedDataTransformer =
  IDENTITY_TRANSFORMER;
