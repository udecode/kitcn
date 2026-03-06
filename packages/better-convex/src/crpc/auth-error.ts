/**
 * Auth Mutation Error
 *
 * Framework-agnostic error class for Better Auth mutations.
 */

/**
 * Error thrown when a Better Auth mutation fails.
 * Contains the original error details from Better Auth.
 */
export class AuthMutationError extends Error {
  /** Error code from Better Auth (e.g., 'INVALID_PASSWORD', 'EMAIL_ALREADY_REGISTERED') */
  code?: string;
  /** HTTP status code */
  status: number;
  /** HTTP status text */
  statusText: string;

  constructor(authError: {
    message?: string;
    status: number;
    statusText: string;
    code?: string;
  }) {
    super(authError.message || authError.statusText);
    this.name = 'AuthMutationError';
    this.code = authError.code;
    this.status = authError.status;
    this.statusText = authError.statusText;
  }
}

/**
 * Type guard to check if an error is an AuthMutationError.
 */
export function isAuthMutationError(
  error: unknown
): error is AuthMutationError {
  return error instanceof AuthMutationError;
}
