import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
const apiProxyTarget = process.env.VITE_API_PROXY || 'http://1.14.106.163:3001'

export default defineConfig({
  plugins: [vue()],
  server: {
    allowedHosts: ['localhost', '127.0.0.1'],
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/u': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})
