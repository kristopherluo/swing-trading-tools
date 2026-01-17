/**
 * Rate Limiter - Token bucket algorithm for API rate limiting
 *
 * Enforces rate limits proactively to prevent hitting API limits:
 * - Finnhub: 60 calls/minute
 * - Twelve Data: 8 tickers/batch, ~300 calls/day
 * - Alpha Vantage: 25 calls/day, 5 calls/minute
 * - Polygon: 5 calls/minute
 */

/**
 * Token Bucket Rate Limiter
 * Allows bursts but enforces average rate over time
 */
class TokenBucket {
  constructor(name, options) {
    this.name = name;
    this.capacity = options.capacity; // Max tokens (burst capacity)
    this.refillRate = options.refillRate; // Tokens added per interval
    this.refillInterval = options.refillInterval; // Interval in ms
    this.tokens = this.capacity; // Start with full bucket
    this.lastRefill = Date.now();

    // Start refill timer
    this.startRefillTimer();
  }

  /**
   * Start the refill timer
   */
  startRefillTimer() {
    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.refillInterval);
  }

  /**
   * Stop the refill timer (for cleanup)
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.refillInterval);

    if (intervalsElapsed > 0) {
      const tokensToAdd = intervalsElapsed * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;

      if (tokensToAdd > 0) {
        console.log(`[RateLimit ${this.name}] Refilled ${tokensToAdd} tokens (now: ${this.tokens}/${this.capacity})`);
      }
    }
  }

  /**
   * Try to consume tokens
   * @param {number} count - Number of tokens to consume
   * @returns {boolean} True if tokens consumed, false if not enough tokens
   */
  tryConsume(count = 1) {
    this.refill(); // Refill before checking

    if (this.tokens >= count) {
      this.tokens -= count;
      console.log(`[RateLimit ${this.name}] Consumed ${count} token(s) (remaining: ${this.tokens}/${this.capacity})`);
      return true;
    }

    console.warn(`[RateLimit ${this.name}] Rate limit: need ${count} tokens, have ${this.tokens}`);
    return false;
  }

  /**
   * Wait for tokens to become available
   * @param {number} count - Number of tokens needed
   * @returns {Promise<void>} Resolves when tokens available
   */
  async waitForTokens(count = 1) {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return;
    }

    // Calculate wait time
    const tokensNeeded = count - this.tokens;
    const intervalsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    const waitTime = intervalsNeeded * this.refillInterval;

    console.log(`[RateLimit ${this.name}] Waiting ${waitTime}ms for ${tokensNeeded} more token(s)...`);

    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Retry consumption after wait
    this.refill();
    this.tokens -= count;
  }

  /**
   * Get current status
   */
  getStatus() {
    this.refill(); // Update before reporting
    return {
      name: this.name,
      tokens: this.tokens,
      capacity: this.capacity,
      percentage: Math.round((this.tokens / this.capacity) * 100)
    };
  }

  /**
   * Reset to full capacity
   */
  reset() {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
    console.log(`[RateLimit ${this.name}] Reset to full capacity`);
  }
}

/**
 * Rate Limiter Manager - Manages rate limiters for all APIs
 */
export class RateLimiter {
  constructor() {
    // Configure rate limiters for each API
    this.limiters = {
      // Finnhub: 60 calls/minute
      finnhub: new TokenBucket('Finnhub', {
        capacity: 60,
        refillRate: 1,
        refillInterval: 1000 // 1 token per second
      }),

      // Twelve Data: Conservative limit of 1 call per 2 seconds to stay under daily quota
      // (300 calls/day = ~1 call per 288 seconds, but allow some burst)
      twelveData: new TokenBucket('TwelveData', {
        capacity: 10, // Allow small burst
        refillRate: 1,
        refillInterval: 2000 // 1 token per 2 seconds (30/minute, ~700/day max)
      }),

      // Alpha Vantage: 5 calls/minute (strict)
      alphaVantage: new TokenBucket('AlphaVantage', {
        capacity: 5,
        refillRate: 1,
        refillInterval: 12000 // 1 token per 12 seconds (5/minute)
      }),

      // Polygon: 5 calls/minute (free tier)
      polygon: new TokenBucket('Polygon', {
        capacity: 5,
        refillRate: 1,
        refillInterval: 12000 // 1 token per 12 seconds (5/minute)
      })
    };
  }

  /**
   * Request permission to make API call (non-blocking)
   * @param {string} apiName - API name
   * @param {number} tokens - Number of tokens to consume (default 1)
   * @returns {boolean} True if allowed, false if rate limited
   */
  tryAcquire(apiName, tokens = 1) {
    const limiter = this.limiters[apiName];
    if (!limiter) {
      console.warn(`[RateLimit] No limiter configured for ${apiName}`);
      return true; // Allow if not configured
    }

    return limiter.tryConsume(tokens);
  }

  /**
   * Wait for permission to make API call (blocking)
   * @param {string} apiName - API name
   * @param {number} tokens - Number of tokens to consume (default 1)
   * @returns {Promise<void>} Resolves when tokens acquired
   */
  async acquire(apiName, tokens = 1) {
    const limiter = this.limiters[apiName];
    if (!limiter) {
      console.warn(`[RateLimit] No limiter configured for ${apiName}`);
      return; // Allow if not configured
    }

    await limiter.waitForTokens(tokens);
  }

  /**
   * Get status of all rate limiters
   */
  getStatus() {
    return Object.entries(this.limiters).map(([name, limiter]) => limiter.getStatus());
  }

  /**
   * Reset a specific rate limiter
   */
  reset(apiName) {
    const limiter = this.limiters[apiName];
    if (limiter) {
      limiter.reset();
    }
  }

  /**
   * Reset all rate limiters
   */
  resetAll() {
    Object.values(this.limiters).forEach(limiter => limiter.reset());
  }

  /**
   * Stop all rate limiters (cleanup)
   */
  destroy() {
    Object.values(this.limiters).forEach(limiter => limiter.stop());
    console.log('[RateLimit] All limiters stopped');
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
