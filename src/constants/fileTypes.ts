export type FileExtension =
  | 'txt'
  | 'json'
  | 'html'
  | 'css'
  | 'php'
  | 'py'
  | 'js'
  | 'ts'
  | 'm3u'
  | 'm3u8'
  | 'yaml'
  | 'yml'
  | 'conf'

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
  { ext: 'ts', mime: 'text/typescript' },
  { ext: 'm3u', mime: 'audio/x-mpegurl' },
  { ext: 'm3u8', mime: 'application/vnd.apple.mpegurl' },
  { ext: 'yaml', mime: 'text/yaml' },
  { ext: 'yml', mime: 'text/yaml' },
  { ext: 'conf', mime: 'text/plain' }
]

export const FILE_TYPE_SET = new Set(FILE_TYPES.map((item) => item.ext))
