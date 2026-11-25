#!/usr/bin/env node
/**
 * Create or reset the owner account. There is deliberately no public
 * sign-up endpoint (PROJECT.md §9), so accounts are created from here.
 *
 *   npm run owner:create -w @axs/api -- --email you@example.com            # local D1
 *   npm run owner:create -w @axs/api -- --email you@example.com --remote   # production D1
 *
 * The password is read from a hidden prompt (never a CLI argument, so it
 * stays out of shell history), hashed here, and only the hash is sent to
 * D1. The format must match src/lib/password.ts.
 */
import { execFileSync } from 'node:child_process';
import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';

const PBKDF2_ITERATIONS = 100_000;
const MIN_PASSWORD_LENGTH = 12;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hiddenPrompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) {
        stdout.write(question);
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write('\n');
      resolve(answer);
    });
  });
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

const email = arg('email')?.trim().toLowerCase();
const remote = process.argv.includes('--remote');
if (!email || !/^[^\s@'"]+@[^\s@'"]+\.[^\s@'"]+$/.test(email)) {
  console.error('Usage: create-owner.mjs --email you@example.com [--remote]');
  process.exit(1);
}
if (!stdin.isTTY) {
  console.error('Run this in an interactive terminal so the password can be entered privately.');
  process.exit(1);
}

const password = await hiddenPrompt('Password: ');
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
if ((await hiddenPrompt('Repeat password: ')) !== password) {
  console.error('Passwords do not match.');
  process.exit(1);
}

const now = new Date().toISOString();
// Values are validated above (email has no quotes; hash is base64 + '$').
const sql = `INSERT INTO users (id, email, password_hash, created_at, updated_at)
VALUES ('${randomUUID()}', '${email}', '${hashPassword(password)}', '${now}', '${now}')
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at;
UPDATE refresh_tokens SET revoked_at = '${now}'
WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = '${email}');`;

const target = remote ? ['--remote', '--env', 'production'] : ['--local'];
execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', ...target, '--command', sql], {
  stdio: 'inherit',
});
console.log(`Owner account ${email} is set${remote ? ' in production' : ' locally'}. Existing sign-ins were revoked.`);
