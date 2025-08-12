export class ScriptExecutionError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
    public readonly script?: string,
    public readonly retryCount?: number,
  ) {
    super(message);
    this.name = "ScriptExecutionError";
  }
}

export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number,
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (error: Error, retryCount: number) => void;
  shouldRetry?: (error: Error) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 500,
    exponentialBackoff = true,
    onRetry,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      const delay = exponentialBackoff
        ? retryDelay * Math.pow(2, attempt)
        : retryDelay;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new TimeoutError(
          errorMessage || `Operation timed out after ${timeoutMs}ms`,
          timeoutMs,
        ),
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxAttempts?: number;
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;
  private state: "closed" | "open" | "half-open" = "closed";
  private halfOpenAttempts = 0;

  constructor(private options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: 5,
      resetTimeout: 60000,
      halfOpenMaxAttempts: 3,
      ...options,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.shouldAttemptReset()) {
        this.state = "half-open";
        this.halfOpenAttempts = 0;
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    return (
      Date.now() - this.lastFailureTime >= (this.options.resetTimeout || 60000)
    );
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= (this.options.halfOpenMaxAttempts || 3)) {
        this.reset();
      }
    }
    this.failures = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= (this.options.failureThreshold || 5)) {
      this.state = "open";
    }

    if (this.state === "half-open") {
      this.state = "open";
    }
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = undefined;
    this.state = "closed";
    this.halfOpenAttempts = 0;
  }

  getState(): string {
    return this.state;
  }

  getStats(): {
    state: string;
    failures: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createErrorHandler(_: string) {
  return (error: unknown): Error => {
    if (error instanceof Error) {
      return error;
    }

    const errorMessage = String(error);
    return new Error(errorMessage);
  };
}
