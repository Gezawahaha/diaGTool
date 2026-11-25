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
  | 'STORAGE_UNAVAILABLE'
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

// ---------------------------------------------------------------------------
// Auth (POST /api/v1/auth/login | /refresh)
// ---------------------------------------------------------------------------

export interface TokenResponse {
  token_type: 'Bearer';
  access_token: string;
  /** Access token lifetime in seconds. */
  expires_in: number;
  refresh_token: string;
  refresh_expires_at: string;
}

// ---------------------------------------------------------------------------
// Sync (POST /api/v1/sync/batch)
// ---------------------------------------------------------------------------

export type SyncRejectionReason =
  /** Failed schema validation. */
  | 'INVALID'
  /** The parent device/session is missing or belongs to someone else. */
  | 'PARENT_NOT_FOUND'
  /** The ID is already used by a record that is not the caller's. */
  | 'ID_CONFLICT';

export interface SyncRejection {
  /** Position in the submitted array, or -1 for records that passed validation. */
  index: number;
  id: string | null;
  reason: SyncRejectionReason;
  detail?: string;
}

export interface SyncBatchResponse {
  batch_id: string;
  /** True if this batch_id was processed before (a retry). */
  replayed: boolean;
  devices: { accepted: string[]; rejected: SyncRejection[] };
  sessions: { accepted: string[]; rejected: SyncRejection[] };
  events: { accepted: string[]; duplicate: string[]; rejected: SyncRejection[] };
}

/**
 * Wire fields of synced records. The Worker's schemas and the mobile outbox
 * are both tested against these lists, so the two sides cannot drift.
 */
export const SYNC_DEVICE_FIELDS = [
  'id',
  'ble_identifier',
  'display_name',
  'advertised_name',
  'device_role',
  'identification_confidence',
  'identification_notes',
  'created_at',
  'updated_at',
] as const;

export const SYNC_SESSION_FIELDS = [
  'id',
  'device_id',
  'session_type',
  'started_at',
  'ended_at',
  'status',
  'app_version',
  'notes',
] as const;

export const SYNC_EVENT_FIELDS = [
  'id',
  'session_id',
  'device_id',
  'event_type',
  'observed_at',
  'recorded_at',
  'source',
  'description',
  'rssi',
  'connection_state',
  'service_uuid',
  'characteristic_uuid',
  'raw_payload_hex',
  'metadata_json',
] as const;
