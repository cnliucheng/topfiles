/**
 * 第三方 CORS 代理候选 —— 仅在直连失败且用户明确同意后使用。
 *
 * 内容会经过这些第三方服务，故默认不启用：导入时先尝试直连，
 * 仅当用户点击“经第三方代理重试”时才遍历以下代理。
 */
export interface CorsProxy {
  name: string
  build: (url: string) => string
}

export const CORS_PROXIES: readonly CorsProxy[] = [
  {
    name: 'allorigins',
    build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  },
  {
    name: 'isomorphic-git',
    build: (url) => `https://cors.isomorphic-git.org/${encodeURIComponent(url)}`
  }
]
