import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createDb } from '../src/db.js'
import { unlinkSync, existsSync } from 'node:fs'

let db
const TEST_DB = './test-db.sqlite'

describe('db', () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
    db = createDb(TEST_DB)
  })
  afterEach(() => {
    db.close()
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB)
  })

  it('creates users table with single-row check', () => {
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)').run('alice', 'hash')
    expect(() => {
      db.prepare('INSERT INTO users (id, username, password_hash) VALUES (2, ?, ?)').run('bob', 'h')
    }).toThrow(/CHECK/)
  })

  it('creates files table with unique filename', () => {
    db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('a.md', 'hi', 2)
    expect(() => {
      db.prepare('INSERT INTO files (filename, content, size_bytes) VALUES (?, ?, ?)').run('A.MD', 'x', 1)
    }).toThrow(/UNIQUE/)
  })

  it('enables WAL mode', () => {
    const journal_mode = db.pragma('journal_mode', { simple: true })
    expect(journal_mode).toBe('wal')
  })
})
