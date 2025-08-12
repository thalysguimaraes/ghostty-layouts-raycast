import { exec } from "child_process";
import { promisify } from "util";
import { ScriptExecutionError, withTimeout, withRetry } from "./error-handler";

const execAsync = promisify(exec);

export interface QueuedScript {
  id: string;
  script: string;
  priority: number;
  timeout?: number;
  retries?: number;
}

export interface ScriptResult {
  stdout: string;
  stderr: string;
  executionTime: number;
}

export class AppleScriptQueue {
  private queue: Promise<ScriptResult> = Promise.resolve({} as ScriptResult);
  private pendingScripts: QueuedScript[] = [];
  private isProcessing: boolean = false;
  private abortController?: AbortController;
  private scriptHistory: Map<string, ScriptResult> = new Map();
  private maxHistorySize: number = 100;
  private defaultTimeout: number = 5000;
  private defaultRetries: number = 2;

  constructor(defaultTimeout: number = 5000, defaultRetries: number = 2) {
    this.defaultTimeout = defaultTimeout;
    this.defaultRetries = defaultRetries;
  }

  async execute(
    script: string,
    options: Partial<QueuedScript> = {},
  ): Promise<ScriptResult> {
    const scriptId = options.id || this.generateId();
    const queuedScript: QueuedScript = {
      id: scriptId,
      script,
      priority: options.priority || 0,
      timeout: options.timeout || this.defaultTimeout,
      retries: options.retries ?? this.defaultRetries,
    };

    // Check cache
    const cached = this.scriptHistory.get(script);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    // Add to queue
    this.queue = this.queue.then(() => this.executeScript(queuedScript));
    return this.queue;
  }

  async executePriority(
    script: string,
    priority: number = 10,
  ): Promise<ScriptResult> {
    return this.execute(script, { priority });
  }

  async executeImmediate(script: string): Promise<ScriptResult> {
    // Bypass queue for urgent scripts
    const startTime = Date.now();

    try {
      const result = await withTimeout(
        execAsync(script),
        this.defaultTimeout,
        `Script execution timed out: ${script.substring(0, 50)}...`,
      );

      const executionTime = Date.now() - startTime;
      const scriptResult: ScriptResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime,
      };

      this.cacheResult(script, scriptResult);
      return scriptResult;
    } catch (error) {
      throw new ScriptExecutionError(
        "Immediate script execution failed",
        error,
        script,
      );
    }
  }

  private async executeScript(
    queuedScript: QueuedScript,
  ): Promise<ScriptResult> {
    const startTime = Date.now();
    this.isProcessing = true;

    try {
      const result = await withRetry(
        () =>
          withTimeout(
            execAsync(queuedScript.script),
            queuedScript.timeout || this.defaultTimeout,
            `Script timed out after ${queuedScript.timeout}ms`,
          ),
        {
          maxRetries: queuedScript.retries || this.defaultRetries,
          retryDelay: 500,
          exponentialBackoff: true,
          onRetry: () => {
            // Retrying script attempt
          },
        },
      );

      const executionTime = Date.now() - startTime;
      const scriptResult: ScriptResult = {
        stdout: result.stdout,
        stderr: result.stderr,
        executionTime,
      };

      this.cacheResult(queuedScript.script, scriptResult);
      return scriptResult;
    } catch (error) {
      throw new ScriptExecutionError(
        `Failed to execute script: ${queuedScript.id}`,
        error,
        queuedScript.script,
        queuedScript.retries,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  async executeParallel(scripts: string[]): Promise<ScriptResult[]> {
    const promises = scripts.map((script, index) =>
      this.execute(script, { priority: index }),
    );

    return Promise.all(promises);
  }

  async executeBatch(
    scripts: string[],
    options: { sequential?: boolean; stopOnError?: boolean } = {},
  ): Promise<ScriptResult[]> {
    const { sequential = false, stopOnError = false } = options;
    const results: ScriptResult[] = [];

    if (sequential) {
      for (const script of scripts) {
        try {
          const result = await this.execute(script);
          results.push(result);
        } catch (error) {
          if (stopOnError) {
            throw error;
          }
          // Continue with error result
          results.push({
            stdout: "",
            stderr: error instanceof Error ? error.message : String(error),
            executionTime: 0,
          });
        }
      }
    } else {
      return this.executeParallel(scripts);
    }

    return results;
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
  }

  clear(): void {
    this.queue = Promise.resolve({} as ScriptResult);
    this.pendingScripts = [];
    this.isProcessing = false;
    this.abort();
  }

  clearCache(): void {
    this.scriptHistory.clear();
  }

  private cacheResult(script: string, result: ScriptResult): void {
    // Maintain cache size limit
    if (this.scriptHistory.size >= this.maxHistorySize) {
      const firstKey = this.scriptHistory.keys().next().value;
      if (firstKey !== undefined) {
        this.scriptHistory.delete(firstKey);
      }
    }

    this.scriptHistory.set(script, {
      ...result,
      executionTime: Date.now(), // Use as timestamp for cache validity
    });
  }

  private isCacheValid(cached: ScriptResult): boolean {
    // Cache is valid for 60 seconds
    const cacheAge = Date.now() - cached.executionTime;
    return cacheAge < 60000;
  }

  private generateId(): string {
    return `script-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getQueueStatus(): {
    isProcessing: boolean;
    pendingCount: number;
    cacheSize: number;
  } {
    return {
      isProcessing: this.isProcessing,
      pendingCount: this.pendingScripts.length,
      cacheSize: this.scriptHistory.size,
    };
  }

  async waitForQueue(): Promise<void> {
    await this.queue;
  }
}

// Singleton instance for global use
let globalQueue: AppleScriptQueue | null = null;

export function getGlobalQueue(): AppleScriptQueue {
  if (!globalQueue) {
    globalQueue = new AppleScriptQueue();
  }
  return globalQueue;
}

export function resetGlobalQueue(): void {
  if (globalQueue) {
    globalQueue.clear();
    globalQueue = null;
  }
}

// Convenience functions
export async function executeScript(
  script: string,
  options?: Partial<QueuedScript>,
): Promise<ScriptResult> {
  return getGlobalQueue().execute(script, options);
}

export async function executeScriptImmediate(
  script: string,
): Promise<ScriptResult> {
  return getGlobalQueue().executeImmediate(script);
}

export async function executeScriptBatch(
  scripts: string[],
  options?: { sequential?: boolean; stopOnError?: boolean },
): Promise<ScriptResult[]> {
  return getGlobalQueue().executeBatch(scripts, options);
}
