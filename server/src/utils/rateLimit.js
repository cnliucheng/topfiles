export class RateLimiter {
  constructor() {
    this.buckets = new Map()
  }

  allow(key, max, windowMs) {
    const now = Date.now()
    const bucket = this.buckets.get(key) || { count: 0, resetAt: now + windowMs }
    if (now > bucket.resetAt) {
      bucket.count = 0
      bucket.resetAt = now + windowMs
    }
    bucket.count++
    this.buckets.set(key, bucket)
    return bucket.count <= max
  }
}
