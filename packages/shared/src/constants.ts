/**
 * Enumerations defined in PROJECT.md. Keep these in sync with the spec;
 * they are shared by the mobile app and the Worker so both validate the
 * same values.
 */

export const API_VERSION = 'v1';

/**
 * PROJECT.md §8, Module 6 — diagnostic event types, plus two additions so
 * every connection outcome is recorded without mislabelling it:
 * - CONNECTION_FAILED: an attempt that errored or timed out.
 * - DISCONNECT_REQUESTED: the user disconnected, so the following
 *   disconnect is expected and is not logged as CONNECTION_LOST.
 */
export const EVENT_TYPES = [
  'DEVICE_DISCOVERED',
  'CONNECTION_ATTEMPTED',
  'CONNECTION_ESTABLISHED',
  'CONNECTION_FAILED',
  'CONNECTION_LOST',
  'DISCONNECT_REQUESTED',
  'GATT_DISCOVERED',
  'CHARACTERISTIC_READ',
  'NOTIFICATION_RECEIVED',
  'RSSI_SAMPLE',
  'MANUAL_WAKE_MARKER',
  'USER_REPORTED_UNRESPONSIVE',
  'RECONNECTION_ATTEMPT',
  'SYNC_QUEUED',
  'SYNC_SUCCEEDED',
  'SYNC_FAILED',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Whether an event was observed by the app or entered by the user. */
export const EVENT_SOURCES = ['AUTOMATIC_OBSERVATION', 'USER_MARKER'] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

/** PROJECT.md §4.6 — identification confidence. */
export const IDENTIFICATION_CONFIDENCE = [
  'CONFIRMED',
  'HIGH',
  'MEDIUM',
  'LOW',
  'UNKNOWN',
] as const;
export type IdentificationConfidence =
  (typeof IDENTIFICATION_CONFIDENCE)[number];

export const VERIFICATION_STATUSES = [
  'VERIFIED',
  'PARTIALLY_VERIFIED',
  'UNVERIFIED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** PROJECT.md §4.3 — component types. */
export const COMPONENT_TYPES = [
  'FRONT_DERAILLEUR',
  'REAR_DERAILLEUR',
  'LEFT_SHIFTER',
  'RIGHT_SHIFTER',
  'AXS_CONTROLLER',
  'POWER_METER',
  'OTHER',
] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

/** PROJECT.md §8, Module 7 — device roles for comparison. */
export const DEVICE_ROLES = ['FAULTY', 'REFERENCE', 'UNASSIGNED'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

/** PROJECT.md §8, Module 6 — test scenarios a session records. */
export const SESSION_TYPES = [
  'GENERAL',
  'INITIAL_POWER',
  'IDLE_MONITOR',
  'MANUAL_WAKE',
] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

/**
 * INTERRUPTED: the app stopped (crash, force-close) while the session was
 * active, so its end time is unknown.
 */
export const SESSION_STATUSES = ['ACTIVE', 'COMPLETED', 'INTERRUPTED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** PROJECT.md §12 — outbox state of a locally stored record. */
export const SYNC_STATUSES = ['PENDING', 'SYNCED', 'REJECTED'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** PROJECT.md §8, Module 7 — comparison labels. */
export const COMPARISON_LABELS = [
  'IDENTICAL',
  'DIFFERENT',
  'A_ONLY',
  'B_ONLY',
  'NOT_OBSERVABLE',
] as const;
export type ComparisonLabel = (typeof COMPARISON_LABELS)[number];
