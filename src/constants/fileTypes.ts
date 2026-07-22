/**
 * 文件类型注册表 —— 添加新类型的唯一入口。
 *
 * 新增文件类型只需在此数组中加一行即可：
 *   { ext: 'xml', mime: 'application/xml', language: null, label: 'XML' },
 *
 * - `language` 指向 CodeEditor.vue 中 LANGUAGE_LOADERS 的 key，null = 纯文本无高亮
 * - `label`   是 i18n 缺失时的英文兜底显示名
 * - `ext`     会自动加入 FileExtension 联合类型，无需手动维护
 */

export const FILE_TYPES = [
  { ext: 'txt',  mime: 'text/plain',                       language: null,         label: 'Text' },
  { ext: 'md',   mime: 'text/markdown',                    language: null,         label: 'Markdown' },
  { ext: 'json', mime: 'application/json',                  language: 'json',       label: 'JSON' },
  { ext: 'html', mime: 'text/html',                         language: 'html',       label: 'HTML' },
  { ext: 'xml',  mime: 'application/xml',                   language: 'html',       label: 'XML' },
  { ext: 'css',  mime: 'text/css',                          language: 'css',        label: 'CSS' },
  { ext: 'php',  mime: 'application/x-httpd-php',           language: 'php',        label: 'PHP' },
  { ext: 'py',   mime: 'text/x-python',                     language: 'python',     label: 'Python' },
  { ext: 'js',   mime: 'text/javascript',                   language: 'javascript', label: 'JavaScript' },
  { ext: 'ts',   mime: 'text/typescript',                   language: 'typescript', label: 'TypeScript' },
  { ext: 'jsx',  mime: 'text/javascript',                   language: 'jsx',        label: 'React JSX' },
  { ext: 'tsx',  mime: 'text/typescript',                   language: 'tsx',        label: 'React TSX' },
  { ext: 'vue',  mime: 'text/plain',                        language: 'html',       label: 'Vue Component' },
  { ext: 'csv',  mime: 'text/csv',                          language: null,         label: 'CSV' },
  { ext: 'tsv',  mime: 'text/tab-separated-values',         language: null,         label: 'TSV' },
  { ext: 'sql',  mime: 'application/sql',                   language: null,         label: 'SQL' },
  { ext: 'toml', mime: 'application/toml',                  language: null,         label: 'TOML' },
  { ext: 'env',  mime: 'text/plain',                        language: null,         label: 'Environment File' },
  { ext: 'm3u',  mime: 'audio/x-mpegurl',                   language: null,         label: 'M3U Playlist' },
  { ext: 'm3u8', mime: 'application/vnd.apple.mpegurl',     language: null,         label: 'M3U8 Playlist' },
  { ext: 'yaml', mime: 'text/yaml',                         language: null,         label: 'YAML' },
  { ext: 'yml',  mime: 'text/yaml',                         language: null,         label: 'YML' },
  { ext: 'conf', mime: 'text/plain',                        language: null,         label: 'Config File' },
  { ext: 'sh',   mime: 'text/x-sh',                         language: 'shell',      label: 'Shell Script' },
] as const

/** 由 FILE_TYPES 自动推导，无需手动维护 */
export type FileExtension = (typeof FILE_TYPES)[number]['ext']

export interface FileTypeOption {
  ext: FileExtension
  mime: string
  language: string | null
  label: string
}

/** 运行时类型守卫 */
export const FILE_TYPE_SET = new Set<string>(FILE_TYPES.map((item) => item.ext))
