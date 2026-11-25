import type { GattProfile } from './types';

/**
 * Canonical form of a GATT layout: UUIDs lowercased and sorted, discovery
 * time and device ID excluded. Two devices with the same layout produce
 * the same string, which is what profile comparison needs.
 */
export function canonicalGattLayout(profile: GattProfile): string {
  const services = profile.services
    .map((s) => ({
      uuid: s.uuid.toLowerCase(),
      characteristics: s.characteristics
        .map((c) => ({
          uuid: c.uuid.toLowerCase(),
          properties: Object.keys(c.properties)
            .filter((k) => c.properties[k as keyof typeof c.properties])
            .sort(),
          descriptors: c.descriptorUUIDs.map((d) => d.toLowerCase()).sort(),
        }))
        .sort((a, b) => a.uuid.localeCompare(b.uuid)),
    }))
    .sort((a, b) => a.uuid.localeCompare(b.uuid));
  return JSON.stringify(services);
}

/**
 * 53-bit non-cryptographic hash (cyrb53) as 14 hex digits. Used only to
 * deduplicate identical layouts, never for security.
 */
function cyrb53(input: string): string {
  /* eslint-disable no-bitwise -- hash mixing */
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  /* eslint-enable no-bitwise */
  return value.toString(16).padStart(14, '0');
}

export function gattProfileHash(profile: GattProfile): string {
  return cyrb53(canonicalGattLayout(profile));
}
