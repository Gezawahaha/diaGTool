import type { DB } from '@op-engineering/op-sqlite';
import type { SqlDatabase, SqlExecutor, SqlRow, SqlValue } from './sql';

export const DATABASE_NAME = 'axs-diagnostic-lab.db';

function adapt(executor: Pick<DB, 'execute'>): SqlExecutor {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      const result = await executor.execute(sql, params);
      return { rows: result.rows as SqlRow[], rowsAffected: result.rowsAffected };
    },
  };
}

/** Open the app database on the device. */
export function openDeviceDatabase(): SqlDatabase {
  // Required lazily so Jest never loads the native module.
  const { open } = require('@op-engineering/op-sqlite') as typeof import('@op-engineering/op-sqlite');
  const db = open({ name: DATABASE_NAME });
  return {
    ...adapt(db),
    transaction: (fn) => db.transaction((tx) => fn(adapt(tx))),
  };
}
