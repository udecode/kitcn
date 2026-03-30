import {
  CRPCClientError,
  defaultIsUnauthorized,
  isCRPCClientError,
  isCRPCError,
} from './error';
import { isHttpClientError } from './http-types';
import * as crpc from './index';
import {
  convexAction,
  convexInfiniteQueryOptions,
  convexQuery,
} from './query-options';
import { decodeWire, encodeWire } from './transformer';
import { FUNC_REF_SYMBOL } from './types';

test('barrel exports runtime members from crpc modules', () => {
  expect(crpc.CRPCClientError).toBe(CRPCClientError);
  expect(crpc.isCRPCClientError).toBe(isCRPCClientError);
  expect(crpc.isCRPCError).toBe(isCRPCError);
  expect(crpc.defaultIsUnauthorized).toBe(defaultIsUnauthorized);
  expect(crpc.encodeWire).toBe(encodeWire);
  expect(crpc.decodeWire).toBe(decodeWire);
  expect(crpc.isHttpClientError).toBe(isHttpClientError);
  expect(crpc.convexQuery).toBe(convexQuery);
  expect(crpc.convexAction).toBe(convexAction);
  expect(crpc.convexInfiniteQueryOptions).toBe(convexInfiniteQueryOptions);
  expect(crpc.FUNC_REF_SYMBOL).toBe(FUNC_REF_SYMBOL);
});
