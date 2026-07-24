import Database from 'better-sqlite3'

const migrations = [
  {
    version: 1,
    description: 'Initial schema',
    up: `
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
    `
  },
  {
    version: 2,
    description: 'Add folders + file.folder_id',
    up: `
      CREATE TABLE IF NOT EXISTS folders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL COLLATE NOCASE,
        parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

      ALTER TABLE files ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
    `
  }
]

export function createDb(path) {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    db.prepare('SELECT version FROM _migrations').all().map(r => r.version)
  )

  for (const migration of migrations) {
    if (!applied.has(migration.version)) {
      const txn = db.transaction(() => {
        db.exec(migration.up)
        db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(migration.version)
      })
      txn()
      console.log(`[topfiles] migration ${migration.version} applied: ${migration.description}`)
    }
  }

  return db
}
