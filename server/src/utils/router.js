export function matchRoute(method, path, routes) {
  for (const [key, handler] of Object.entries(routes)) {
    const [m, pattern] = key.split(' ')
    if (m !== method) continue

    const patternParts = pattern.split('/')
    const pathParts = path.split('/')
    if (patternParts.length !== pathParts.length) continue

    const params = {}
    let match = true
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
      } else if (patternParts[i] !== pathParts[i]) {
        match = false
        break
      }
    }
    if (match) return { handler, params }
  }
  return null
}