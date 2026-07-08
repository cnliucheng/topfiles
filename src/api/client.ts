import axios, { AxiosError } from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 401 时通知应用（Pinia store 监听这个事件做跳转）
export function onAuthExpired(handler: () => void) {
  api.interceptors.response.use(
    (r) => r,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        handler()
      }
      return Promise.reject(err)
    }
  )
}