export type FileExtension = 'txt' | 'json' | 'html' | 'css' | 'php' | 'py' | 'js' | 'ts'

export interface FileTypeOption {
  ext: FileExtension
  mime: string
}

export const FILE_TYPES: FileTypeOption[] = [
  { ext: 'txt', mime: 'text/plain' },
  { ext: 'json', mime: 'application/json' },
  { ext: 'html', mime: 'text/html' },
  { ext: 'css', mime: 'text/css' },
  { ext: 'php', mime: 'application/x-httpd-php' },
  { ext: 'py', mime: 'text/x-python' },
  { ext: 'js', mime: 'text/javascript' },
  { ext: 'ts', mime: 'text/typescript' }
]

export const FILE_TYPE_SET = new Set(FILE_TYPES.map((item) => item.ext))
