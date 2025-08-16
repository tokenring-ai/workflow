/**
 * @file core/workflow/examples/resilientTaskExample.ts
 * @description Demonstrates building resilient tasks using `Runnable.withRetry` and
 *              `Runnable.withFallbacks` decorators. This example shows how to create a
 *              `Runnable` that retries on specific, transient errors and falls back to
 *              alternative services if the primary service (including its retries) fails.
 *
 * Note:
 * This example primarily focuses on the `withRetry` and `withFallbacks` decorators.
 * The `Runnable`s used within this example (`PrimaryServiceRunnable`, `RunnableLambda` for fallbacks)
 * are still using the `async invoke(...)` that returns a Promise directly, not the
 * `async *invoke(...)` generator pattern. This is because `withRetry` and `withFallbacks`
 * themselves (as of the last refactoring of `runnable.js`) still expect Promise-returning
 * `invoke` methods from the Runnables they wrap.
 *
 * A future refactoring could update these decorators to work with (and propagate)
 * async generator event streams as well.
 *
 * To Run:
 * You would typically import `createResilientTaskRunnable` and `runErrorHandlingDemo`
 * into a test file or another script to execute `runErrorHandlingDemo()`.
 * e.g., `node -e "import('./core/workflow/examples/resilientTaskExample.js').then(m => m.runErrorHandlingDemo().catch(console.error))"`
 */
import {Runnable, RunnableOptions} from "@token-ring/runnable";

// Define interfaces for input and output
interface ServiceInput {
  id: string;

  [key: string]: any;
}

interface ServiceOutput {
  data: string;
  source: string;

  [key: string]: any;
}

interface CustomError extends Error {
  status?: number;
}

// Helper function to format log messages (not fully implemented in original)
function formatLogMessages(event: any): string {
  return `[${event.level || 'INFO'}] ${event.message || JSON.stringify(event)}`;
}

// --- Mock service call functions ---
/** Simulates a primary service that can fail. */
async function primaryServiceCall(input: ServiceInput, attempt: number): Promise<ServiceOutput> {
  console.log(
    `[ExampleService] Attempting primary service with input: ${JSON.stringify(input)}, attempt: ${attempt}`,
  );
  // Simulate failure on first attempt for "good_input_retry"
  if (input.id === "good_input_retry" && attempt < 2) {
    const error: CustomError = new Error(
      "Primary service failed temporarily (simulated 500 error)",
    );
    error.status = 500;
    console.warn(
      `[ExampleService] Primary service simulating 500 error for input "${input.id}" on attempt ${attempt}`,
    );
    throw error;
  }
  // Simulate permanent failure for "bad_input_primary"
  if (input.id === "bad_input_primary") {
    const error: CustomError = new Error(
      "Primary service permanent error (simulated 400 error)",
    );
    error.status = 400;
    console.warn(
      `[ExampleService] Primary service simulating 400 error for input "${input.id}"`,
    );
    throw error;
  }
  console.log(
    `[ExampleService] Primary service success for input "${input.id}" on attempt ${attempt}`,
  );
  return {
    data: `Primary service success for '${input.id}' on attempt ${attempt}`,
    source: "primary",
  };
}

async function fallbackServiceCall(input: ServiceInput): Promise<ServiceOutput> {
  console.log(
    `[ExampleService] Attempting fallback service with input: ${JSON.stringify(input)}`,
  );
  // Simulate failure for "bad_input_fallback"
  if (input.id === "bad_input_fallback") {
    console.warn(
      `[ExampleService] Fallback service simulating failure for input "${input.id}"`,
    );
    throw new Error("Fallback service failed (simulated)");
  }
  console.log(
    `[ExampleService] Fallback service success for input "${input.id}"`,
  );
  return {
    data: `Fallback service success for '${input.id}'`,
    source: "fallback_1",
  };
}

async function criticalFallbackServiceCall(input: ServiceInput): Promise<ServiceOutput> {
  console.log(
    `[ExampleService] Attempting CRITICAL fallback service with input: ${JSON.stringify(input)}`,
  );
  console.log(
    `[ExampleService] CRITICAL fallback service success for input "${input.id}"`,
  );
  return {
    data: `CRITICAL Fallback service success for '${input.id}' - data might be partial`,
    source: "fallback_critical",
  };
}

// --- Create Runnable for Primary Service ---
class PrimaryServiceRunnable extends Runnable {
  private attempts: number = 0;
  private _currentWorkflowContext: WorkflowContext | null = null;

  constructor(options: RunnableOptions = {}) {
    super(options); // Pass options to base
    this.name = options.name || "PrimaryServiceTask"; // Use name from options or default
  }

  // This invoke returns a Promise, not an async generator, as `withRetry` expects.
  async invoke(input: ServiceInput, workflowContext?: WorkflowContext): Promise<ServiceOutput> {
    this._currentWorkflowContext = workflowContext || null; // Set context for this.log/this.error
    this.attempts++;

    // Using `yield this._createLogEvent` is for async* generators.
    // Here, we use the old direct emit or console.log for simplicity as this Runnable
    // is not yet updated to the async* pattern.
    // For consistency with the latest Runnable pattern, this should be an async* generator.
    // However, `withRetry` and `withFallbacks` are not yet refactored to consume async* generators.
    // So, we keep this as Promise-returning for now.
    console.log(
      formatLogMessages(
        this._createLogEvent(
          "info",
          `Invoking for input: ${JSON.stringify(input)}, current instance attempt: ${this.attempts}. Context: ${JSON.stringify(workflowContext)}`,
        ),
      ),
    );

    try {
      const result = await primaryServiceCall(input, this.attempts);
      console.log(
        formatLogMessages(
          this._createLogEvent(
            "info",
            `Succeeded for: ${JSON.stringify(input)}`,
          ),
        ),
      );
      return result;
    } catch (err) {
      const error = err as CustomError;
      console.error(
        formatLogMessages(
          this._createLogEvent(
            "error",
            `Failed for: ${JSON.stringify(input)} with error: ${error.message}. Status: ${error.status}`,
            error,
          ),
        ),
      );
      throw error;
    } finally {
      this._currentWorkflowContext = null;
    }
  }

  private _createLogEvent(level: string, message: string, error?: Error): any {
    return {
      level,
      message,
      error,
      timestamp: Date.now(),
      runnableName: this.name,
      workflowInstanceId: this._currentWorkflowContext?.workflowInstanceId,
      traceId: this._currentWorkflowContext?.traceId,
    };
  }
}

// --- Define the Resilient Task ---
/**
 * Creates a resilient task by wrapping a primary operation with retry logic
 * and fallback operations.
 * @returns The composed resilient runnable.
 */
export function createResilientTaskRunnable(): Runnable {
  // Important: For stateful Runnables like PrimaryServiceRunnable (with its own attempt counter),
  // ensure a new instance is created if you need fresh state for each top-level invoke,
  // or design them to be reset or to take attempt information from context if retry is external.
  // Here, `withRetry` will re-invoke `primaryTask.invoke`, so `primaryTask` instance is reused across retries.
  const primaryTask = new PrimaryServiceRunnable();

  const resilientPrimaryTask = primaryTask.withRetry({
    times: 3, // Max 3 attempts for primaryTask (1st try + 2 retries)
    interval: (retryCount: number) => {
      // retryCount is 1 for the first retry, 2 for the second, etc.
      const delay = retryCount * 100;
      console.log(
        `[RetryLogic] Delaying retry by ${delay}ms for attempt number ${retryCount + 1}`,
      );
      return delay;
    },
    errorFilter: (err: Error) => {
      const error = err as CustomError;
      console.log(
        `[RetryFilter] Evaluating error: "${error.message}" (status: ${error.status})`,
      );
      // Only retry on simulated server errors (5xx)
      if (error.status === 500) {
        console.log("[RetryFilter] Approved retry for 500 error.");
        return true;
      }
      console.log("[RetryFilter] Rejected retry for non-500 error.");
      return false;
    },
  });

  // Fallback Runnables also use Promise-returning invoke for compatibility with current withFallbacks
  const fallbackTask = new RunnableLambda(
    async (input: ServiceInput, workflowContext?: WorkflowContext): Promise<ServiceOutput> => {
      // This lambda's this._currentWorkflowContext will be set by its own invoke wrapper
      // if it were an async* gen. For now, console.log directly.
      // It should ideally also use _createLogEvent and yield.
      const runnable = fallbackTask; // self-reference for name
      console.log(
        `[${runnable.name}] Fallback 1 Invoked. Input:`,
        JSON.stringify(input),
      );
      return fallbackServiceCall(input);
    },
    {name: "FallbackServiceTask_1"},
  );

  const criticalFallbackTask = new RunnableLambda(
    async (input: ServiceInput, workflowContext?: WorkflowContext): Promise<ServiceOutput> => {
      const runnable = criticalFallbackTask;
      console.log(
        `[${runnable.name}] Critical Fallback Invoked. Input:`,
        JSON.stringify(input),
      );
      return criticalFallbackServiceCall(input);
    },
    {name: "CriticalFallbackServiceTask"},
  );

  // Compose with fallbacks. Note: withFallbacks expects an array of runnables.
  return resilientPrimaryTask.withFallbacks([fallbackTask, criticalFallbackTask]);
}

// --- Main Demo Function ---
/**
 * Runs a demonstration of the resilient task, showcasing retry and fallback behaviors.
 */
export async function runErrorHandlingDemo(): Promise<void> {
  console.log("--- Starting Resilient Task Demo ---");

  // Create a new resilient task instance for each scenario or ensure statelessness if reused.
  // const resilientTask = createResilientTaskRunnable();
  // resilientTask.name = "MyResilientTaskWithFallbacks"; // Name can be set on instance

  // Minimal context for this example, as it doesn't use WorkflowService here.
  const exampleContext: WorkflowContext = {
    traceId: `trace-resilient-${Date.now()}`,
    // registry: new ServiceRegistry(), // If any deeper runnables needed it
  };

  const testCases = [
    {
      id: "good_input_retry",
      description: "Successful after one retry on primary",
    },
    {
      id: "bad_input_primary",
      description: "Non-retriable error on primary, success on first fallback",
    },
    {
      id: "bad_input_fallback",
      description:
        "Primary fails (non-retriable), first fallback fails, success on critical fallback",
    },
    {
      id: "direct_success",
      description: "Direct success on primary, no retries/fallbacks",
    },
  ];

  for (const testCase of testCases) {
    console.log(
      `\n--- Testing Case: ${testCase.description} (Input ID: ${testCase.id}) ---`,
    );
    // For stateful runnables like PrimaryServiceRunnable, if you want a fresh state for each test case,
    // you should ideally recreate the `resilientTask` or ensure the runnable's state is reset.
    // `createResilientTaskRunnable()` creates new instances, so this is fine.
    const taskForTestCase = createResilientTaskRunnable();
    taskForTestCase.name = `ResilientTaskFor_${testCase.id}`;

    try {
      // Reset attempts for the specific PrimaryServiceRunnable instance if it's being reused.
      // However, createResilientTaskRunnable() creates a new PrimaryServiceRunnable instance each time.
      // If PrimaryServiceRunnable's 'attempts' was meant to track across retries of a single call,
      // the withRetry mechanism handles that by re-calling invoke on the *same* instance.
      // The internal `this.attempts` in PrimaryServiceRunnable will thus correctly track attempts for a single `invoke` sequence (including retries).

      const result = await taskForTestCase.invoke({id: testCase.id}, exampleContext);
      console.log(
        `SUCCESS Case "${testCase.description}":`,
        JSON.stringify(result, null, 2),
      );
    } catch (e) {
      const error = e as Error;
      console.error(
        `FAILURE Case "${testCase.description}": ${error.message}. Full Error:`,
        e,
      );
    }
  }
  console.log("\nError handling demo finished.");
}

// To run this example, you might import and call runErrorHandlingDemo() from another file,
// or use a simple runner script if this were a standalone package.
// e.g. runErrorHandlingDemo();
export default {createResilientTaskRunnable, runErrorHandlingDemo};