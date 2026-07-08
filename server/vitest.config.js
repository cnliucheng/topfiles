import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    pool: 'forks',  // better-sqlite3 在 forking pool 下更稳
    poolOptions: {
      forks: { singleFork: true }  // 共享测试 db 状态
    }
  }
})