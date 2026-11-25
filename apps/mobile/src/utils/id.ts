/**
 * RFC 4122 v4 UUID. Uses the platform's crypto.randomUUID when present;
 * otherwise falls back to Math.random, which is adequate for record IDs
 * (collision resistance, not secrecy, is what matters here).
 */
export function uuidv4(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  /* eslint-disable no-bitwise -- RFC 4122 version/variant bits */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
  /* eslint-enable no-bitwise */
}
