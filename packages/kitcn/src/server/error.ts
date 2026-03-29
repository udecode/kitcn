/**
 * CRPC Error - tRPC-style error handling for Convex
 *
 * Extends ConvexError with typed error codes and HTTP status mapping.
 */
import { ConvexError } from 'convex/values';

// =============================================================================
// Error Codes (from tRPC)
// =============================================================================

/** JSON-RPC 2.0 error codes (tRPC-style) */
export const CRPC_ERROR_CODES_BY_KEY = {
  PARSE_ERROR: -32_700,
  BAD_REQUEST: -32_600,
  INTERNAL_SERVER_ERROR: -32_603,
  NOT_IMPLEMENTED: -32_603,
  BAD_GATEWAY: -32_603,
  SERVICE_UNAVAILABLE: -32_603,
  GATEWAY_TIMEOUT: -32_603,
  UNAUTHORIZED: -32_001,
  PAYMENT_REQUIRED: -32_002,
  FORBIDDEN: -32_003,
  NOT_FOUND: -32_004,
  METHOD_NOT_SUPPORTED: -32_005,
  TIMEOUT: -32_008,
  CONFLICT: -32_009,
  PRECONDITION_FAILED: -32_012,
  PAYLOAD_TOO_LARGE: -32_013,
  UNSUPPORTED_MEDIA_TYPE: -32_015,
  UNPROCESSABLE_CONTENT: -32_022,
  PRECONDITION_REQUIRED: -32_028,
  TOO_MANY_REQUESTS: -32_029,
  CLIENT_CLOSED_REQUEST: -32_099,
} as const;

export type CRPCErrorCode = keyof typeof CRPC_ERROR_CODES_BY_KEY;

// =============================================================================
// HTTP Status Code Mapping
// =============================================================================

/** Map error codes to HTTP status codes */
export const CRPC_ERROR_CODE_TO_HTTP: Record<CRPCErrorCode, number> = {
  PARSE_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_SUPPORTED: 405,
  TIMEOUT: 408,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_CONTENT: 422,
  PRECONDITION_REQUIRED: 428,
  TOO_MANY_REQUESTS: 429,
  CLIENT_CLOSED_REQUEST: 499,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

// =============================================================================
// CRPCError Class
// =============================================================================

type CRPCErrorData = {
  code: CRPCErrorCode;
  message: string;
};

/** Extract Error from unknown cause (from tRPC) */
function getCauseFromUnknown(cause: unknown): Error | undefined {
  if (cause instanceof Error) return cause;
  if (
    typeof cause === 'undefined' ||
    typeof cause === 'function' ||
    cause === null
  ) {
    return;
  }
  if (typeof cause !== 'object') return new Error(String(cause));
  return;
}

/**
 * tRPC-style error extending ConvexError
 *
 * @example
 * ```typescript
 * throw new CRPCError({
 *   code: 'BAD_REQUEST',
 *   message: 'Invalid input',
 *   cause: originalError,
 * });
 * ```
 */
export class CRPCError extends ConvexError<CRPCErrorData> {
  readonly code: CRPCErrorCode;
  override readonly cause?: Error;

  constructor(opts: {
    code: CRPCErrorCode;
    message?: string;
    cause?: unknown;
  }) {
    const cause = getCauseFromUnknown(opts.cause);
    const message = opts.message ?? cause?.message ?? opts.code;

    super({ code: opts.code, message });

    this.name = 'CRPCError';
    this.code = opts.code;
    this.cause = cause;
    // ConvexError formats the Error message from `data` by default.
    // For cRPC we want the standard Error message string to match `data.message`.
    this.message = message;
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function isOrmNotFoundErrorLike(cause: unknown): cause is Error {
  return cause instanceof Error && cause.name === 'OrmNotFoundError';
}

type APIErrorLike = Error & {
  status?: unknown;
  statusCode?: unknown;
  body?: unknown;
};

function isApiErrorLike(cause: unknown): cause is APIErrorLike {
  return (
    cause instanceof Error &&
    cause.name === 'APIError' &&
    typeof (cause as APIErrorLike).statusCode === 'number'
  );
}

function mapHttpStatusCodeToCRPCCode(statusCode: number): CRPCErrorCode {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 402:
      return 'PAYMENT_REQUIRED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_SUPPORTED';
    case 408:
      return 'TIMEOUT';
    case 409:
      return 'CONFLICT';
    case 412:
      return 'PRECONDITION_FAILED';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 422:
      return 'UNPROCESSABLE_CONTENT';
    case 428:
      return 'PRECONDITION_REQUIRED';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 499:
      return 'CLIENT_CLOSED_REQUEST';
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

function getApiErrorMessage(cause: APIErrorLike): string {
  const body = cause.body;
  if (body && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  if (typeof cause.message === 'string' && cause.message.length > 0) {
    return cause.message;
  }
  return 'Request failed';
}

/**
 * Convert known framework/library errors into CRPCError.
 *
 * Intended for cRPC internals so callers don't need per-endpoint try/catch.
 */
export function toCRPCError(cause: unknown): CRPCError | null {
  if (cause instanceof CRPCError) return cause;
  if (cause instanceof Error && cause.name === 'CRPCError') {
    return cause as CRPCError;
  }

  if (isOrmNotFoundErrorLike(cause)) {
    const err = new CRPCError({
      code: 'NOT_FOUND',
      message: cause.message,
      cause,
    });
    if (cause.stack) err.stack = cause.stack;
    return err;
  }

  if (isApiErrorLike(cause)) {
    const status = cause.status;
    const statusCode = cause.statusCode;

    const code =
      typeof status === 'string' && status in CRPC_ERROR_CODES_BY_KEY
        ? (status as CRPCErrorCode)
        : typeof statusCode === 'number'
          ? mapHttpStatusCodeToCRPCCode(statusCode)
          : 'INTERNAL_SERVER_ERROR';

    const err = new CRPCError({
      code,
      message: getApiErrorMessage(cause),
      cause,
    });
    if (cause.stack) err.stack = cause.stack;
    return err;
  }

  return null;
}

/**
 * Wrap unknown error in CRPCError (from tRPC)
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   throw getCRPCErrorFromUnknown(error);
 * }
 * ```
 */
export function getCRPCErrorFromUnknown(cause: unknown): CRPCError {
  const handled = toCRPCError(cause);
  if (handled) return handled;

  const error = new CRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    cause,
  });

  if (cause instanceof Error && cause.stack) {
    error.stack = cause.stack;
  }

  return error;
}

/**
 * Get HTTP status code from CRPCError
 *
 * @example
 * ```typescript
 * const httpStatus = getHTTPStatusCodeFromError(error); // 400
 * ```
 */
export function getHTTPStatusCodeFromError(error: CRPCError): number {
  return CRPC_ERROR_CODE_TO_HTTP[error.code] ?? 500;
}

/** Type guard for CRPCError */
export function isCRPCError(error: unknown): error is CRPCError {
  return error instanceof CRPCError;
}
