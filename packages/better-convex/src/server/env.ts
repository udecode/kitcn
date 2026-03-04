import { z } from 'zod';
import { CRPCError } from './error';

export type CreateEnvOptions<TSchema extends z.ZodObject<z.ZodRawShape>> = {
  cache?: boolean;
  codegenFallback?: boolean;
  runtimeEnv?: NodeJS.ProcessEnv;
  schema: TSchema;
};

export function createEnv<TSchema extends z.ZodObject<z.ZodRawShape>>(
  options: CreateEnvOptions<TSchema>
): () => z.infer<TSchema> {
  const {
    schema,
    runtimeEnv = process.env,
    cache = true,
    codegenFallback = false,
  } = options;
  let cached: z.infer<TSchema> | undefined;

  return () => {
    if (cache && cached) {
      return cached;
    }
    // Apply schema fallback when the CLI's sentinel is set.
    // We use globalThis rather than process.env so Convex's auth-config env-var
    // scanner never sees a process.env reference for this internal key.
    // The CLI sets this exclusively during the Node.js jiti parse in `better-convex dev`,
    // so the fallback never fires at actual Convex runtime — where a missing required
    // var must still throw "Invalid environment variables".
    // codegenFallback keeps its role as an explicit opt-in for custom setups that
    // need to replicate this behavior outside of the CLI.
    const isCodegenParse =
      (globalThis as Record<string, unknown>).__BETTER_CONVEX_CODEGEN__ ===
        true || codegenFallback;
    const envForParse = isCodegenParse
      ? {
          ...Object.fromEntries(
            Object.entries(schema.shape).map(([key, zodType]) => {
              const result = (zodType as z.ZodType).safeParse(undefined);
              if (!result.success) {
                // Use first allowed value for enums so parse succeeds when Convex env is not in process.env
                if (
                  zodType instanceof z.ZodEnum &&
                  Array.isArray(zodType.options) &&
                  zodType.options.length > 0
                )
                  return [key, zodType.options[0]];
                return [key, ''];
              }
              return [
                key,
                typeof result.data === 'string' ? result.data : undefined,
              ];
            })
          ),
          ...runtimeEnv,
        }
      : runtimeEnv;

    const parsed = schema.safeParse(envForParse);

    if (!parsed.success) {
      throw new CRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Invalid environment variables',
      });
    }

    if (cache) {
      cached = parsed.data;
    }

    return parsed.data;
  };
}
