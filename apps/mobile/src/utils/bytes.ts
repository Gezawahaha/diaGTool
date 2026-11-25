/** Lowercase hex without separators, e.g. [0x0a, 0xff] → "0aff". */
export function bytesToHex(bytes: readonly number[]): string {
  let out = '';
  for (const b of bytes) {
    // eslint-disable-next-line no-bitwise -- clamp to one byte
    out += (b & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}

/** Group hex into bytes for display: "0aff10" → "0a ff 10". */
export function formatHex(hex: string): string {
  return hex.match(/.{1,2}/g)?.join(' ') ?? '';
}
