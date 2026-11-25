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
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      request_id: c.get('requestId') ?? 'unknown',
      ...(issues && issues.length > 0 ? { issues } : {}),
    },
  };
  return c.json(body, status);
}
