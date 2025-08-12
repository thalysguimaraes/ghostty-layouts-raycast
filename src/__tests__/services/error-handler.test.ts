import {
  ScriptExecutionError,
  TimeoutError,
  withRetry,
  withTimeout,
  CircuitBreaker,
  createErrorHandler,
} from '../../services/error-handler';

describe('ScriptExecutionError', () => {
  it('should create error with all properties', () => {
    const originalError = new Error('Original error');
    const error = new ScriptExecutionError(
      'Script failed',
      originalError,
      'test script',
      3
    );

    expect(error.message).toBe('Script failed');
    expect(error.name).toBe('ScriptExecutionError');
    expect(error.originalError).toBe(originalError);
    expect(error.script).toBe('test script');
    expect(error.retryCount).toBe(3);
  });
});

describe('TimeoutError', () => {
  it('should create timeout error with timeout value', () => {
    const error = new TimeoutError('Operation timed out', 5000);

    expect(error.message).toBe('Operation timed out');
    expect(error.name).toBe('TimeoutError');
    expect(error.timeoutMs).toBe(5000);
  });
});

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { maxRetries: 2, retryDelay: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should fail after max retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      withRetry(fn, { maxRetries: 2, retryDelay: 10 })
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should call onRetry callback', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('First failure'))
      .mockResolvedValueOnce('success');
    const onRetry = jest.fn();

    await withRetry(fn, { maxRetries: 2, retryDelay: 10, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
  });

  it('should respect shouldRetry function', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Should not retry'));
    const shouldRetry = jest.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { maxRetries: 2, retryDelay: 10, shouldRetry })
    ).rejects.toThrow('Should not retry');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it('should use exponential backoff', async () => {
    jest.useFakeTimers();
    
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('First'))
      .mockRejectedValueOnce(new Error('Second'))
      .mockResolvedValueOnce('success');

    const promise = withRetry(fn, {
      maxRetries: 2,
      retryDelay: 100,
      exponentialBackoff: true,
    });

    // Wait for the promise to complete
    jest.runAllTimers();
    
    const result = await promise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);

    jest.useRealTimers();
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000);

    expect(result).toBe('success');
  });

  it('should reject with TimeoutError if promise takes too long', async () => {
    const promise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 2000);
    });

    const timeoutPromise = withTimeout(promise, 1000, 'Custom timeout message');

    jest.advanceTimersByTime(1000);

    await expect(timeoutPromise).rejects.toThrow(TimeoutError);
    await expect(timeoutPromise).rejects.toThrow('Custom timeout message');
  });

  it('should use default error message if not provided', async () => {
    const promise = new Promise(() => {}); // Never resolves

    const timeoutPromise = withTimeout(promise, 500);

    jest.advanceTimersByTime(500);

    await expect(timeoutPromise).rejects.toThrow('Operation timed out after 500ms');
  });
});

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenMaxAttempts: 2,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should execute function successfully when closed', async () => {
    const fn = jest.fn().mockResolvedValue('success');

    const result = await circuitBreaker.execute(fn);

    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should open after failure threshold', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch (e) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe('open');

    // Should reject immediately when open
    await expect(circuitBreaker.execute(fn)).rejects.toThrow('Circuit breaker is open');
  });

  it('should transition to half-open after reset timeout', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch (e) {
        // Expected
      }
    }

    expect(circuitBreaker.getState()).toBe('open');

    // Advance time to trigger half-open
    jest.advanceTimersByTime(1000);

    // Should attempt execution in half-open state
    const result = await circuitBreaker.execute(fn);
    expect(result).toBe('success');
  });

  it('should close after successful half-open attempts', async () => {
    const fn = jest.fn()
      .mockRejectedValue(new Error('fail'))
      .mockRejectedValue(new Error('fail'))
      .mockRejectedValue(new Error('fail'))
      .mockResolvedValue('success');

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(fn);
      } catch (e) {
        // Expected
      }
    }

    jest.advanceTimersByTime(1000);

    // Execute successfully in half-open state
    for (let i = 0; i < 2; i++) {
      await circuitBreaker.execute(fn);
    }

    expect(circuitBreaker.getState()).toBe('closed');
  });

  it('should provide stats', () => {
    const stats = circuitBreaker.getStats();

    expect(stats.state).toBe('closed');
    expect(stats.failures).toBe(0);
    expect(stats.lastFailureTime).toBeUndefined();
  });

  it('should reset state', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    // Create some failures
    try {
      await circuitBreaker.execute(fn);
    } catch (e) {
      // Expected
    }

    circuitBreaker.reset();

    const stats = circuitBreaker.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.failures).toBe(0);
  });
});

describe('createErrorHandler', () => {
  it('should handle Error instances', () => {
    const handler = createErrorHandler('TestContext');
    const error = new Error('Test error');

    const result = handler(error);

    expect(result).toBe(error);
    expect(console.error).toHaveBeenCalledWith(
      '[TestContext] Test error',
      error.stack
    );
  });

  it('should handle non-Error values', () => {
    const handler = createErrorHandler('TestContext');

    const result = handler('String error');

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('String error');
    expect(console.error).toHaveBeenCalledWith('[TestContext] String error');
  });

  it('should handle null and undefined', () => {
    const handler = createErrorHandler('TestContext');

    const nullResult = handler(null);
    expect(nullResult).toBeInstanceOf(Error);
    expect(nullResult.message).toBe('null');

    const undefinedResult = handler(undefined);
    expect(undefinedResult).toBeInstanceOf(Error);
    expect(undefinedResult.message).toBe('undefined');
  });
});