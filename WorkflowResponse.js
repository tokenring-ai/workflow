// core/workflow/WorkflowResponse.js

/**
 * @typedef {import('./workflowEvents.js').WorkflowEvent} WorkflowEvent
 * @typedef {import('./workflowEvents.js').WorkflowFinalOutputEvent} WorkflowFinalOutputEvent
 * @typedef {import('./workflowEvents.js').WorkflowSchemaEvent} WorkflowSchemaEvent
 * @typedef {import('./workflowEvents.js').WorkflowResponseType} WorkflowResponseType
 */

/**
 * Wraps the async generator returned by a Runnable's invoke method,
 * providing convenient ways to access the final response, output schema,
 * and the raw event stream.
 *
 * It ensures that terminal operations like `response()` and `outputSchema()`
 * can be called multiple times without re-consuming the generator, by caching
 * their results. The stream itself can be iterated multiple times if the underlying
 * generator supports it or if it's buffered, but typically an async generator is single-pass.
 * This class provides a view over that single pass.
 */
export class WorkflowResponse {
  /** @type {WorkflowResponseType<any>} */
  _asyncGenerator;

  /** @type {any} */
  _initialMetadata;

  /** @type {Promise<any> | null} */
  _responsePromise = null;

  /** @type {Promise<any> | null} */
  _schemaPromise = null;

  /** @type {WorkflowEvent[]} */
  _eventBuffer = [];

  /** @type {boolean} */
  _generatorFullyConsumed = false;

  /** @type {Error | null} */
  _consumptionError = null;

  /** @type {any} */
  _generatorReturnValue = undefined;

  /**
   * @param {WorkflowResponseType<any>} asyncGenerator - The async generator from a Runnable's invoke method.
   * @param {Object} [initialMetadata={}] - Initial metadata like workflowInstanceId, definitionId.
   */
  constructor(asyncGenerator, initialMetadata = {}) {
    this._asyncGenerator = asyncGenerator;
    this._initialMetadata = initialMetadata;
  }

  get metadata() {
    return this._initialMetadata;
  }
  /**
   * Gets the workflow instance ID if provided in initial metadata.
   * @type {string | undefined}
   */
  get workflowInstanceId() {
    return this._initialMetadata?.workflowInstanceId;
  }

  /**
   * Gets the workflow definition ID if provided in initial metadata.
   * @type {string | undefined}
   */
  get workflowDefinitionId() {
    return this._initialMetadata?.workflowDefinitionId;
  }

  /**
   * Returns the raw async generator for iterating over all workflow events.
   * Note: Consuming this stream directly might affect subsequent calls to `response()`
   * or `outputSchema()` if they haven't been resolved yet, unless the stream
   * is carefully handled or buffered by this class (which it currently does).
   * @returns {WorkflowResponseType<any>}
   */
  stream() {
    // This returns a new generator that replays buffered events and then continues with the original.
    // This allows multiple consumers of the stream to see all events from the beginning,
    // provided the original generator hasn't been fully consumed by other methods like response() yet.
    // If it has been fully consumed, it just replays the buffer.

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this; // To capture 'this' for the generator function

    async function* replayableStream() {
      // Yield buffered events first
      for (const event of self._eventBuffer) {
        yield event;
      }

      // If the original generator is not yet fully consumed, continue yielding from it
      if (!self._generatorFullyConsumed && !self._consumptionError) {
        try {
          // Use manual iteration to capture the return value
          let result = await self._asyncGenerator.next();
          while (!result.done) {
            const event = result.value;
            self._eventBuffer.push(event); // Buffer as we go
            yield event;
            result = await self._asyncGenerator.next();
          }
          // Capture the return value when generator is done
          self._generatorReturnValue = result.value;
          self._generatorFullyConsumed = true;
        } catch (err) {
          self._consumptionError = err; // Store error if generator throws
          self._generatorFullyConsumed = true; // Mark as consumed even on error
          // Buffer the error as a workflow_error event if not already an event
           const errorEvent = {
                type: 'workflow_error',
                error: { name: err.name, message: err.message, stack: err.stack },
                timestamp: Date.now(),
                runnableName: self._initialMetadata?.runnableName || 'WorkflowResponseStream',
                workflowInstanceId: self.workflowInstanceId,
            };
            if (!self._eventBuffer.find(e => e.type === 'workflow_error' && e.error.message === err.message)) {
                 self._eventBuffer.push(errorEvent);
            }
            yield errorEvent; // Yield the error event
            // Do not re-throw here, let consumers decide based on the event.
            // If response() or outputSchema() are called, they will handle this error.
          }
      } else if (self._consumptionError) {
          // If already consumed and resulted in an error, re-yield a workflow_error event
          // if not the last one.
          const lastEvent = self._eventBuffer[self._eventBuffer.length -1];
          if(!(lastEvent?.type === 'workflow_error' && lastEvent?.error?.message === self._consumptionError.message)){
            yield {
                type: 'workflow_error',
                error: { name: self._consumptionError.name, message: self._consumptionError.message, stack: self._consumptionError.stack },
                timestamp: Date.now(),
                runnableName: self._initialMetadata?.runnableName || 'WorkflowResponseStream',
                workflowInstanceId: self.workflowInstanceId,
            };
          }
      }
    }
    return replayableStream();
  }

  /**
   * Consumes the event stream and returns the final output of the workflow.
   * This is typically the data from the `WorkflowFinalOutputEvent` or the
   * generator's return value.
   * The result is cached, so subsequent calls return the same promise.
   * @returns {Promise<any>} A promise that resolves to the final workflow output.
   */
  response() {
    if (!this._responsePromise) {
      this._responsePromise = (async () => {
        let finalOutput = undefined;
        let hasFinalOutputEvent = false;
        // Use the replayable stream to ensure we don't miss events
        const eventStream = this.stream();
        try {
          for await (const event of eventStream) {
            if (event.type === 'final_output') {
              finalOutput = /** @type {WorkflowFinalOutputEvent} */ (event).data;
              hasFinalOutputEvent = true;
              // Typically, final_output is the last significant data event.
              // We could break here, but iterating fully ensures generator cleanup
              // and capturing any trailing events or return value.
            }
            // If the generator itself throws an error, it will be caught by the outer try/catch
          }
          // If the generator completes without yielding 'final_output' but returns a value,
          // use the generator's return value (TReturn) as the response.
          if (!hasFinalOutputEvent) {
            if (this._consumptionError) {
              throw this._consumptionError; // Re-throw error if consumption failed before final_output
            }
            // Use the captured generator return value if no final_output event was found
            return this._generatorReturnValue;
          }
          return finalOutput;
        } catch (err) {
           // This catch block handles errors from iterating the stream (e.g., if stream() itself throws or yields an error that's rethrown)
          console.error(`[WorkflowResponse] Error consuming stream for response(): ${err.message}`);
          throw err;
        }
      })();
    }
    return this._responsePromise;
  }

  /**
   * Consumes the event stream and returns the output schema of the workflow,
   * if a `WorkflowSchemaEvent` is yielded.
   * The result is cached.
   * @returns {Promise<any | undefined>} A promise that resolves to the schema or undefined if not found.
   */
  outputSchema() {
    if (!this._schemaPromise) {
      this._schemaPromise = (async () => {
        let schema = undefined;
        const eventStream = this.stream(); // Use the replayable stream
        try {
            for await (const event of eventStream) {
                if (event.type === 'schema_definition') {
                schema = /** @type {WorkflowSchemaEvent} */ (event).schema;
                // Schema found, we can break if we only expect one.
                // Iterating fully ensures other promises like response() can also complete.
                }
            }
            if (this._consumptionError && schema === undefined) {
                // If the stream errored out before a schema was found
                throw this._consumptionError;
            }
            return schema;
        } catch (err) {
            console.error(`[WorkflowResponse] Error consuming stream for outputSchema(): ${err.message}`);
            throw err;
        }
      })();
    }
    return this._schemaPromise;
  }

  /**
   * Collects all events from the stream into an array.
   * Useful for debugging or if all events need to be processed after completion.
   * @returns {Promise<WorkflowEvent[]>} A promise that resolves to an array of all workflow events.
   */
  async allEvents() {
    const events = [];
    const eventStream = this.stream(); // Use the replayable stream
    // No try-catch here, if stream errors, this promise will reject.
    for await (const event of eventStream) {
      events.push(event);
    }
    return this._eventBuffer; // Return the buffer which now contains all events
  }
}

export default WorkflowResponse;
/*

**Key Features of `WorkflowResponse`:**

1.  **Constructor `(asyncGenerator, initialMetadata)`:**
    *   Takes the `AsyncGenerator<WorkflowEvent, any, void>` from `Runnable.invoke()`.
    *   Takes optional `initialMetadata` (like `workflowInstanceId`, `definitionId`).
2.  **`workflowInstanceId` / `workflowDefinitionId` Getters:** Provide access to metadata.
3.  **`stream(): AsyncGenerator<WorkflowEvent, any, void>`:**
    *   This is the core method. It returns a *new* async generator that replays any already buffered events and then continues consuming from the original generator.
    *   It buffers events as they are consumed from the original generator into `_eventBuffer`.
    *   This buffering allows `response()` and `outputSchema()` to work correctly even if called after some initial consumption of `stream()`, and allows multiple calls to `stream()` (though they will all share the same underlying single pass of the original generator).
    *   Handles errors from the underlying generator by storing the error and yielding a `workflow_error` event.
4.  **`response(): Promise<any>`:**
    *   Asynchronously consumes the event stream (via `this.stream()`).
    *   Looks for the `WorkflowFinalOutputEvent` and resolves with its `data`.
    *   Caches the result promise (`_responsePromise`) so subsequent calls don't re-consume.
    *   If the stream consumption resulted in an error before a `final_output` event, it re-throws that error.
5.  **`outputSchema(): Promise<any | undefined>`:**
    *   Similar to `response()`, but looks for `WorkflowSchemaEvent` and resolves with its `schema`.
    *   Caches the result promise (`_schemaPromise`).
6.  **`allEvents(): Promise<WorkflowEvent[]>`:**
    *   Consumes the entire stream and returns an array of all events. Returns the internal buffer which is populated by any method that consumes the stream.
7.  **State Management:**
    *   `_eventBuffer`: Stores events as they are read from the original generator.
    *   `_generatorFullyConsumed`: Tracks if the original generator has been iterated to completion.
    *   `_consumptionError`: Stores any error encountered while consuming the original generator.

This implementation attempts to make the `WorkflowResponse` robust to multiple calls and different ways of consuming the workflow's output and events. The buffering in `stream()` is key to allowing both iterative processing of events and later access to terminal results like the final response or schema.
*/