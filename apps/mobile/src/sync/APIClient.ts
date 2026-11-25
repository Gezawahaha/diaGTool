import type { ApiErrorBody } from '@axs/shared';

export const REQUEST_TIMEOUT_MS = 20_000;

/**
 * A failed API call. `temporary` failures (network, timeouts, 5xx, 429)
 * are retried later; the others need a change before retrying.
 */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly temporary: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export class APIClient {
  constructor(
    private readonly baseUrl: () => string | null,
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
  ) {}

  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; accessToken?: string } = {},
  ): Promise<T> {
    const base = this.baseUrl();
    if (!base) {
      throw new ApiRequestError('No API server configured.', null, 'NOT_CONFIGURED', false);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/api/v1${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      const timedOut = controller.signal.aborted;
      throw new ApiRequestError(
        timedOut ? 'The server did not respond in time.' : 'Network unavailable.',
        null,
        timedOut ? 'TIMEOUT' : 'NETWORK',
        true,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) {
      return undefined as T;
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON response (e.g. a proxy error page); handled below.
    }
    if (res.ok) {
      return body as T;
    }

    const error = (body as ApiErrorBody | null)?.error;
    const retryHeader = Number(res.headers.get('retry-after'));
    throw new ApiRequestError(
      error?.message ?? `Request failed with HTTP ${res.status}.`,
      res.status,
      error?.code ?? `HTTP_${res.status}`,
      res.status === 429 || res.status >= 500,
      Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : null,
    );
  }
}
