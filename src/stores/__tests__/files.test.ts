import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilesStore } from '../files'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  onAuthExpired: vi.fn(),
}))

import { api } from '../../api/client'

const mockFile: FileMeta = {
  id: 1,
  filename: 'test.json',
  mimeType: 'application/json',
  sizeBytes: 100,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  folderId: null,
}

const mockFolder = {
  id: 1,
  name: 'Docs',
  parentId: null,
  createdAt: '2025-01-01T00:00:00Z',
}

import type { FileMeta } from '../files'

describe('files store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('starts empty', () => {
    const files = useFilesStore()
    expect(files.list).toEqual([])
    expect(files.current).toBeNull()
    expect(files.loading).toBe(false)
    expect(files.error).toBeNull()
  })

  it('fetchList populates list and clears loading', async () => {
    const files = useFilesStore()
    vi.mocked(api.get).mockResolvedValue({ data: [mockFile] } as any)

    await files.fetchList()

    expect(files.list).toHaveLength(1)
    expect(files.list[0].filename).toBe('test.json')
    expect(files.loading).toBe(false)
    expect(files.error).toBeNull()
  })

  it('fetchList sets error on failure', async () => {
    const files = useFilesStore()
    vi.mocked(api.get).mockRejectedValue({
      message: 'Network error',
      response: { data: { error: { message: 'Server down' } } },
    } as any)

    await files.fetchList()

    expect(files.error).toBe('Server down')
    expect(files.loading).toBe(false)
  })

  it('create adds to list only after success', async () => {
    const files = useFilesStore()
    vi.mocked(api.post).mockResolvedValue({ data: mockFile } as any)

    const result = await files.create({ filename: 'test.json', content: '{}' })

    expect(files.list).toHaveLength(1)
    expect(result.filename).toBe('test.json')
    expect(files.current?.content).toBe('{}')
    expect(files.error).toBeNull()
  })

  it('create does not add to list on failure', async () => {
    const files = useFilesStore()
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { error: { message: 'Filename conflict' } } },
    } as any)

    await expect(files.create({ filename: 'test.json', content: '{}' })).rejects.toBeDefined()
    expect(files.list).toHaveLength(0)
    expect(files.error).toBe('Filename conflict')
  })

  it('remove removes from list', async () => {
    const files = useFilesStore()
    files.list = [{ ...mockFile }]
    vi.mocked(api.delete).mockResolvedValue({} as any)

    await files.remove(1)

    expect(files.list).toHaveLength(0)
  })

  it('clearAll resets everything', () => {
    const files = useFilesStore()
    files.list = [mockFile]
    files.current = { ...mockFile, content: 'test' }
    files.error = 'some error'

    files.clearAll()

    expect(files.list).toEqual([])
    expect(files.current).toBeNull()
    expect(files.error).toBeNull()
  })
})

describe('folders', () => {
  it('starts with no folders', () => {
    const files = useFilesStore()
    expect(files.folders).toEqual([])
    expect(files.currentFolderId).toBeNull()
  })

  it('fetchFolders populates folders', async () => {
    const files = useFilesStore()
    vi.mocked(api.get).mockResolvedValueOnce({ data: [mockFolder] } as any)
    await files.fetchFolders()
    expect(files.folders).toHaveLength(1)
    expect(files.folders[0].name).toBe('Docs')
  })

  it('createFolder adds to folders on success', async () => {
    const files = useFilesStore()
    files.folders = []
    files.error = null
    vi.mocked(api.post).mockResolvedValue({ data: mockFolder } as any)
    const result = await files.createFolder({ name: 'Docs' })
    expect(files.folders).toHaveLength(1)
    expect(result.name).toBe('Docs')
  })

  it('createFolder does not add on failure', async () => {
    const files = useFilesStore()
    files.folders = []
    files.error = null
    vi.mocked(api.post).mockRejectedValue({
      response: { data: { error: { message: 'conflict' } } },
    } as any)
    await expect(files.createFolder({ name: 'Docs' })).rejects.toBeDefined()
    expect(files.folders).toHaveLength(0)
    expect(files.error).toBe('conflict')
  })

  it('deleteFolder removes folder and resets currentFolderId', async () => {
    const files = useFilesStore()
    files.folders = [{ ...mockFolder }]
    files.currentFolderId = mockFolder.id
    vi.mocked(api.delete).mockResolvedValue({} as any)
    await files.deleteFolder(mockFolder.id)
    expect(files.folders).toHaveLength(0)
    expect(files.currentFolderId).toBeNull()
  })

  it('moveFile updates the file folderId', async () => {
    const files = useFilesStore()
    files.list = [{ ...mockFile }]
    vi.mocked(api.post).mockResolvedValue({ data: { ...mockFile, folderId: 5 } } as any)
    await files.moveFile(1, 5)
    expect(files.list[0].folderId).toBe(5)
  })
})
