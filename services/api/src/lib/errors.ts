import type { ApiErrorBody, ApiErrorCode, ApiErrorIssue } from '@axs/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppBindings } from '../types/env';

/** An error that maps directly onto the API's JSON error format. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues?: ApiErrorIssue[],
    /** Sent as Retry-After (seconds) for retryable errors. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorResponse(
  c: Context<AppBindings>,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  issues?: ApiErrorIssue[],
  retryAfterSeconds?: number,
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      request_id: c.get('requestId') ?? 'unknown',
      ...(issues && issues.length > 0 ? { issues } : {}),
    },
  };
  if (retryAfterSeconds !== undefined) {
    c.header('Retry-After', String(retryAfterSeconds));
  }
  return c.json(body, status);
}
