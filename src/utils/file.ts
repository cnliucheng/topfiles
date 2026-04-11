import { FILE_TYPES, type FileExtension } from '../constants/fileTypes'

export function sanitizeBaseName(name: string, ext: FileExtension): string {
  const trimmed = name.trim()
  if (!trimmed) return 'untitled'

  const suffix = `.${ext}`
  const withoutSuffix = trimmed.toLowerCase().endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed
  const sanitized = withoutSuffix
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()

  return sanitized || 'untitled'
}

export function buildFileName(name: string, ext: FileExtension): string {
  const baseName = sanitizeBaseName(name, ext)
  return `${baseName}.${ext}`
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
