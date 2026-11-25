import { base64ToBytes, bytesToBase64, randomBytes, timingSafeEqual } from './encoding';

/**
 * Password hashes are stored as
 *   pbkdf2_sha256$<iterations>$<salt base64>$<hash base64>
 * so the work factor can be raised later without breaking old hashes.
 *
 * 100,000 iterations is the maximum Cloudflare Workers' WebCrypto PBKDF2
 * accepts. OWASP recommends more for PBKDF2-SHA256; this is the strongest
 * setting the platform allows. scripts/create-owner.mjs must use the same
 * format.
 */
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const PREFIX = 'pbkdf2_sha256';

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(password, salt, iterations);
  return `${PREFIX}$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    return false;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PBKDF2_ITERATIONS) {
    return false;
  }
  const expected = base64ToBytes(parts[3]!);
  const actual = await derive(password, base64ToBytes(parts[2]!), iterations);
  return timingSafeEqual(actual, expected);
}

/**
 * A valid hash of a random password, verified against when the email is
 * unknown so response time does not reveal which accounts exist.
 */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(bytesToBase64(randomBytes(16)));
  return dummyHash;
}
