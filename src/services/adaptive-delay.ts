export class AdaptiveDelay {
  protected baseDelay: number;
  protected maxDelay: number;
  protected minDelay: number;
  private successCount: number = 0;
  private failureCount: number = 0;
  private currentDelay: number;
  private delayHistory: number[] = [];
  private maxHistorySize: number = 10;

  constructor(
    baseDelay: number = 100,
    minDelay: number = 50,
    maxDelay: number = 1000,
  ) {
    this.baseDelay = baseDelay;
    this.minDelay = minDelay;
    this.maxDelay = maxDelay;
    this.currentDelay = baseDelay;
  }

  async wait(): Promise<void> {
    const delay = this.getCurrentDelay();
    await new Promise((resolve) => setTimeout(resolve, delay));
    this.delayHistory.push(delay);
    if (this.delayHistory.length > this.maxHistorySize) {
      this.delayHistory.shift();
    }
  }

  recordSuccess(): void {
    this.successCount++;
    this.failureCount = Math.max(0, this.failureCount - 1);
    this.adjustDelay();
  }

  recordFailure(): void {
    this.failureCount++;
    this.successCount = Math.max(0, this.successCount - 1);
    this.adjustDelay();
  }

  private adjustDelay(): void {
    if (this.successCount >= 3) {
      this.currentDelay = Math.max(this.minDelay, this.currentDelay * 0.8);
    } else if (this.failureCount >= 2) {
      this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);
    }

    if (this.successCount >= 5) {
      this.successCount = 3;
    }
    if (this.failureCount >= 5) {
      this.failureCount = 3;
    }
  }

  private getCurrentDelay(): number {
    return Math.round(this.currentDelay);
  }

  reset(): void {
    this.currentDelay = this.baseDelay;
    this.successCount = 0;
    this.failureCount = 0;
    this.delayHistory = [];
  }

  getAverageDelay(): number {
    if (this.delayHistory.length === 0) return this.baseDelay;
    const sum = this.delayHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.delayHistory.length);
  }

  getStats(): {
    currentDelay: number;
    successCount: number;
    failureCount: number;
    averageDelay: number;
  } {
    return {
      currentDelay: this.currentDelay,
      successCount: this.successCount,
      failureCount: this.failureCount,
      averageDelay: this.getAverageDelay(),
    };
  }
}

export class ContextualDelay extends AdaptiveDelay {
  private contextMap: Map<string, AdaptiveDelay> = new Map();

  async wait(context?: string): Promise<void> {
    if (!context) {
      return super.wait();
    }

    if (!this.contextMap.has(context)) {
      this.contextMap.set(
        context,
        new AdaptiveDelay(this.baseDelay, this.minDelay, this.maxDelay),
      );
    }

    const contextDelay = this.contextMap.get(context)!;
    await contextDelay.wait();
  }

  recordSuccess(context?: string): void {
    if (!context) {
      return super.recordSuccess();
    }

    const contextDelay = this.contextMap.get(context);
    if (contextDelay) {
      contextDelay.recordSuccess();
    }
  }

  recordFailure(context?: string): void {
    if (!context) {
      return super.recordFailure();
    }

    const contextDelay = this.contextMap.get(context);
    if (contextDelay) {
      contextDelay.recordFailure();
    }
  }

  resetContext(context: string): void {
    const contextDelay = this.contextMap.get(context);
    if (contextDelay) {
      contextDelay.reset();
    }
  }

  resetAll(): void {
    super.reset();
    this.contextMap.forEach((delay) => delay.reset());
    this.contextMap.clear();
  }
}
