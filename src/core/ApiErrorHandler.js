/**
 * API Error Handler - Circuit breaker pattern and exponential backoff for API reliability
 *
 * Provides:
 * - Circuit breaker pattern (open/half-open/closed states)
 * - Exponential backoff with jitter
 * - Standardized error handling across all APIs
 * - Retry logic with configurable attempts
 */

/**
 * Circuit Breaker States
 * - CLOSED: Normal operation, requests go through
 * - OPEN: Too many failures, block requests for timeout period
 * - HALF_OPEN: Testing if service recovered, allow one request
 */
const CircuitState = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
};

/**
 * Circuit Breaker for an API endpoint
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;

    // Configuration
    this.failureThreshold = options.failureThreshold || 3; // Open circuit after N failures
    this.successThreshold = options.successThreshold || 2; // Close circuit after N successes
    this.timeout = options.timeout || 5 * 60 * 1000; // 5 minutes before half-open
    this.resetTimeout = options.resetTimeout || 60 * 1000; // 1 minute to reset counters
  }

  /**
   * Check if circuit allows request
   */
  canAttempt() {
    if (this.state === CircuitState.CLOSED) {
      return true;
    }

    if (this.state === CircuitState.OPEN) {
      // Check if timeout has passed
      if (Date.now() >= this.nextAttemptTime) {
        console.log(`[Circuit ${this.name}] Timeout passed, transitioning to HALF_OPEN`);
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false; // Still in timeout
    }

    if (this.state === CircuitState.HALF_OPEN) {
      // Only allow one request in half-open state
      return true;
    }

    return false;
  }

  /**
   * Record successful request
   */
  recordSuccess() {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        console.log(`[Circuit ${this.name}] ${this.successThreshold} successes, closing circuit`);
        this.state = CircuitState.CLOSED;
        this.successCount = 0;
      }
    }
  }

  /**
   * Record failed request
   */
  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      console.log(`[Circuit ${this.name}] Failed in HALF_OPEN, opening circuit`);
      this.openCircuit();
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      console.log(`[Circuit ${this.name}] ${this.failureCount} failures, opening circuit`);
      this.openCircuit();
    }
  }

  /**
   * Open the circuit
   */
  openCircuit() {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.timeout;
    this.successCount = 0;
    console.warn(`[Circuit ${this.name}] Circuit OPEN until ${new Date(this.nextAttemptTime).toLocaleTimeString()}`);
  }

  /**
   * Get circuit status
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime ? new Date(this.nextAttemptTime).toISOString() : null
    };
  }
}

/**
 * Exponential backoff calculator with jitter
 */
class ExponentialBackoff {
  constructor(options = {}) {
    this.baseDelay = options.baseDelay || 1000; // 1 second
    this.maxDelay = options.maxDelay || 60000; // 60 seconds
    this.maxAttempts = options.maxAttempts || 3;
  }

  /**
   * Calculate delay for retry attempt
   * @param {number} attempt - Attempt number (0-indexed)
   * @returns {number} Delay in milliseconds
   */
  getDelay(attempt) {
    if (attempt >= this.maxAttempts) {
      return null; // No more retries
    }

    // Exponential: baseDelay * 2^attempt
    const exponentialDelay = this.baseDelay * Math.pow(2, attempt);

    // Cap at maxDelay
    const delay = Math.min(exponentialDelay, this.maxDelay);

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);

    return Math.round(delay + jitter);
  }

  /**
   * Check if should retry
   */
  shouldRetry(attempt) {
    return attempt < this.maxAttempts;
  }
}

/**
 * API Error Handler - Standardized error handling with circuit breaker
 */
export class ApiErrorHandler {
  constructor() {
    // Circuit breakers for each API
    this.circuits = {
      finnhub: new CircuitBreaker('Finnhub', { failureThreshold: 3, timeout: 5 * 60 * 1000 }),
      twelveData: new CircuitBreaker('TwelveData', { failureThreshold: 3, timeout: 5 * 60 * 1000 }),
      alphaVantage: new CircuitBreaker('AlphaVantage', { failureThreshold: 3, timeout: 5 * 60 * 1000 }),
      polygon: new CircuitBreaker('Polygon', { failureThreshold: 3, timeout: 5 * 60 * 1000 })
    };

    // Backoff strategies for each API
    this.backoff = {
      finnhub: new ExponentialBackoff({ baseDelay: 1000, maxDelay: 30000, maxAttempts: 3 }),
      twelveData: new ExponentialBackoff({ baseDelay: 2000, maxDelay: 60000, maxAttempts: 3 }),
      alphaVantage: new ExponentialBackoff({ baseDelay: 2000, maxDelay: 60000, maxAttempts: 2 }),
      polygon: new ExponentialBackoff({ baseDelay: 1000, maxDelay: 30000, maxAttempts: 3 })
    };
  }

  /**
   * Execute API call with circuit breaker and retry logic
   * @param {string} apiName - API name (finnhub, twelveData, alphaVantage, polygon)
   * @param {Function} apiCall - Async function that makes the API call
   * @param {Object} options - Options { retryable: true, errorContext: {} }
   * @returns {Promise} API response or throws error
   */
  async execute(apiName, apiCall, options = {}) {
    const circuit = this.circuits[apiName];
    const backoff = this.backoff[apiName];
    const retryable = options.retryable !== false; // Default true
    const context = options.errorContext || {};

    if (!circuit) {
      throw new Error(`Unknown API: ${apiName}`);
    }

    // Check circuit breaker
    if (!circuit.canAttempt()) {
      const error = new Error(`[${apiName}] Circuit breaker is OPEN, request blocked`);
      error.code = 'CIRCUIT_OPEN';
      error.nextAttemptTime = circuit.nextAttemptTime;
      throw error;
    }

    let attempt = 0;
    let lastError = null;

    while (attempt < backoff.maxAttempts || !retryable) {
      try {
        const result = await apiCall();
        circuit.recordSuccess();
        return result;
      } catch (error) {
        lastError = error;
        circuit.recordFailure();

        // Check if should retry
        if (!retryable || !backoff.shouldRetry(attempt + 1)) {
          console.error(`[${apiName}] Failed after ${attempt + 1} attempts:`, {
            error: error.message,
            context
          });
          throw this.normalizeError(apiName, error, context);
        }

        // Calculate backoff delay
        const delay = backoff.getDelay(attempt);
        if (delay === null) {
          throw this.normalizeError(apiName, error, context);
        }

        console.warn(`[${apiName}] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, {
          error: error.message,
          context
        });

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }

    throw this.normalizeError(apiName, lastError, context);
  }

  /**
   * Normalize error from different APIs to standard format
   * @param {string} apiName - API name
   * @param {Error} error - Original error
   * @param {Object} context - Additional context
   * @returns {Error} Normalized error
   */
  normalizeError(apiName, error, context = {}) {
    const normalizedError = new Error(error.message || 'Unknown API error');
    normalizedError.api = apiName;
    normalizedError.originalError = error;
    normalizedError.context = context;

    // Detect error type
    if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      normalizedError.code = 'RATE_LIMIT';
      normalizedError.retryable = true;
    } else if (error.message?.includes('quota') || error.message?.includes('limit exceeded')) {
      normalizedError.code = 'QUOTA_EXCEEDED';
      normalizedError.retryable = false;
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      normalizedError.code = 'NETWORK_ERROR';
      normalizedError.retryable = true;
    } else if (error.message?.includes('401') || error.message?.includes('403')) {
      normalizedError.code = 'AUTH_ERROR';
      normalizedError.retryable = false;
    } else if (error.message?.includes('Invalid') || error.message?.includes('not found')) {
      normalizedError.code = 'INVALID_INPUT';
      normalizedError.retryable = false;
    } else {
      normalizedError.code = 'UNKNOWN_ERROR';
      normalizedError.retryable = false;
    }

    return normalizedError;
  }

  /**
   * Get status of all circuit breakers
   */
  getStatus() {
    return Object.entries(this.circuits).map(([name, circuit]) => circuit.getStatus());
  }

  /**
   * Reset a specific circuit breaker
   */
  resetCircuit(apiName) {
    const circuit = this.circuits[apiName];
    if (circuit) {
      circuit.state = CircuitState.CLOSED;
      circuit.failureCount = 0;
      circuit.successCount = 0;
      console.log(`[Circuit ${apiName}] Manually reset to CLOSED`);
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits() {
    Object.keys(this.circuits).forEach(apiName => this.resetCircuit(apiName));
  }
}

// Export singleton instance
export const apiErrorHandler = new ApiErrorHandler();
