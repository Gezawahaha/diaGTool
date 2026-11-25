import { base64UrlToBytes, bytesToBase64Url } from './encoding';

/**
 * Minimal HS256 JWT for short-lived access tokens. Verification checks the
 * algorithm, signature, issuer, audience and expiry (PROJECT.md §10).
 */
export const TOKEN_ISSUER = 'axs-diagnostic-lab-api';
export const TOKEN_AUDIENCE = 'axs-diagnostic-lab-mobile';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Tolerated clock skew when checking exp/iat. */
const CLOCK_SKEW_SECONDS = 30;

export interface AccessClaims {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

const encoder = new TextEncoder();

function encodeJson(value: unknown): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(value)));
}

async function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error('TOKEN_SIGNING_SECRET must be at least 32 characters.');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export async function signAccessToken(
  userId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<{ token: string; expiresIn: number }> {
  const claims: AccessClaims = {
    sub: userId,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const signingInput = `${encodeJson({ alg: 'HS256', typ: 'JWT' })}.${encodeJson(claims)}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret, 'sign'),
    encoder.encode(signingInput),
  );
  return {
    token: `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Returns the claims, or null for any invalid, expired or foreign token. */
export async function verifyAccessToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<AccessClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(headerPart)));
    // Reject "none" and any algorithm other than the one we issue.
    if (header?.alg !== 'HS256') {
      return null;
    }
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret, 'verify'),
      base64UrlToBytes(signaturePart),
      encoder.encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) {
      return null;
    }
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as AccessClaims;
    if (
      claims.iss !== TOKEN_ISSUER ||
      claims.aud !== TOKEN_AUDIENCE ||
      typeof claims.sub !== 'string' ||
      typeof claims.exp !== 'number' ||
      claims.exp + CLOCK_SKEW_SECONDS <= nowSeconds ||
      (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_SECONDS > nowSeconds)
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
