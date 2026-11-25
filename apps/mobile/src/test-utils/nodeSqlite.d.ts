import type { SqlDatabase } from '../storage/sql';

export function openMemoryDatabase(): SqlDatabase & { close(): void };
