declare module "better-sqlite3" {
  type RunResult = {
    changes: number;
    lastInsertRowid: bigint | number;
  };

  class Database {
    constructor(filename: string);
    pragma(value: string): void;
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: unknown[]): RunResult;
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
    };
  }

  export default Database;
}
