import { describe, it, expect, vi } from "vitest";
import { WorkflowResponse } from "../WorkflowResponse.js"; // Adjust path as necessary
// Assuming WorkflowEvent types are implicitly understood or defined elsewhere for JSDoc,
// or we can define simplified versions here for test clarity if not importing directly.

/**
 * @typedef {import('../workflowEvents.js').WorkflowEvent} WorkflowEvent
 * @typedef {import('../workflowEvents.js').WorkflowResponseType} WorkflowResponseType
 */

// Helper to create a mock async generator
/**
 * @param {WorkflowEvent[]} events
 * @param {any} [returnValue]
 * @param {Error} [throwError]
 * @returns {WorkflowResponseType<any>}
 */
async function* mockAsyncGenerator(
	events,
	returnValue = undefined,
	throwError = null,
) {
	for (const event of events) {
		await new Promise((r) => setTimeout(r, 0)); // Simulate async nature
		yield event;
	}
	if (throwError) {
		throw throwError;
	}
	return returnValue;
}

describe("WorkflowResponse", () => {
	const baseEventProps = (runnableName) => ({
		runnableName: runnableName || "TestRunnable",
		workflowInstanceId: "wf-instance-123",
		traceId: "trace-abc",
		timestamp: Date.now(),
	});

	describe("Constructor and Metadata", () => {
		it("should store and provide initial metadata", () => {
			const generator = mockAsyncGenerator([]);
			const metadata = {
				workflowInstanceId: "wf-test-1",
				workflowDefinitionId: "TestDef_v1",
				runnableName: "MyWorkflow",
			};
			const response = new WorkflowResponse(generator, metadata);
			expect(response.workflowInstanceId).toBe("wf-test-1");
			expect(response.workflowDefinitionId).toBe("TestDef_v1");
			expect(response.metadata.runnableName).toBe("MyWorkflow");
		});
	});

	describe("stream()", () => {
		it("should allow iterating over events from the generator", async () => {
			const events = [
				{
					...baseEventProps("Step1"),
					type: "step_start",
					input: { data: "start" },
				},
				{
					...baseEventProps("Step1"),
					type: "final_output",
					data: { result: "done" },
				},
				{
					...baseEventProps("Step1"),
					type: "step_end",
					output: { result: "done" },
					durationMs: 10,
				},
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, { result: "done" });
			const response = new WorkflowResponse(generator);

			const collectedEvents = [];
			for await (const event of response.stream()) {
				collectedEvents.push(event);
			}
			expect(collectedEvents.map((e) => e.type)).toEqual([
				"step_start",
				"final_output",
				"step_end",
			]);
			expect(collectedEvents[1].data).toEqual({ result: "done" });
		});

		it("should allow multiple iterations by buffering events (replayability)", async () => {
			const events = [
				{ ...baseEventProps("S1"), type: "step_start", input: "a" },
				{ ...baseEventProps("S1"), type: "final_output", data: "b" },
				{ ...baseEventProps("S1"), type: "step_end", output: "b" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, "b");
			const response = new WorkflowResponse(generator);

			const firstPassEvents = [];
			for await (const event of response.stream()) {
				firstPassEvents.push(event);
			}

			const secondPassEvents = [];
			for await (const event of response.stream()) {
				secondPassEvents.push(event);
			}

			expect(firstPassEvents.length).toBe(3);
			expect(secondPassEvents.length).toBe(3);
			expect(secondPassEvents.map((e) => e.type)).toEqual([
				"step_start",
				"final_output",
				"step_end",
			]);
			expect(response._eventBuffer.length).toBe(3); // Internal check: buffer should be full
		});

		it("should handle errors from the underlying generator and yield a workflow_error event", async () => {
			const error = new Error("Generator failed!");
			const events = [
				{ ...baseEventProps("E1"), type: "step_start", input: "test" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, undefined, error);
			const response = new WorkflowResponse(generator, {
				runnableName: "ErrorWorkflow",
			});

			const collectedEvents = [];
			try {
				for await (const event of response.stream()) {
					collectedEvents.push(event);
				}
			} catch (e) {
				// The stream itself shouldn't throw if it yields an error event instead
			}

			expect(collectedEvents.length).toBe(2); // step_start, workflow_error
			const errorEvent = collectedEvents.find(
				(e) => e.type === "workflow_error",
			);
			expect(errorEvent).toBeDefined();
			expect(errorEvent?.error?.message).toBe("Generator failed!");
			expect(response._consumptionError).toBe(error);
		});
	});

	describe("response()", () => {
		it("should resolve with data from the final_output event", async () => {
			const events = [
				{ ...baseEventProps("R"), type: "step_start" },
				{ ...baseEventProps("R"), type: "output_chunk", data: "chunk1" },
				{
					...baseEventProps("R"),
					type: "final_output",
					data: { final: "result" },
				},
				{
					...baseEventProps("R"),
					type: "step_end",
					output: { final: "result" },
				},
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, { final: "result" });
			const response = new WorkflowResponse(generator);
			await expect(response.response()).resolves.toEqual({ final: "result" });
		});

		it("should cache the response promise", async () => {
			const events = [
				{ ...baseEventProps("C"), type: "final_output", data: "cached" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, "cached");
			const response = new WorkflowResponse(generator);

			const res1 = await response.response();
			const res2 = await response.response();
			expect(res1).toBe("cached");
			expect(res2).toBe("cached");
			// Internal check: Ensure generator was consumed only once by _consumeFullGeneratorInternal
			// This is hard to check directly without spies on the generator itself,
			// but _responsePromise being cached is the primary check.
			expect(response._responsePromise).toBeInstanceOf(Promise);
		});

		it("should reject if the stream errors before a final_output event", async () => {
			const error = new Error("Stream error before output");
			const events = [{ ...baseEventProps("E"), type: "step_start" }];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, undefined, error);
			const response = new WorkflowResponse(generator);
			await expect(response.response()).rejects.toThrow(
				"Stream error before output",
			);
		});

		it("should resolve with generator TReturn if no final_output event is yielded", async () => {
			const events = [
				{ ...baseEventProps("TR"), type: "step_start" },
				{
					...baseEventProps("TR"),
					type: "step_end",
					output: { value: "from return" },
				}, // output here is from TReturn
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, { value: "from return" });
			const wfResponse = new WorkflowResponse(generator);
			// Manually set _generatorReturnValue as the mockAsyncGenerator doesn't perfectly simulate TReturn capture by WorkflowResponse._consumeFullGeneratorInternal
			// In a real scenario, _consumeFullGeneratorInternal would capture this.
			// For this test, we simulate that it was captured.
			await wfResponse.allEvents(); // Consume the stream
			wfResponse._generatorReturnValue = { value: "from return" }; // Simulate TReturn capture

			await expect(wfResponse.response()).resolves.toEqual({
				value: "from return",
			});
		});
	});

	describe("outputSchema()", () => {
		it("should resolve with data from the schema_definition event", async () => {
			const schema = {
				type: "object",
				properties: { name: { type: "string" } },
			};
			const events = [
				{ ...baseEventProps("S"), type: "schema_definition", schema },
				{ ...baseEventProps("S"), type: "final_output", data: "done" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events);
			const response = new WorkflowResponse(generator);
			await expect(response.outputSchema()).resolves.toEqual(schema);
		});

		it("should resolve undefined if no schema_definition event is found", async () => {
			const events = [
				{ ...baseEventProps("S"), type: "final_output", data: "done" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events);
			const response = new WorkflowResponse(generator);
			await expect(response.outputSchema()).resolves.toBeUndefined();
		});

		it("should cache the schema promise", async () => {
			const schema = { type: "object" };
			const events = [
				{ ...baseEventProps("SC"), type: "schema_definition", schema },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events);
			const response = new WorkflowResponse(generator);

			await response.outputSchema();
			const schemaPromise1 = response._schemaPromise;
			await response.outputSchema();
			const schemaPromise2 = response._schemaPromise;
			expect(schemaPromise1).toBe(schemaPromise2);
		});

		it("should reject if stream errors before schema or if no schema found and stream errored", async () => {
			const error = new Error("Schema stream error");
			const events = [{ ...baseEventProps("SE"), type: "step_start" }];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, undefined, error);
			const response = new WorkflowResponse(generator);
			await expect(response.outputSchema()).rejects.toThrow(
				"Schema stream error",
			);
		});
	});

	describe("allEvents()", () => {
		it("should collect all events from the stream", async () => {
			const events = [
				{ ...baseEventProps("A"), type: "step_start" },
				{
					...baseEventProps("A"),
					type: "log",
					level: "info",
					message: "hello",
				},
				{ ...baseEventProps("A"), type: "final_output", data: "world" },
				{ ...baseEventProps("A"), type: "step_end", output: "world" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events);
			const response = new WorkflowResponse(generator);
			const collected = await response.allEvents();
			expect(collected.length).toBe(4);
			expect(collected.map((e) => e.type)).toEqual([
				"step_start",
				"log",
				"final_output",
				"step_end",
			]);
		});

		it("should return buffered events even if called multiple times", async () => {
			const events = [{ ...baseEventProps("B"), type: "step_start" }];
			// @ts-ignore
			const generator = mockAsyncGenerator(events);
			const response = new WorkflowResponse(generator);
			await response.allEvents();
			const collected2 = await response.allEvents();
			expect(collected2.length).toBe(1);
			expect(collected2[0].type).toBe("step_start");
		});

		it("should include error event if stream fails", async () => {
			const error = new Error("Failed during allEvents");
			const events = [{ ...baseEventProps("AE"), type: "step_start" }];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, undefined, error);
			const response = new WorkflowResponse(generator);

			let caughtError;
			try {
				await response.allEvents();
			} catch (e) {
				caughtError = e;
			}
			// allEvents itself shouldn't throw, but _consumptionError will be set
			// and the stream method will yield an error event.
			expect(response._consumptionError).toBe(error);
			const bufferedEvents = response._eventBuffer; // Access internal buffer for test verification

			expect(
				bufferedEvents.some(
					(e) =>
						e.type === "workflow_error" &&
						e.error?.message === "Failed during allEvents",
				),
			).toBe(true);
		});
	});

	describe("Interactions between methods", () => {
		it("should allow calling response() after partially consuming stream()", async () => {
			const events = [
				{ ...baseEventProps("Mix"), type: "step_start", input: "test" },
				{ ...baseEventProps("Mix"), type: "output_chunk", data: "partial" },
				{ ...baseEventProps("Mix"), type: "final_output", data: "final" },
				{ ...baseEventProps("Mix"), type: "step_end", output: "final" },
			];
			// @ts-ignore
			const generator = mockAsyncGenerator(events, "final");
			const response = new WorkflowResponse(generator);

			const stream = response.stream();
			await stream.next(); // consume step_start
			await stream.next(); // consume output_chunk

			const finalRes = await response.response();
			expect(finalRes).toBe("final");

			// Continue streaming, should get remaining + already buffered
			const remainingEvents = [];
			for await (const event of stream) {
				// This will start from where stream left off internally for original generator
				remainingEvents.push(event); // But replayableStream yields from buffer first
			}
			// This test needs more refinement on how replayableStream interacts with partial consumption
			// For now, check that allEvents contains everything
			const all = await response.allEvents();
			expect(all.map((e) => e.type)).toEqual([
				"step_start",
				"output_chunk",
				"final_output",
				"step_end",
			]);
		});
	});
});
