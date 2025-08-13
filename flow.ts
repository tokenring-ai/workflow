import { AsyncLocalStorage } from "node:async_hooks";
import asyncQueue from "async-es/queue";

interface FlowContext {
  cache: Map<string, any>;
  taskPath: string;
  emit: ((event: string, data: any) => void) | null;
  queue?: any;
}

const cacheStorage = new AsyncLocalStorage<FlowContext>();
const maxRetries = 3; // Default maxRetries for tasks processed by the root flow's queue.

/**
 * Create a new flow and store it's artifact cache
 * @param taskName - Name of the sub-workflow task
 * @param taskFn - Function that uses the sub-workflow
 * @returns Result of the sub-workflow execution
 */
export async function flow<T = any>(
	taskName: string,
	taskFn: () => Promise<T> | T,
): Promise<T> {
	const parent = cacheStorage.getStore();
	if (parent == null) {
		const queue = asyncQueue(async (task, done) => {
			// This queue is for the root flow instance.
			// It provides a coarse-grained retry mechanism for tasks (task.fn) submitted to it.
			// If task.fn internally uses Runnables with their own .withRetry() or .withFallbacks(),
			// those will be handled first. This queue's retry is a last resort if the task.fn()
			// itself ultimately throws an error after its internal handling.
			try {
				const result = await task.fn();
				done(null, result);
			} catch (err) {
				// The `task.retries` here is the retry count for *this specific queue's processing* of task.fn.
				// It's distinct from any retries that might happen inside task.fn if it uses Runnables.
				// `maxRetries` is the limit for this queue's retry attempts.
				if (task.retries < (task.maxRetriesConfigured || maxRetries)) {
					// task.maxRetriesConfigured could come from queue() call
					task.retries++;
					// TODO: Consider adding a delay here, perhaps configurable or exponential.
					console.log(
						`[FlowQueue] Retrying task "${task.label}", attempt ${task.retries + 1}/${(task.maxRetriesConfigured || maxRetries) + 1}`,
					);
					queue.push(task); // Re-queue the task for another attempt
				} else {
					console.error(
						`❌ [FlowQueue] Task "${task.label}" failed after ${(task.maxRetriesConfigured || maxRetries) + 1} attempts:`,
						err.message,
					);
					done(err); // Final failure after exhausting this queue's retries
				}
			}
		}, 10); // Concurrency for this root flow's task queue.

		const res = await cacheStorage.run(
			{
				cache: new Map(),
				taskPath: "",
				emit: null,
				queue,
			},
			() => flow(taskName, taskFn),
		);

		await queue.drain();
		return res;
	}

	const { cache, emit } = parent;
	const taskPath = parent.taskPath + taskName;

	if (cache.has(taskPath)) {
		const cachedResult = cache.get(taskPath);
		emit?.("taskCacheHit", { taskPath, result: cachedResult });
		return cachedResult;
	}

	emit?.("taskStart", { taskPath });

	try {
		const result = await cacheStorage.run({ cache, taskPath, emit }, taskFn);

		emit?.("taskSuccess", { taskPath, result });
		cache.set(taskName, result);
		return result;
	} catch (error) {
		emit?.("taskError", { taskPath, error });
		throw error;
	}
}

/**
 * Run a producer function multiple times in parallel to generate results
 * @param name - Name of the sub-workflow task
 * @param count - Number of parallel executions
 * @param producer - Function that produces a result (can be async)
 * @returns Array of results from the parallel executions
 */
export async function parallel<T = any>(
	name: string,
	count: number,
	producer: (index: number) => Promise<T> | T,
): Promise<T[]> {
	const flows = [];
	for (let i = 0; i < count; i++) {
		flows.push(flow(`${name} [${i}/${count}]`, () => producer(i)));
	}

	return Promise.all(flows);
}

/**
 * Run a producer function multiple times in parallel to generate results
 * @param name - Name of the sub-workflow task
 * @param producers - Functions that produce results (can be async)
 * @returns Array of results from the parallel executions
 */
export async function all<T = any>(
	name: string,
	producers: Array<() => Promise<T> | T>,
): Promise<T[]> {
	return Promise.all(
		producers.map((producer, i) =>
			flow(`${name} [${i}/${producers.length}]`, producer),
		),
	);
}

interface QueueOptions {
	name: string;
	fn: () => Promise<any> | any;
	retries?: number;
}

/**
 * Adds a function to the queue and returns a promise that resolves when the item completes.
 * This queue is associated with the nearest `flow()` context.
 * @param options - Options for the queued task.
 * @param options.name - Name of the queued task (for logging).
 * @param options.fn - Function to be executed.
 * @param options.retries - Optional number of retries for this specific task in the flow queue, overriding the default `maxRetries`.
 * @param userFn - Legacy parameter for backward compatibility
 * @returns Promise that resolves with the function's result.
 * @throws Error If called outside of a flow context.
 */
export function queue(
	options: { name: string; fn: () => Promise<any> | any; retries?: number },
	userFn?: () => Promise<any> | any,
): Promise<any> {
	// If userFn is provided, it means the old signature was used.
	// Maintain backward compatibility for a bit, but log a warning.
	if (typeof userFn === "function") {
		console.warn(
			"[FlowQueue] DeprecationWarning: `queue({ name, retries }, fn)` signature is deprecated. Use `queue({ name, fn, retries })` instead.",
		);
		// Adapt to the new structure
		return _queue({ name: options.name, fn: userFn, retries: options.retries });
	}
	// New signature: queue({ name, fn, retries })
	return _queue({ name: options.name, fn: options.fn, retries: options.retries });
}

function _queue({ name, fn, retries: maxRetriesConfigured }: QueueOptions): Promise<any> {
	const parent = cacheStorage.getStore();
	if (!parent || !parent.queue) {
		// Check specifically for parent.queue
		throw new Error(
			"queue must be called within a flow context that has an initialized queue.",
		);
	}

	interface TaskToPush {
		fn: () => Promise<any>;
		label: string;
		retries: number;
		maxRetriesConfigured?: number;
	}
	
	const taskToPush: TaskToPush = {
		fn: () => fn(), // The actual function to execute
		label: name, // Label for logging
		retries: 0, // Initial retry count for this queue's processing of the task
	};

	if (typeof maxRetriesConfigured === "number") {
		taskToPush.maxRetriesConfigured = maxRetriesConfigured; // Store specific retry limit for this task
	}
	// Note: The `asyncQueue` in the root flow initialization is what uses `task.retries`
	// and `maxRetries` (or `task.maxRetriesConfigured`).
	return parent.queue.push(taskToPush);
}

/**
 * Defers execution of a task within a flow context
 * @param taskName - Name of the task within the flow
 * @param taskFn - Function to be executed in the flow
 * @returns A function that will execute the task in a flow context when called
 */
export function deferred<F extends (...args: any[]) => any>(
	taskName: string,
	taskFn: F,
): (...args: Parameters<F>) => Promise<ReturnType<F>> {
	return (...args) => flow(taskName, () => taskFn(...args)) as Promise<ReturnType<F>>;
}

export type ProcessorOptions<T, R, S = any> = {
	processor: (data: T, passInfo: { pass: number }) => Promise<R>;
	generateSubtaskData: (originalResult: R, pass: number) => T[];
	storeSubtaskResult?: (data: T, result: R) => void;
	maxPasses: number;
};

/**
 * Generic recursive processor for handling nested task decomposition
 *
 * @param initialData - The initial data to process
 * @param options - Configuration options
 * @returns The processing result
 */
export async function recursiveProcessor<T, R, S = any>(
	initialData: T,
	{ generateSubtaskData, processor, maxPasses, storeSubtaskResult }: ProcessorOptions<T, R, S>,
): Promise<R> {
	storeSubtaskResult ??= (subtask, result) => {
		(subtask as any).result = result;
	};
	/**
	 * Internal recursive function to process data
	 */
	async function runProcessing(data: T, pass: number): Promise<R> {
		// Process the current data
		const result = await processor(data, { pass });

		// Check if we should continue to the next level of recursion
		if (pass < maxPasses) {
			// Get all subtasks from the result
			const subtasks = generateSubtaskData(result, pass);

			await Promise.all(
				subtasks.map(async (data, i) => {
					// Process the subtask recursively
					const subtaskResult = await runProcessing(data, pass + 1);

					// Store the result back in the subtask
					storeSubtaskResult!(data, subtaskResult);
				}),
			);
		}

		return result;
	}

	// Start the processing with the initial data at pass 1
	return runProcessing(initialData, 1);
}