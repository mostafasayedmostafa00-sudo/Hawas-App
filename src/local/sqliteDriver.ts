import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { initializeSchemaAndDefaults, type SqlDriver } from './schema.ts';

const IDB_NAME = 'bsc_offline_sqlite_store';
const IDB_STORE = 'db_blobs';
const IDB_KEY = 'brain_sculpting_camp_sqlite_v1';

let driverPromise: Promise<SqlDriver> | null = null;
let customDriverOverride: SqlDriver | null = null;

export function setCustomSqlDriver(driver: SqlDriver | null): void {
  customDriverOverride = driver;
  driverPromise = null;
}

class AsyncWriteQueue {
  private chain: Promise<void> = Promise.resolve();
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readDbBytesFromIdb(): Promise<Uint8Array | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openIdb();
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const res = req.result;
        resolve(res ? new Uint8Array(res) : null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeDbBytesToIdb(bytes: Uint8Array): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes.slice().buffer, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // fallback silently if IDB unavailable
  }
}

class CapacitorSqliteDriver implements SqlDriver {
  readonly kind = 'capacitor-sqlite' as const;
  private queue = new AsyncWriteQueue();
  private inTx = false;

  constructor(private db: SQLiteDBConnection) {}

  async exec(sql: string): Promise<void> {
    if (this.inTx) {
      await this.db.execute(sql, false);
      return;
    }
    await this.queue.enqueue(async () => {
      await this.db.execute(sql, false);
    });
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    if (this.inTx) {
      await this.db.run(sql, params as any[], false);
      return;
    }
    await this.queue.enqueue(async () => {
      await this.db.run(sql, params as any[], false);
    });
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.db.query(sql, params as any[]);
    return (res.values ?? []) as T[];
  }

  async get<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      this.inTx = true;
      await this.db.execute('BEGIN;', false);
      try {
        const result = await fn();
        await this.db.execute('COMMIT;', false);
        return result;
      } catch (err) {
        try {
          await this.db.execute('ROLLBACK;', false);
        } catch {
          // ignore rollback error
        }
        throw err;
      } finally {
        this.inTx = false;
      }
    });
  }
}

class SqlJsWebDriver implements SqlDriver {
  readonly kind = 'sqljs' as const;
  private queue = new AsyncWriteQueue();
  private inTx = false;

  constructor(private db: SqlJsDatabase) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
    if (!this.inTx) await this.persist();
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.run(params as any[]);
    } finally {
      stmt.free();
    }
    if (!this.inTx) await this.persist();
  }

  async all<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params as any[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }

  async get<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const rows = await this.all<T>(sql, params);
    return rows[0];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.enqueue(async () => {
      this.inTx = true;
      this.db.exec('BEGIN;');
      try {
        const out = await fn();
        this.db.exec('COMMIT;');
        await this.persist();
        return out;
      } catch (err) {
        try {
          this.db.exec('ROLLBACK;');
        } catch {
          // ignore
        }
        throw err;
      } finally {
        this.inTx = false;
      }
    });
  }

  async persist(): Promise<void> {
    const exported = this.db.export();
    await writeDbBytesToIdb(exported);
  }
}

async function createDriver(): Promise<SqlDriver> {
  if (customDriverOverride) {
    await initializeSchemaAndDefaults(customDriverOverride);
    return customDriverOverride;
  }

  if (Capacitor.isNativePlatform()) {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const consistency = await sqlite.checkConnectionsConsistency();
    const isConn = (await sqlite.isConnection('brain_sculpting_camp', false)).result;
    let db: SQLiteDBConnection;
    if (consistency.result && isConn) {
      db = await sqlite.retrieveConnection('brain_sculpting_camp', false);
    } else {
      db = await sqlite.createConnection('brain_sculpting_camp', false, 'no-encryption', 1, false);
    }
    await db.open();
    const driver = new CapacitorSqliteDriver(db);
    await initializeSchemaAndDefaults(driver);
    return driver;
  }

  // Web Browser / Preview fallback using real SQLite (sql.js) persisted to IndexedDB
  const SQL = await initSqlJs({
    locateFile: () => sqlWasmUrl,
  });
  const savedBytes = await readDbBytesFromIdb();
  const sqlJsDb = savedBytes ? new SQL.Database(savedBytes) : new SQL.Database();
  const driver = new SqlJsWebDriver(sqlJsDb);
  await initializeSchemaAndDefaults(driver);
  return driver;
}

export async function getLocalDb(): Promise<SqlDriver> {
  if (!driverPromise) {
    driverPromise = createDriver().catch((err) => {
      driverPromise = null;
      throw err;
    });
  }
  return driverPromise;
}
