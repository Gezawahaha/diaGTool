import { API_VERSION, type DependencyStatus, type HealthResponse } from '@axs/shared';
import { Hono } from 'hono';
import type { AppBindings } from '../types/env';

export const health = new Hono<AppBindings>();

health.get('/', async (c) => {
  // `SELECT 1` touches no table, so it costs no D1 rows read.
  let database: DependencyStatus = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch (err) {
    database = 'error';
    console.error('health: database check failed', {
      requestId: c.get('requestId'),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const body: HealthResponse = {
    status: database === 'ok' ? 'ok' : 'degraded',
    api_version: API_VERSION,
    environment: c.env.ENVIRONMENT,
    time: new Date().toISOString(),
    checks: { database },
  };
  return c.json(body, database === 'ok' ? 200 : 503);
});
