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
  folderId: number | null
}

export interface FileDetail extends FileMeta {
  content: string
}

export interface Folder {
  id: number
  name: string
  parentId: number | null
  createdAt: string
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

  /* ---- 文件夹状态 ---- */
  const folders = ref<Folder[]>([])
  const currentFolderId = ref<number | null>(null)

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

  async function create(payload: { filename: string; content: string; mimeType?: string; folderId?: number | null }) {
    error.value = null
    try {
      const body = {
        filename: payload.filename,
        content: payload.content,
        ...(payload.mimeType ? { mimeType: payload.mimeType } : {}),
        ...(payload.folderId != null ? { folderId: payload.folderId } : {}),
      }
      const res = await api.post<FileMeta>('/api/files', body)
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
    folders.value = []
    currentFolderId.value = null
    error.value = null
  }

  /* ==================== 文件夹 ==================== */
  async function fetchFolders() {
    try {
      const res = await api.get<Folder[]>('/api/folders')
      folders.value = res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
    }
  }

  async function createFolder(payload: { name: string; parentId?: number | null }) {
    error.value = null
    try {
      const res = await api.post<Folder>('/api/folders', {
        name: payload.name,
        ...(payload.parentId != null ? { parentId: payload.parentId } : {}),
      })
      folders.value.push(res.data)
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function renameFolder(id: number, name: string) {
    error.value = null
    try {
      const res = await api.put<Folder>(`/api/folders/${id}`, { name })
      const idx = folders.value.findIndex(f => f.id === id)
      if (idx >= 0) folders.value[idx] = res.data
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function deleteFolder(id: number) {
    error.value = null
    try {
      await api.delete(`/api/folders/${id}`)
      folders.value = folders.value.filter(f => f.id !== id)
      // 该文件夹下的文件回退到根目录
      list.value.forEach(f => { if (f.folderId === id) f.folderId = null })
      if (currentFolderId.value === id) currentFolderId.value = null
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  async function moveFile(id: number, folderId: number | null) {
    error.value = null
    try {
      const res = await api.post<FileMeta>(`/api/files/${id}/move`, {
        ...(folderId != null ? { folderId } : { folderId: null }),
      })
      const idx = list.value.findIndex(f => f.id === id)
      if (idx >= 0) list.value[idx] = res.data
      return res.data
    } catch (e: unknown) {
      error.value = extractErrorMessage(e)
      throw e
    }
  }

  function setCurrentFolder(id: number | null) {
    currentFolderId.value = id
  }

  return {
    list, current, loading, error, folders, currentFolderId,
    fetchList, create, update, remove, loadFile, clearCurrent, clearAll,
    fetchFolders, createFolder, renameFolder, deleteFolder, moveFile, setCurrentFolder,
  }
})
