import { applyD1Migrations, env } from 'cloudflare:test';

// Setup files run before each test file; applyD1Migrations skips migrations
// that are already applied, so this is safe to repeat.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
