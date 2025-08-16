import {Runnable} from "@token-ring/runnable/runnable";
import {describe, expect, it} from "vitest";
import WorkflowService from "../WorkflowService.js";

class SimpleRunnable extends Runnable {
  async* invoke(input: number, context: { abortSignal: AbortSignal }): AsyncGenerator<{
    type: string,
    message: string,
    timestamp: number
  }, number, unknown> {
    for (let i = 0; i < 3; i++) {
      if (context.abortSignal.aborted) {
        throw new Error("aborted");
      }
      yield {type: "log", message: `step${i}`, timestamp: Date.now()};
      await new Promise((r) => setTimeout(r, 50));
    }
    return input * 2;
  }
}

describe("WorkflowService", () => {
  it("runs a workflow and stores events and output", async () => {
    const service = new WorkflowService();
    service.registerWorkflow("test", new SimpleRunnable());
    await service.start({});
    const exec = await service.startWorkflow("test", 5);
    const resultPromise = exec.result();
    const result = await resultPromise;
    expect(result).toBe(10);
    const record = await service.executionStorage.loadExecution(exec.id);
    expect(record.status).toBe("complete");
    expect(record.events.length).toBe(3);
    expect(record.output).toBe(10);
  });

  it("can cancel a running workflow", async () => {
    class SlowRunnable extends Runnable {
      async* invoke(_: unknown, context: { abortSignal: AbortSignal }): AsyncGenerator<{
        type: string,
        message: string,
        timestamp: number
      }, string, unknown> {
        for (let i = 0; i < 100; i++) {
          if (context.abortSignal.aborted) {
            throw new Error("aborted");
          }
          yield {type: "log", message: "tick", timestamp: Date.now()};
          await new Promise((r) => setTimeout(r, 10));
        }
        return "done";
      }
    }

    const service = new WorkflowService();
    service.registerWorkflow("slow", new SlowRunnable());
    await service.start({});
    const exec = await service.startWorkflow("slow");
    exec.cancel();
    const resultPromise = exec.result().catch(() => {
    });
    await resultPromise;
    const record = await service.executionStorage.loadExecution(exec.id);
    expect(record.status).toBe("cancelled");
  });

  it("can resume a workflow", async () => {
    const service = new WorkflowService();
    service.registerWorkflow("test", new SimpleRunnable());
    await service.start({});
    const exec = await service.startWorkflow("test", 2);
    exec.cancel();
    await exec.result().catch(() => {
    });
    const record1 = await service.executionStorage.loadExecution(exec.id);
    expect(record1.status).toBe("cancelled");
    const resumed = await service.resume(exec.id);
    const resultPromise = resumed.result();
    const output = await resultPromise;
    expect(output).toBe(4);
    expect(resumed.id).toBe(exec.id);
    const record2 = await service.executionStorage.loadExecution(resumed.id);
    expect(record2.status).toBe("complete");
  });
});