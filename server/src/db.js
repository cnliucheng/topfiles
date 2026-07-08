import Database from 'better-sqlite3'

export function createDb(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      username       TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash  TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT UNIQUE NOT NULL COLLATE NOCASE,
      mime_type    TEXT NOT NULL DEFAULT 'text/plain',
      content      TEXT NOT NULL,
      size_bytes   INTEGER NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
  `)
  return db
}
