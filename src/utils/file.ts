import { FILE_TYPES, FILE_TYPE_SET, type FileExtension } from '../constants/fileTypes'

const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

function normalizeRawName(name: string): string {
  return name.trim().replace(INVALID_FILE_CHARS, '_').replace(/[ ]+$/g, '').replace(/[. ]+$/g, '')
}

function extractExtension(name: string): string | null {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === name.length - 1) return null
  return name.slice(dotIndex + 1).toLowerCase()
}

export function sanitizeBaseName(name: string, ext: FileExtension): string {
  const trimmed = normalizeRawName(name)
  if (!trimmed) return 'untitled'

  const suffix = `.${ext}`
  const withoutSuffix = trimmed.toLowerCase().endsWith(suffix)
    ? trimmed.slice(0, -suffix.length)
    : trimmed

  return withoutSuffix || 'untitled'
}

export function inferSupportedExtension(name: string): FileExtension | null {
  const normalized = normalizeRawName(name)
  if (!normalized) return null

  if (normalized.toLowerCase() === '.env') return 'env'

  const ext = extractExtension(normalized)
  if (!ext || !FILE_TYPE_SET.has(ext as FileExtension)) return null
  return ext as FileExtension
}

export function buildFileName(name: string, ext: FileExtension): string {
  const normalized = normalizeRawName(name)
  if (!normalized) return `untitled.${ext}`

  const explicitExt = extractExtension(normalized)
  if (explicitExt) return normalized

  return `${normalized}.${ext}`
}

export function getMimeType(ext: FileExtension): string {
  return FILE_TYPES.find((item) => item.ext === ext)?.mime ?? 'text/plain'
}

export function downloadFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}
