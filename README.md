```markdown
# @token-ring/workflow

The `@token-ring/workflow` package provides the core building blocks to define, run, and observe workflows in the Token Ring ecosystem. It centers around Runnable-based workflows that emit a typed event stream while executing, allowing UIs, CLIs, and services to provide live feedback, persist progress, resume runs, and collect structured outputs.

This package is designed to be used both programmatically and via chat/CLI commands (e.g., `/workflow`, `/plan`, `/apply`, `/analyze`).

## Highlights

- Register and run workflows built from Runnables
- Stream structured, typed workflow events (step start/end, logs, partial/final outputs, errors)
- Await final results or access the output schema
- Cancel and resume executions using pluggable execution storage
- Optional input/output validation via schemas provided by the workflow module
- Utility helpers to orchestrate tasks (flow, parallel, queue, etc.)
- Chat commands to list, run, and debug workflows, or plan/apply multi-step tasks

---

## Core Exports

- `WorkflowService` — Orchestrates registration, execution, listing, and retrieval of workflows.
- `WorkflowResponse` — A wrapper for an async workflow event stream with helpers for final response and schema.
- `workflowEvents` — Type definitions for all event shapes the workflow stream can emit.
- `WorkflowExecutionStorage`, `EphemeralWorkflowExecutionStorage` — Abstraction and in-memory implementation for execution state and events.
- `flow`, `parallel`, `all`, `queue`, `deferred`, `recursiveProcessor` — Utilities for building higher-level orchestration patterns.
- `chatCommands` — Chat/CLI commands: `workflow`, `plan`, `apply`, `analyze`.

See `pkg/workflow/index.ts` for the public surface.

---

## Concepts

### Runnable-based workflows
Workflows are composed of Runnables. A Runnable’s `invoke()` typically returns an async generator that yields `WorkflowEvent` objects and eventually returns a final value. `WorkflowService` executes a registered Runnable and exposes its lifecycle via a `WorkflowResponse`.

### Events
Event types are defined in `workflowEvents.ts` and include:
- `step_start`, `step_end`
- `log` (debug/info/warn/error)
- `output_chunk`, `final_output`
- `schema_definition`
- `workflow_error`
- `human_approval_required`, `human_approval_completed`

### Execution storage and resumption
`WorkflowExecutionStorage` abstracts storage for events, status, and outputs. `EphemeralWorkflowExecutionStorage` is the default in-memory implementation used by `WorkflowService`. You can supply a custom storage in the constructor to enable persistence and resumption across process restarts.

Additionally, `persistenceProvider.ts` contains an abstract `PersistenceProvider` and a simple `InMemoryPersistenceProvider` showing how step-level state could be saved and used to resume a workflow from the next step.

---

## Usage (Programmatic)

Register a Runnable workflow and run it through `WorkflowService`:

```ts
import { WorkflowService, EphemeralWorkflowExecutionStorage } from "@token-ring/workflow";
import { Registry } from "@token-ring/registry";
import { Runnable } from "@token-ring/runnable"; // Path depends on your setup

// Define a simple Runnable that emits events and returns a result
class MyWorkflow extends Runnable {
  description = "Example workflow";
  async *invoke(input: any, context: any) {
    const base = { runnableName: "MyWorkflow", timestamp: Date.now() };
    yield { ...base, type: "step_start", input };
    yield { ...base, type: "log", level: "info", message: "Working..." };
    const result = { ok: true, value: String(input).toUpperCase() };
    yield { ...base, type: "final_output", data: result };
    return result;
  }
}

// Set up registry and service
const registry = new Registry();
const workflowService = new WorkflowService({ executionStorage: new EphemeralWorkflowExecutionStorage() });
await workflowService.start(registry);
workflowService.registerWorkflow("myWorkflow", new MyWorkflow());

// Start execution
const handle = await workflowService.startWorkflow("myWorkflow", { text: "hello" });

// Stream events
const stream = handle.stream();
stream.on("event", (evt) => console.log("event:", evt));
stream.on("end", (final) => console.log("end:", final));
stream.on("error", (err) => console.error("error:", err));

// Await final result
const result = await handle.result();
console.log("final result:", result);
```

Alternatively, use `WorkflowService.run()` with a module export that defines `execute()` (and optionally `inputSchema`/`outputSchema`):

```ts
import { z } from "zod";

export const inputSchema = z.object({ prompt: z.string() });
export const outputSchema = z.array(z.string());

export async function execute(input: z.infer<typeof inputSchema>, registry: Registry) {
  // ... use services from registry, call models, etc.
  return [input.prompt, "processed"]; // Validated on return if outputSchema is provided
}

// then elsewhere
const output = await workflowService.run({ execute, inputSchema, outputSchema }, { prompt: "Hello" }, registry);
```

---

## Usage (Chat/CLI)

This package exposes chat commands to integrate with Token Ring’s chat interface:

- `/workflow list` — List registered workflows.
- `/workflow run <name> [args]` — Run a registered workflow; if the Runnable defines `parseArgs(string)`, it will be used to parse `[args]`.
- `/workflow debug [on|off]` — Toggle or show workflow debug mode in the service.
- `/plan <prompt>` — Generate a plan of tasks (uses the task-planner workflow under the hood) and store it in `WorkflowService`.
- `/apply` — Execute the current plan sequentially. Uses `flow()` utilities and can fall back to prompt analysis where needed.
- `/analyze <options> -- <prompt>` — Analyze complexity of a prompt and either execute directly or plan subtasks, then run them.

See `pkg/workflow/commands/*.ts` for details.

---

## WorkflowResponse API (at a glance)

- `stream(): AsyncGenerator<WorkflowEvent, any, void>` — Replayable stream wrapper over the workflow’s event generator.
- `response(): Promise<any>` — Resolves with the final return value, caching it for repeated calls.
- `outputSchema(): Promise<any>` — If a schema was emitted or provided, returns it once available.
- `allEvents(): Promise<WorkflowEvent[]>` — Returns all buffered events.
- Metadata helpers: `workflowInstanceId`, `workflowDefinitionId`.

---

## Storage and Persistence

- Execution-level storage: implement `WorkflowExecutionStorage` to persist executions (events, status, outputs). Use `EphemeralWorkflowExecutionStorage` for in-memory, process-local runs.
- Step-level state: see `PersistenceProvider` and `InMemoryPersistenceProvider` for an approach to saving the “next step” and resuming from it.

---

## Utilities for Orchestration

Use helpers from `flow.ts` to orchestrate tasks:
- `flow(taskName, fn)` — Wrap a task with standardized logging and error handling.
- `parallel(name, count, producer)` — Run N workers in parallel.
- `all(name, producers)` — Run multiple producers and wait for all results.
- `queue({ name, fn, retries }, userFn)` — Create a retrying async queue and push tasks via `userFn`.
- `deferred(taskName, fn)` — Create a lazily-executed task.
- `recursiveProcessor(initialData, options)` — Iterate through passes and subtasks over data.

These are used by the chat commands (e.g., `/apply`) to run a sequence of generated tasks.

---

## Examples

For a more complete demonstration, see:
- `examples/new-workflows-demo.ts` — Demonstrates several orchestrator styles (chaining, routing, parallel, etc.).
- `examples/workflowServiceExample.ts` — Shows `WorkflowService` with event streaming, failure, and (illustrative) resumption patterns.

---

## Notes

- This package depends on other Token Ring packages (e.g., `@token-ring/registry`, `@token-ring/chat`) for integration.
- In production scenarios, provide a durable `WorkflowExecutionStorage` implementation to support resuming and auditing across restarts.

```