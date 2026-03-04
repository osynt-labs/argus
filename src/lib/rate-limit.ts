/**
 * In-memory sliding-window rate limiter.
 *
 * Designed for single-pod deployments (no shared state).
 * Each key (e.g. API key) gets its own window of timestamps.
 * Old entries are pruned on every call to `check()` so memory
 * stays bounded even under sustained traffic.
 */

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  maxRequests: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix-ms timestamp when the oldest tracked request expires. */
  resetAt: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60_000, // 1 minute
};

/**
 * Maximum number of distinct keys to track.  If exceeded the oldest
 * key (by last-seen time) is evicted.  Prevents unbounded memory
 * growth from key-spray attacks.
 */
const MAX_KEYS = 10_000;

/** Per-key list of request timestamps (epoch ms). */
const store = new Map<string, number[]>();

/** Prune timestamps older than the window for a given key. */
function prune(timestamps: number[], windowStart: number): number[] {
  // Timestamps are kept in insertion order (ascending).
  // Binary-search would be faster, but a linear scan is fine for <= 100 items.
  let i = 0;
  while (i < timestamps.length && timestamps[i] <= windowStart) {
    i++;
  }
  return i === 0 ? timestamps : timestamps.slice(i);
}

/** Evict the least-recently-used key if the store is over capacity. */
function evictIfNeeded(): void {
  if (store.size <= MAX_KEYS) return;
  // Map iteration order is insertion order; the first key is the oldest.
  const oldest = store.keys().next().value;
  if (oldest !== undefined) {
    store.delete(oldest);
  }
}

/**
 * Check (and consume) a rate-limit token for `key`.
 *
 * Returns whether the request is allowed together with metadata
 * suitable for `Retry-After` / `X-RateLimit-*` headers.
 */
export function check(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = store.get(key) ?? [];
  timestamps = prune(timestamps, windowStart);

  if (timestamps.length >= config.maxRequests) {
    // Denied -- do NOT record this request.
    const resetAt = timestamps[0] + config.windowMs;
    store.set(key, timestamps);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Allowed -- record the request.
  timestamps.push(now);
  store.set(key, timestamps);
  evictIfNeeded();

  const resetAt =
    timestamps.length > 0 ? timestamps[0] + config.windowMs : now + config.windowMs;

  return {
    allowed: true,
    remaining: config.maxRequests - timestamps.length,
    resetAt,
  };
}
