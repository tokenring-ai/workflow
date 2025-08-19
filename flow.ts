import asyncQueue from "async-es/queue";
import {AsyncLocalStorage} from "node:async_hooks";

interface FlowContext {
  cache: Map<string, unknown>;
  taskPath: string;
  emit: ((event: string, data: unknown) => void) | null;
  queue?: ReturnType<typeof asyncQueue>;
}

const cacheStorage = new AsyncLocalStorage<FlowContext>();
const maxRetries = 3; // Default maxRetries for tasks processed by the root flow's queue.

/**
 * Create a new flow and store its artifact cache
 */
export async function flow<T = unknown>(
  taskName: string,
  taskFn: () => Promise<T> | T,
): Promise<T> {
  const parent = cacheStorage.getStore();
  if (parent == null) {
    const queue = asyncQueue(async (
      task: { fn: () => Promise<unknown>; retries: number; label: string; maxRetriesConfigured?: number },
      done: (err: Error | null, result?: unknown) => void,
    ) => {
      try {
        const result = await task.fn();
        done(null, result);
      } catch (err: unknown) {
        if (task.retries < (task.maxRetriesConfigured ?? maxRetries)) {
          task.retries++;
          console.log(
            `[FlowQueue] Retrying task "${task.label}", attempt ${task.retries + 1}/${(task.maxRetriesConfigured ?? maxRetries) + 1}`,
          );
          queue.push(task);
        } else {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `❌ [FlowQueue] Task "${task.label}" failed after ${(task.maxRetriesConfigured ?? maxRetries) + 1} attempts:`,
            message,
          );
          done(err as Error);
        }
      }
    }, 10);

    const res = await cacheStorage.run(
      {cache: new Map(), taskPath: "", emit: null, queue},
      () => flow(taskName, taskFn),
    );

    await queue.drain();
    return res;
  }

  const {cache, emit} = parent;
  const taskPath = parent.taskPath + taskName;

  if (cache.has(taskPath)) {
    const cachedResult = cache.get(taskPath) as T;
    emit?.("taskCacheHit", {taskPath, result: cachedResult});
    return cachedResult;
  }

  emit?.("taskStart", {taskPath});

  try {
    const result = await cacheStorage.run({cache, taskPath, emit}, taskFn);
    emit?.("taskSuccess", {taskPath, result});
    cache.set(taskPath, result);
    return result;
  } catch (error) {
    emit?.("taskError", {taskPath, error});
    throw error;
  }
}

/**
 * Run a producer function multiple times in parallel to generate results
 */
export async function parallel<T = unknown>(
  name: string,
  count: number,
  producer: (index: number) => Promise<T> | T,
): Promise<T[]> {
  const flows: Promise<T>[] = [];
  for (let i = 0; i < count; i++) {
    flows.push(flow(`${name} [${i}/${count}]`, () => producer(i)));
  }
  return Promise.all(flows);
}

/**
 * Run a set of producer functions in parallel to generate results
 */
export async function all<T = unknown>(
  name: string,
  producers: Array<() => Promise<T> | T>,
): Promise<T[]> {
  return Promise.all(
    producers.map((producer, i) => flow(`${name} [${i}/${producers.length}]`, producer)),
  );
}

interface QueueOptions {
  name: string;
  fn: () => Promise<unknown> | unknown;
  retries?: number;
}

/**
 * Adds a function to the queue and returns a promise that resolves when the item completes.
 * This queue is associated with the nearest `flow()` context.
 */
export function queue(
  options: { name: string; fn: () => Promise<unknown> | unknown; retries?: number },
  userFn?: () => Promise<unknown> | unknown,
): Promise<unknown> {
  if (typeof userFn === "function") {
    console.warn(
      "[FlowQueue] DeprecationWarning: `queue({ name, retries }, fn)` signature is deprecated. Use `queue({ name, fn, retries })` instead.",
    );
    return _queue({name: options.name, fn: userFn, retries: options.retries});
  }
  return _queue({name: options.name, fn: options.fn, retries: options.retries});
}

function _queue({name, fn, retries: maxRetriesConfigured}: QueueOptions): Promise<unknown> {
  const parent = cacheStorage.getStore();
  if (!parent || !parent.queue) {
    throw new Error(
      "queue must be called within a flow context that has an initialized queue.",
    );
  }

  interface TaskToPush {
    fn: () => Promise<unknown> | unknown;
    label: string;
    retries: number;
    maxRetriesConfigured?: number;
  }

  const taskToPush: TaskToPush = {
    fn: () => fn(),
    label: name,
    retries: 0,
  };

  if (typeof maxRetriesConfigured === "number") {
    taskToPush.maxRetriesConfigured = maxRetriesConfigured;
  }

  return parent.queue.push(taskToPush);
}

/**
 * Defers execution of a task within a flow context
 * @param taskName - Name of the task within the flow
 * @param taskFn - Function to be executed in the flow
 * @returns A function that will execute the task in a flow context when called
 */
export function deferred<F extends (...args: unknown[]) => unknown>(
  taskName: string,
  taskFn: F,
): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  return (...args) => flow(taskName, () => taskFn(...args)) as Promise<ReturnType<F>>;
}

export type ProcessorOptions<T, R, S = unknown> = {
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
export async function recursiveProcessor<T, R, S = unknown>(
  initialData: T,
  {generateSubtaskData, processor, maxPasses, storeSubtaskResult}: ProcessorOptions<T, R, S>,
): Promise<R> {
  storeSubtaskResult ??= (subtask, result) => {
    (subtask as any).result = result;
  };

  async function runProcessing(data: T, pass: number): Promise<R> {
    const result = await processor(data, {pass});
    if (pass < maxPasses) {
      const subtasks = generateSubtaskData(result, pass);
      await Promise.all(
        subtasks.map(async (data) => {
          const subtaskResult = await runProcessing(data, pass + 1);
          storeSubtaskResult!(data, subtaskResult);
        }),
      );
    }
    return result;
  }

  return runProcessing(initialData, 1);
}
