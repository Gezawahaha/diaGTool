import { createMiddleware } from 'hono/factory';
import { ApiError } from '../lib/errors';
import { verifyAccessToken } from '../lib/jwt';
import type { AppBindings } from '../types/env';

/** Require a valid access token and expose its subject as `userId`. */
export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  const claims = match ? await verifyAccessToken(match[1]!, c.env.TOKEN_SIGNING_SECRET) : null;
  if (!claims) {
    throw new ApiError(401, 'UNAUTHORIZED', 'A valid access token is required.');
  }
  c.set('userId', claims.sub);
  await next();
});
