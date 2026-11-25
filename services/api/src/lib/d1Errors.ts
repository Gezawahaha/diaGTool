import { ApiError } from './errors';

/** Seconds until the next 00:00 UTC, when D1 free-tier daily limits reset. */
export function secondsUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Map a D1 failure to a retryable API error. Cloudflare enforces free-tier
 * daily read/write limits by failing queries until the daily reset
 * (PROJECT.md §6.2). The exact error text is not documented, so detection
 * is a best-effort match; anything else is reported as temporarily
 * unavailable. Either way clients keep their records and retry later.
 */
export function toStorageError(err: unknown): ApiError {
  const message = err instanceof Error ? err.message : String(err);
  if (/(daily|quota|limit).*(exceed|reached)|exceed.*(limit|quota)/i.test(message)) {
    return new ApiError(
      429,
      'QUOTA_EXCEEDED',
      'Cloud storage quota reached for today. Records are kept on the device; retry after the daily reset.',
      undefined,
      secondsUntilUtcMidnight(),
    );
  }
  return new ApiError(
    503,
    'STORAGE_UNAVAILABLE',
    'Cloud storage is temporarily unavailable. Retry later.',
    undefined,
    30,
  );
}
