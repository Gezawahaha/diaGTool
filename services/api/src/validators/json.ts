import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError } from '../lib/errors';
import type { AppBindings } from '../types/env';

/**
 * Parse and validate a JSON request body. Throws ApiError so the global
 * error handler produces the standard error format.
 */
export async function parseJsonBody<S extends z.ZodType>(
  c: Context<AppBindings>,
  schema: S,
): Promise<z.output<S>> {
  const contentType = c.req.header('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Request body must be application/json.',
    );
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiError(400, 'BAD_REQUEST', 'Request body is not valid JSON.');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      422,
      'VALIDATION_FAILED',
      'Request body failed validation.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}
