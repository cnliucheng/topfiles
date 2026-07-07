<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface VisitStats {
  today: number
  month: number
  total: number
}

const stats = ref<VisitStats | null>(null)
const loading = ref(true)
const error = ref(false)

async function fetchStats(): Promise<void> {
  try {
    const res = await fetch('/api/stats')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    stats.value = (await res.json()) as VisitStats
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

async function recordVisit(): Promise<void> {
  try {
    await fetch('/api/visit', { method: 'POST' })
  } catch {
    // 访问记录失败静默处理，不影响页面
  }
}

onMounted(async () => {
  await recordVisit()
  await fetchStats()
})
</script>

<template>
  <footer class="visit-stats">
    <template v-if="loading">
      <span class="stat-item stat-muted">--</span>
    </template>
    <template v-else-if="error">
      <span class="stat-item stat-muted">⚡</span>
    </template>
    <template v-else-if="stats">
      <span class="stat-item">
        <span class="stat-label">本日</span>
        <span class="stat-value">{{ stats.today.toLocaleString() }}</span>
      </span>
      <span class="stat-divider">·</span>
      <span class="stat-item">
        <span class="stat-label">本月</span>
        <span class="stat-value">{{ stats.month.toLocaleString() }}</span>
      </span>
      <span class="stat-divider">·</span>
      <span class="stat-item">
        <span class="stat-label">全部</span>
        <span class="stat-value">{{ stats.total.toLocaleString() }}</span>
      </span>
    </template>
  </footer>
</template>

<style scoped>
.visit-stats {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 0 4px;
  font-size: 12px;
  color: var(--text-sub);
  opacity: 0.6;
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stat-label {
  color: var(--text-sub);
}

.stat-value {
  font-weight: 600;
  color: var(--text-main);
  min-width: 28px;
  text-align: right;
}

.stat-divider {
  color: var(--border);
}

.stat-muted {
  opacity: 0.4;
}
</style>
