import type {
  DefaultFunctionArgs,
  FunctionReference,
  RegisteredAction,
  RegisteredMutation,
  RegisteredQuery,
} from 'convex/server';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { CRPCFunctionTypeHint } from './builder';

type ApiFunctionType = 'query' | 'mutation' | 'action';

type InferArgsFromExport<TExport> =
  TExport extends CRPCFunctionTypeHint<infer TArgs, any>
    ? TArgs
    : TExport extends FunctionReference<any, any, infer TArgs, any>
      ? TArgs
      : TExport extends
            | RegisteredQuery<any, infer TArgs, any>
            | RegisteredMutation<any, infer TArgs, any>
            | RegisteredAction<any, infer TArgs, any>
        ? TArgs
        : never;

type InferReturnFromExport<TExport> =
  TExport extends CRPCFunctionTypeHint<any, infer TReturn>
    ? Awaited<TReturn>
    : TExport extends FunctionReference<any, any, any, infer TReturn>
      ? Awaited<TReturn>
      : TExport extends
            | RegisteredQuery<any, any, infer TReturn>
            | RegisteredMutation<any, any, infer TReturn>
            | RegisteredAction<any, any, infer TReturn>
        ? Awaited<TReturn>
        : never;

type CoerceArgs<TArgs> = TArgs extends DefaultFunctionArgs
  ? TArgs
  : TArgs extends Record<string, any>
    ? TArgs
    : Record<string, never>;

type ApiFunctionRefFromExport<
  TType extends ApiFunctionType,
  TExport,
> = FunctionReference<
  TType,
  'public',
  CoerceArgs<InferArgsFromExport<TExport>>,
  InferReturnFromExport<TExport>
>;

type ApiFunctionLeafMeta = {
  type: ApiFunctionType;
  auth?: 'required' | 'optional';
  [key: string]: unknown;
};

/**
 * Build a generated API leaf from a Convex FunctionReference name.
 * Returns a plain FunctionReference-compatible object with attached cRPC metadata.
 */
export function createApiLeaf<
  TType extends ApiFunctionType,
  TExport,
  TMeta extends ApiFunctionLeafMeta = ApiFunctionLeafMeta,
>(
  fn: unknown,
  meta: TMeta
): ApiFunctionRefFromExport<TType, TExport> &
  TMeta & {
    functionRef: ApiFunctionRefFromExport<TType, TExport>;
  } {
  const functionRef = makeFunctionReference<
    TType,
    CoerceArgs<InferArgsFromExport<TExport>>,
    InferReturnFromExport<TExport>
  >(
    getFunctionName(
      fn as unknown as FunctionReference<'query' | 'mutation' | 'action'>
    )
  ) as ApiFunctionRefFromExport<TType, TExport>;

  return Object.assign(functionRef, meta, {
    functionRef,
  });
}
