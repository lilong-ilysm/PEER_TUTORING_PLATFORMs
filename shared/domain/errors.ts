/**
 * Domain error codes. Shared by the Lambda handlers and the browser adapters so
 * that the UI can react to the same code regardless of which backend produced it.
 */
export const DomainErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  /** The slot was taken between the user loading the page and submitting. */
  SLOT_CONFLICT: 'SLOT_CONFLICT',
  DUPLICATE_REQUEST: 'DUPLICATE_REQUEST',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ALREADY_REVIEWED: 'ALREADY_REVIEWED',
  SLOT_IN_PAST: 'SLOT_IN_PAST',
  EMAIL_IN_USE: 'EMAIL_IN_USE',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INTERNAL: 'INTERNAL',
} as const;

export type DomainErrorCode =
  (typeof DomainErrorCode)[keyof typeof DomainErrorCode];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly field?: string;

  constructor(code: DomainErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.field = field;
  }

  toJSON() {
    return { code: this.code, message: this.message, field: this.field };
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}

/**
 * Maps any thrown value to a user-facing message. Deliberately avoids leaking
 * internal detail for unexpected errors.
 */
export function toUserMessage(err: unknown): string {
  if (isDomainError(err)) return err.message;
  if (err instanceof Error && err.message) {
    // Amplify/AppSync surfaces our DomainError code inside the GraphQL error
    // message; recover the readable half when present.
    const match = /\[(?:[A-Z_]+)\]\s*(.+)/.exec(err.message);
    if (match?.[1]) return match[1];
  }
  return 'Something went wrong. Please try again.';
}

/** Extracts a domain error code from a raw error, including GraphQL wrappers. */
export function extractErrorCode(err: unknown): DomainErrorCode {
  if (isDomainError(err)) return err.code;
  const message = err instanceof Error ? err.message : String(err ?? '');
  const match = /\[([A-Z_]+)\]/.exec(message);
  const code = match?.[1];
  if (code && code in DomainErrorCode) {
    return DomainErrorCode[code as keyof typeof DomainErrorCode];
  }
  return DomainErrorCode.INTERNAL;
}
