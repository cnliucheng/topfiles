import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage } from 'node:http'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const VISITS_FILE = path.resolve(process.cwd(), 'visits.json')

interface VisitsData {
  total: number
  [dateOrIpKey: string]: number | string[]
}

function readVisits(): VisitsData {
  try {
    const raw = fs.readFileSync(VISITS_FILE, 'utf-8')
    return JSON.parse(raw) as VisitsData
  } catch {
    return { total: 0 }
  }
}

function writeVisits(data: VisitsData): void {
  fs.writeFileSync(VISITS_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

/** 从请求头中提取客户端真实 IP */
function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers['x-real-ip']
  if (typeof realIp === 'string') {
    return realIp.trim()
  }
  const raw = req.socket.remoteAddress ?? '127.0.0.1'
  // 规范化 IPv4-mapped IPv6 地址
  return raw.replace(/^::ffff:/, '')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'visit-counter',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          // POST /api/visit — 记录一次访问（同 IP 同日仅计一次）
          if (req.url === '/api/visit' && req.method === 'POST') {
            const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
            const month = today.slice(0, 7) // YYYY-MM
            const ip = getClientIp(req)
            const ipKey = `ips_${today}`

            const data = readVisits()
            const todayIps = (data[ipKey] as string[] | undefined) ?? []

            // 同 IP 同日已记录过，跳过计数
            if (todayIps.includes(ip)) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, counted: false }))
              return
            }

            todayIps.push(ip)
            data[ipKey] = todayIps
            data[today] = ((data[today] as number) ?? 0) + 1
            data[month] = ((data[month] as number) ?? 0) + 1
            data.total = ((data.total as number) ?? 0) + 1
            writeVisits(data)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: true, counted: true }))
            return
          }

          // GET /api/stats — 获取统计数据
          if (req.url === '/api/stats' && req.method === 'GET') {
            const today = new Date().toISOString().slice(0, 10)
            const month = today.slice(0, 7)

            const data = readVisits()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(
              JSON.stringify({
                today: (data[today] as number) ?? 0,
                month: (data[month] as number) ?? 0,
                total: (data.total as number) ?? 0,
              }),
            )
            return
          }

          next()
        })
      },
    },
  ],
  server: {
    allowedHosts: ['localhost', '127.0.0.1'],
  },
})
