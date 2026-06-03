/**
 * Rate-limited HTTP client for the sports API.
 *
 * Three layers of protection so we never trip the free tier's 5 req/min cap:
 *  1. A token-bucket-ish window limiter that paces requests to N per windowMs.
 *  2. A small concurrency gate (in practice the limiter dominates).
 *  3. Retry with exponential backoff + jitter, honouring `Retry-After` on 429.
 */

import { config, getApiKey } from "../config.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Spaces calls so no more than `requestsPerWindow` happen per `windowMs`. */
class RateLimiter {
  private timestamps: number[] = [];
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly padMs: number,
  ) {}

  /** Resolve when it is safe to fire the next request. Serialized so the
   *  window accounting stays correct under concurrency. */
  acquire(): Promise<void> {
    this.chain = this.chain.then(() => this.waitForSlot());
    return this.chain;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      // Drop timestamps that have aged out of the window.
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length < this.limit) {
        this.timestamps.push(now);
        if (this.padMs) await sleep(this.padMs);
        return;
      }
      const oldest = this.timestamps[0];
      const wait = this.windowMs - (now - oldest) + this.padMs;
      await sleep(Math.max(wait, 50));
    }
  }
}

const limiter = new RateLimiter(
  config.rateLimit.requestsPerWindow,
  config.rateLimit.windowMs,
  config.rateLimit.minSpacingPadMs,
);

let inFlight = 0;
const waiters: Array<() => void> = [];
async function withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= config.concurrency) {
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    const next = waiters.shift();
    if (next) next();
  }
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const expoBackoff = (attempt: number): number => {
  const { baseDelayMs, maxDelayMs } = config.retry;
  const raw = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return raw / 2 + Math.random() * (raw / 2); // full-ish jitter
};

export interface RequestOptions {
  /** Query params; arrays are encoded as repeated `key[]=v` pairs (API style). */
  query?: Record<string, string | number | Array<string | number> | undefined>;
}

function buildUrl(url: string, query?: RequestOptions["query"]): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(`${key}[]`, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

/**
 * GET JSON with full rate-limit + retry handling.
 * Throws HttpError on non-retryable 4xx (e.g. 401/404) and after exhausting retries.
 */
export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const fullUrl = buildUrl(url, opts.query);
  const apiKey = getApiKey();

  return withConcurrency(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < config.retry.maxAttempts; attempt++) {
      await limiter.acquire();
      try {
        const res = await fetch(fullUrl, {
          headers: { Authorization: apiKey, Accept: "application/json" },
        });

        if (res.ok) return (await res.json()) as T;

        const body = await res.text().catch(() => "");

        // 429 / 5xx are transient — back off and retry.
        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const delay = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : expoBackoff(attempt);
          process.stderr.write(
            `  ↻ ${res.status} on ${shortUrl(fullUrl)} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1})\n`,
          );
          await sleep(delay);
          continue;
        }

        // Other 4xx are not worth retrying.
        throw new HttpError(
          `GET ${shortUrl(fullUrl)} failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
          res.status,
          body,
        );
      } catch (err) {
        if (err instanceof HttpError) throw err;
        // Network/transient error — back off and retry.
        lastErr = err;
        const delay = expoBackoff(attempt);
        process.stderr.write(
          `  ↻ network error on ${shortUrl(fullUrl)} — retrying in ${Math.round(delay)}ms (attempt ${attempt + 1})\n`,
        );
        await sleep(delay);
      }
    }
    throw new Error(
      `GET ${shortUrl(fullUrl)} exhausted ${config.retry.maxAttempts} attempts: ${String(lastErr)}`,
    );
  });
}

function shortUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.pathname + (parsed.search ? parsed.search.slice(0, 60) : "");
  } catch {
    return u;
  }
}
