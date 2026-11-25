/** Wire format shared by the Worker API and its clients. */

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INTERNAL_ERROR';

export interface ApiErrorIssue {
  /** Dotted path into the request body, e.g. `events.3.event_type`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    request_id: string;
    issues?: ApiErrorIssue[];
  };
}

export type DependencyStatus = 'ok' | 'error';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  api_version: string;
  environment: string;
  time: string;
  checks: {
    database: DependencyStatus;
  };
}
