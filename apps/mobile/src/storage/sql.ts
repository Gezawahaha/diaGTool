/**
 * Minimal SQL surface the repositories depend on. The app adapts op-sqlite
 * to it; unit tests adapt Node's built-in SQLite, so repository SQL runs
 * against a real engine in tests.
 */
export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;

export interface SqlResult {
  rows: SqlRow[];
  rowsAffected: number;
}

export interface SqlExecutor {
  execute(sql: string, params?: SqlValue[]): Promise<SqlResult>;
}

export interface SqlDatabase extends SqlExecutor {
  /** Run `fn` atomically: commit if it resolves, roll back if it throws. */
  transaction(fn: (tx: SqlExecutor) => Promise<void>): Promise<void>;
}

export function str(row: SqlRow, column: string): string {
  const v = row[column];
  if (typeof v !== 'string') {
    throw new Error(`Column ${column} is not a string.`);
  }
  return v;
}

export function optStr(row: SqlRow, column: string): string | null {
  const v = row[column];
  return v === null || v === undefined ? null : String(v);
}

export function optNum(row: SqlRow, column: string): number | null {
  const v = row[column];
  return v === null || v === undefined ? null : Number(v);
}
