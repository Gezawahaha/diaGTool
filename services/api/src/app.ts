import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { ApiError, errorResponse } from './lib/errors';
import { health } from './routes/health';
import type { AppBindings } from './types/env';

/** Upper bound for any request body. Batch endpoints may set lower limits. */
export const MAX_BODY_BYTES = 256 * 1024;

export function createApp() {
  const app = new Hono<AppBindings>();

  app.use('*', requestId());
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new ApiError(
          413,
          'PAYLOAD_TOO_LARGE',
          `Request body exceeds ${MAX_BODY_BYTES} bytes.`,
        );
      },
    }),
  );

  const v1 = new Hono<AppBindings>();
  v1.route('/health', health);
  app.route('/api/v1', v1);

  app.notFound((c) => errorResponse(c, 404, 'NOT_FOUND', 'Route not found.'));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return errorResponse(c, err.status, err.code, err.message, err.issues);
    }
    // Never log request bodies or headers here: they may carry tokens.
    console.error('unhandled error', {
      requestId: c.get('requestId'),
      error: err.message,
    });
    return errorResponse(c, 500, 'INTERNAL_ERROR', 'Internal server error.');
  });

  return app;
}
