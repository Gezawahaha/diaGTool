/**
 * SqlDatabase backed by Node's built-in SQLite (node:sqlite), so repository
 * tests run real SQL. Plain JS because the app's TypeScript config has no
 * Node type definitions.
 */
const { DatabaseSync } = require('node:sqlite');

function openMemoryDatabase() {
  const db = new DatabaseSync(':memory:');
  // Serialise all access, as op-sqlite does with its native queue.
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const executeNow = (sql, params = []) => {
    const statement = db.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      return { rows: statement.all(...params).map((r) => ({ ...r })), rowsAffected: 0 };
    }
    const info = statement.run(...params);
    return { rows: [], rowsAffected: Number(info.changes) };
  };
  const executor = { execute: async (sql, params) => executeNow(sql, params) };

  return {
    execute: (sql, params) => enqueue(() => executeNow(sql, params)),
    transaction: (fn) =>
      enqueue(async () => {
        db.exec('BEGIN');
        try {
          await fn(executor);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      }),
    close: () => db.close(),
  };
}

module.exports = { openMemoryDatabase };
