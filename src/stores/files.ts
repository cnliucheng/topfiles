import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api/client'
import type { AxiosError } from 'axios'

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

function extractErrorMessage(err: unknown): string {
  const axiosErr = err as AxiosError<{ error?: { message?: string } }>
  return axiosErr.response?.data?.error?.message ?? axiosErr.message ?? 'Unknown error'
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
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
    } finally {
      loading.value = false
    }
  }

  async function create(payload: { filename: string; content: string; mimeType?: string }) {
    error.value = null
    try {
      const res = await api.post<FileMeta>('/api/files', payload)
      list.value.unshift(res.data)
      current.value = { ...res.data, content: payload.content }
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function update(id: number, payload: { content: string; mimeType?: string }) {
    error.value = null
    try {
      const res = await api.put<FileMeta>(`/api/files/${id}`, payload)
      if (current.value?.id === id) {
        current.value = { ...current.value, ...res.data, content: payload.content }
      }
      await fetchList()
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function remove(id: number) {
    error.value = null
    try {
      await api.delete(`/api/files/${id}`)
      if (current.value?.id === id) {
        current.value = null
      }
      list.value = list.value.filter(f => f.id !== id)
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function loadFile(id: number) {
    error.value = null
    try {
      const res = await api.get<FileDetail>(`/api/files/${id}`)
      current.value = res.data
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  function clearCurrent() {
    current.value = null
  }

  function clearAll() {
    list.value = []
    current.value = null
    error.value = null
  }

  return { list, current, loading, error, fetchList, create, update, remove, loadFile, clearCurrent, clearAll }
})
