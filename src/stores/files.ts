import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/client'

export interface FileMeta {
  id: number
  filename: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export interface FileDetail extends FileMeta {
  content: string
}

export const useFilesStore = defineStore('files', () => {
  const list = ref<FileMeta[]>([])
  const current = ref<FileDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchList() {
    loading.value = true
    error.value = null
    try {
      const res = await api.get<FileMeta[]>('/api/files')
      list.value = res.data
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function create(payload: { filename: string; content: string; mimeType?: string }) {
    const res = await api.post<FileMeta>('/api/files', payload)
    list.value.unshift(res.data)
    current.value = { ...res.data, content: payload.content }
    return res.data
  }

  async function update(id: number, payload: { content: string; mimeType?: string }) {
    const res = await api.put<FileMeta>(`/api/files/${id}`, payload)
    if (current.value?.id === id) {
      current.value = { ...current.value, ...res.data, content: payload.content }
    }
    // 刷新列表（顺序可能变）
    await fetchList()
    return res.data
  }

  async function remove(id: number) {
    await api.delete(`/api/files/${id}`)
    if (current.value?.id === id) {
      current.value = null
    }
    list.value = list.value.filter(f => f.id !== id)
  }

  async function loadFile(id: number) {
    const res = await api.get<FileDetail>(`/api/files/${id}`)
    current.value = res.data
    return res.data
  }

  function clearCurrent() {
    current.value = null
  }

  return { list, current, loading, error, fetchList, create, update, remove, loadFile, clearCurrent }
})