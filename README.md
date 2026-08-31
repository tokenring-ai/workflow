# @tokenring-ai/workflow

Service for defining and running linear, multi-step agent processes, backed by YAML files on disk.

## Overview

A workflow is an ordered list of agent commands plus the agent type that should run them. Workflows live as YAML files
in a workflow directory — one file per workflow, named after the workflow — so they can be created, edited, and deleted
at runtime (from the Workflows app in the frontend, by an agent, or by hand) without restarting the application or
touching the application configuration.

```text
<workflowDirectory>/
├── bugHunter.yaml
├── documentationUpdater.yaml
└── unitTestUpdater.yaml
```

The package provides chat commands for interactive use, JSON-RPC endpoints for the frontend, and the
`WorkflowService` API for programmatic access.

### Integration Points

- **AgentCommandService**: registers the `/workflow` chat commands
- **AgentManager**: spawns the workflow agent and validates the workflow's agent type
- **RpcService**: exposes the workflow endpoints to clients
- **Configuration System**: supplies (and can reconfigure) the workflow directory

## Installation

```bash
bun add @tokenring-ai/workflow
```

Then install the workflow plugin in your TokenRing application:

```typescript
import TokenRingApp from "@tokenring-ai/app";
import PluginManager from "@tokenring-ai/app/PluginManager";
import workflowPlugin from "@tokenring-ai/workflow/plugin";

const app = new TokenRingApp({
  app: { workingDirectory, workspaceDirectory, configDirectories },
});
const pluginManager = app.addService(new PluginManager(app));
await pluginManager.installPlugins([workflowPlugin]);
```

## Chat Commands

| Command                  | Description                                                                  |
|--------------------------|------------------------------------------------------------------------------|
| `/workflow list`         | List all available workflows with their names, descriptions, and step counts |
| `/workflow spawn <name>` | Spawn a new agent and run a workflow on it                                   |

### `/workflow list`

```bash
/workflow list
# Available workflows:
# **bugHunter**: All-Package Bug Hunter
#     Finds and fixes three small bugs in each package
#     Steps: 3
```

When the workflow directory is empty, the command reports the directory it looked in.

### `/workflow spawn <name>`

Calls `WorkflowService.spawnWorkflow()`, which creates an agent of the workflow's `agentType` and runs the steps on it in
the background. Headless mode is inherited from the parent agent, and the command returns as soon as the agent exists —
progress is followed through `WorkflowState` (see below), not by waiting on the command.

## Tools

This package does not define any tools.

## Configuration

The plugin configuration lives under the `workflows` key and controls where workflow YAML files are stored and how many
finished runs are retained in memory.

```yaml
workflows:
  maxFinishedRuns: 50
  workflowDirectory: workflows
```

| Field                | Type     | Required | Default      | Description                                              |
|----------------------|----------|----------|--------------|----------------------------------------------------------|
| `maxFinishedRuns`    | `number` | no       | `50`         | Maximum number of completed workflow runs to keep in memory |
| `workflowDirectory`  | `string` | no       | `"workflows"` | Directory where workflow YAML files are stored          |

`workflowDirectory` is resolved relative to the application's workspace directory via
`app.getWorkspaceResolvedPath()`. The default `"workflows"` resolves to `<workspaceDirectory>/workflows`.

### Schema Metadata

| Field               | Meta                                                                   |
|---------------------|------------------------------------------------------------------------|
| `workflows`         | label: `Workflows`, description: `Reusable multi-step workflows, backed by YAML files on disk` |
| `maxFinishedRuns`   | description: `Maximum number of completed workflow runs to keep in memory` |
| `workflowDirectory` | description: `Directory where workflow YAML files are stored`          |

### Workflow File Format

The file name is the workflow name, so it is not repeated inside the file. Names must start with a letter or number and
may only contain letters, numbers, hyphens, and underscores.

```yaml
# .tokenring/workflows/bugHunter.yaml
displayName: All-Package Bug Hunter
category: Code Review
description: Finds and fixes three small bugs in each package
agentType: leader
steps:
  - "/function define js getPackageDirectories() { return (await import('fs')).globSync('plugin/*') }"
  - /list @packages = getPackageDirectories()
  - |
    /for $pkg in @packages {
      /eval /agent run --neverFail --type code-quality-engineer Identify 3 small bugs in $pkg and fix each one
    }
subAgent:
  forwardStatusMessages: true
  maxResponseLength: 10000
```

| Field         | Required | Default                         | Description                                                 |
|---------------|----------|---------------------------------|-------------------------------------------------------------|
| `displayName` | yes      | —                               | Human-readable name shown in the UI                         |
| `agentType`   | yes      | —                               | Agent type used to run the workflow                         |
| `category`    | no       | `User-Created Workflows`        | Group heading the workflow is listed under                  |
| `description` | no       | `""`                            | What the workflow does                                      |
| `steps`       | no       | `[]`                            | Ordered agent commands, executed one at a time              |
| `subAgent`    | no       | `SubAgentConfigSchema` defaults | Forwarding/timeout options, kept for agents that run the workflow as a sub-agent |

#### Step Types

Each step is either a plain string or a structured command object.

**Plain string steps** are chat messages fed to the agent verbatim (no leading `/`):

```yaml
steps:
  - /tools enable @tokenring-ai/research/research
  - /chat Research the latest AI developments
  - /chat Write an article based on the research
```

**Structured command steps** describe a command by name, named arguments, and free-text remainder:

```yaml
steps:
  - command: agent run
    arguments:
      type: code-quality-engineer
      bg: true
    remainder: Fix bugs in the packages
```

| Field        | Type                                           | Required | Default | Description                                                        |
|--------------|------------------------------------------------|----------|---------|--------------------------------------------------------------------|
| `command`    | `string`                                       | yes      | —       | Command name without a leading slash (e.g. `"agent run"`)          |
| `arguments`  | `Record<string, string \| number \| boolean>`  | no       | `{}`    | Named `--arg` values and positional values keyed by schema name    |
| `remainder`  | `string`                                       | no       | `""`    | Free-text trailing input (prompts, messages, etc.)                 |

When the step is executed, `formatWorkflowStep` resolves the command's input schema from the live
`AgentCommandService` registry and formats the step into a `/command --args ... remainder` string. Arguments not
covered by a known schema entry are still emitted as `--name value` so unknown commands work.

#### Sub-Agent Configuration

The `subAgent` field uses `SubAgentConfigSchema` from `@tokenring-ai/agent`:

| Field                  | Type      | Default | Description                                      |
|------------------------|-----------|---------|--------------------------------------------------|
| `forwardChatOutput`    | `boolean` | `false` | Forward chat output from the sub-agent           |
| `forwardStatusMessages`| `boolean` | `true`  | Forward status messages from the sub-agent       |
| `forwardSystemOutput`  | `boolean` | `false` | Forward system output from the sub-agent         |
| `forwardHumanRequests` | `boolean` | `true`  | Forward human requests from the sub-agent        |
| `forwardReasoning`     | `boolean` | `false` | Forward reasoning from the sub-agent             |
| `forwardInputCommands` | `boolean` | `true`  | Forward input commands from the sub-agent        |
| `timeout`              | `number`  | `0`     | Timeout in milliseconds (0 = no timeout)         |
| `maxResponseLength`    | `number`  | `10000` | Maximum response length from the sub-agent       |
| `minContextLength`     | `number`  | `1000`  | Minimum context length for the sub-agent         |

Files that fail validation (for example a missing `agentType`) are skipped when listing workflows and logged, so one bad
file never hides the rest.

## Core Components

### WorkflowService

Manages multi-step agent workflows stored as YAML files on disk, and runs them. Layout: `<workflowDirectory>/<name>.yaml`.
Running a workflow spawns an agent of the workflow's agent type and feeds it one step at a time, recording progress in
`WorkflowState` so the UI can follow the run.

#### Service properties

| Property      | Type     | Description                                              |
|---------------|----------|----------------------------------------------------------|
| `name`        | `string` | `"WorkflowService"`                                      |
| `description` | `string` | `"Manages multi-step agent workflows, backed by YAML files on disk"` |

#### WorkflowService methods

| Method | Description |
|--------|-------------|
| `constructor(app: TokenRingApp)` | Initializes the service and the `WorkflowState` slice (fixed at 50 finished runs). |
| `reconfigure(newConfig: ParsedWorkflowConfig): void` | Replaces the stored configuration (workflow directory, max finished runs). |
| `getWorkflowDirectory(): string` | Returns the resolved workflow directory path (via `app.getWorkspaceResolvedPath`). |
| `listWorkflows(): Promise<Workflow[]>` | Every valid workflow in the directory, sorted by name. Files that fail to parse are skipped. |
| `getWorkflow(workflowName: string): Promise<Workflow \| null>` | A single workflow, or `null` when the file does not exist. |
| `createWorkflow(workflowName: string, workflow: WorkflowItemInput): Promise<Workflow>` | Writes a new workflow file; throws when one already exists. |
| `updateWorkflow(workflowName: string, workflow: WorkflowItemInput): Promise<Workflow>` | Overwrites an existing workflow file; throws when it does not exist. |
| `deleteWorkflow(workflowName: string): Promise<boolean>` | Deletes the workflow file, returning `false` when there was nothing to delete. |
| `spawnWorkflow(workflowName: string, options: { headless: boolean }): Promise<Agent>` | Spawns an agent of the workflow's agent type, registers the run in `WorkflowState`, and starts running steps in the background. Returns as soon as the agent exists. |
| `getRuns(): WorkflowRun[]` | Every tracked run, oldest first, including finished ones. |

`Workflow` is the file body (`WorkflowItem`) plus the `name` taken from the file name and the file's `updatedAt`
timestamp. Writes are atomic (temp file + rename) and always schema-validated, so a partially written or invalid
workflow is never persisted.

`spawnWorkflow()` validates that the workflow's `agentType` exists and throws a `ConfigurationError` when it does not —
agent types are checked at spawn time rather than at startup, because workflow files can change while the app is
running.

### WorkflowState

App-level state slice tracking every workflow run: which agent is running it, which step it is on, and how it ended.
Finished runs are kept (trimmed to `maxFinishedRuns`, initialized to 50) so the UI can show recent history. In-flight
runs are never trimmed.

#### State properties

| Property | Type            | Description                                |
|----------|-----------------|--------------------------------------------|
| `runs`   | `WorkflowRun[]` | All tracked runs, oldest first, including finished ones. |
| `maxFinishedRuns` | `number` | Maximum number of finished runs to retain (set at construction). |

#### WorkflowState methods

| Method | Description |
|--------|-------------|
| `constructor(maxFinishedRuns: number)` | Creates the state slice with the given finished-run retention limit. |
| `serialize(): { runs: WorkflowRun[] }` | Returns a deep copy of all runs for persistence. |
| `deserialize(data: { runs: WorkflowRun[] }): void` | Restores runs from persisted data. Any run still in flight is recorded as `cancelled` with message `"Interrupted by an application restart"`. |
| `getRun(runId: string): WorkflowRun \| null` | Returns the run with the given ID, or `null`. |
| `getRunByAgentId(agentId: string): WorkflowRun \| null` | Returns the run associated with the given agent ID, or `null`. |
| `addRun(run: NewWorkflowRun): WorkflowRun` | Registers a new run with status `starting`, `currentStep` 0, and `agentId` `null`. Trims finished runs. |
| `updateRun(runId: string, changes: Partial<Omit<WorkflowRun, "id">>): void` | Applies partial updates to a run (e.g. `agentId`, `currentStep`, `status`, `message`). |
| `finishRun(runId: string, status: WorkflowRunStatus, message: string): void` | Sets the run's terminal status, message, and `finishedAt`. Sets `currentStep` to `steps.length` on completion. Trims finished runs. |

#### WorkflowRun Shape

Each run holds:

| Field           | Type                 | Description                                                                 |
|-----------------|----------------------|-----------------------------------------------------------------------------|
| `id`            | `string`             | Unique run identifier (UUID).                                               |
| `workflowName`  | `string`             | Name of the workflow file.                                                  |
| `displayName`   | `string`             | Display name from the workflow file.                                        |
| `agentType`     | `string`             | Agent type used to run the workflow.                                        |
| `agentId`       | `string \| null`     | Agent ID, or `null` until the agent has been created.                       |
| `steps`         | `WorkflowStep[]`     | Steps snapshotted when the run started; later edits to the file don't affect it. |
| `currentStep`   | `number`             | Index of the step being executed; equals `steps.length` once completed.     |
| `status`        | `WorkflowRunStatus`  | One of `starting`, `running`, `completed`, `failed`, or `cancelled`.        |
| `message`       | `string`             | Last step response, or the reason the run ended.                            |
| `startedAt`     | `number`             | Epoch milliseconds when the run was registered.                             |
| `finishedAt`    | `number \| null`     | Epoch milliseconds when the run ended, or `null` while in flight.           |

### Step Formatting Functions

Exported from `index.ts`, these utilities convert workflow steps into agent input strings.

| Function | Description |
|----------|-------------|
| `formatWorkflowStep(step: WorkflowStep, commandService?: AgentCommandService \| null): string` | Converts a step into the message string sent to the agent. Plain strings pass through unchanged; structured steps are formatted using the live command registry when available. |
| `formatCommandStep(step: WorkflowCommandStep, inputSchema?: AgentCommandInputSchema): string` | Builds the agent input string for a structured command step. Named args are emitted as `--name value`, flags as `--name`, positionals as bare tokens in schema order, and unknown args as `--name value`. |
| `formatWorkflowStepLabel(step: WorkflowStep): string` | Short label for UI lists (runs, previews). Formats structured steps without requiring a live command registry. |

## Services

The plugin registers `WorkflowService` as an application service and wires chat commands and RPC endpoints.

```typescript
import workflowPlugin from "@tokenring-ai/workflow/plugin";
```

### Plugin Lifecycle

This plugin is service-only (no agent lifecycle hooks).

| Property        | Value                                              |
|-----------------|----------------------------------------------------|
| `name`          | `@tokenring-ai/workflow`                           |
| `displayName`   | `Workflow Orchestration`                           |
| `version`       | `0.2.0`                                            |
| `description`   | `Service for defining and running linear, multi-step agent processes.` |
| `configSchema`  | `z.object({ workflows: WorkflowServiceConfigSchema })` |

**`install(app)`:**

1. Waits for `AgentCommandService` and registers the `/workflow list` and `/workflow spawn` commands.
2. Creates and adds a `WorkflowService` instance via `app.addService(new WorkflowService(app))`.
3. Waits for `RpcService` and registers the `/rpc/workflow` endpoint.

**`reconfigure(app, config)`:**

Calls `app.requireService(WorkflowService).reconfigure(config.workflows)` to update the workflow directory and max
finished runs at runtime. The `WorkflowState` retention limit is fixed at construction time (50) and is not updated by
`reconfigure`.

## RPC Endpoints

Registered under `/rpc/workflow`:

| Method                 | Type      | Description                                                               |
|------------------------|-----------|---------------------------------------------------------------------------|
| `listWorkflows`        | `query`   | Returns an array of all valid workflows, sorted by name.                 |
| `getWorkflowDirectory` | `query`   | Returns `{ directory: string }` for the resolved workflow directory.     |
| `getWorkflow`          | `query`   | Returns `{ workflow: Workflow \| null }` for the given `name`.           |
| `createWorkflow`       | `mutation`| Creates a workflow from `{ name, workflow }`; returns `{ workflow }`.    |
| `updateWorkflow`       | `mutation`| Overwrites a workflow from `{ name, workflow }`; returns `{ workflow }`. |
| `deleteWorkflow`       | `mutation`| Deletes a workflow by `name`; returns `{ success: boolean }`.            |
| `spawnWorkflow`        | `mutation`| Spawns a workflow from `{ name, headless? }` (headless defaults to `false`); returns `{ id, displayName, description }`. |
| `streamWorkflowRuns`   | `stream`  | State subscription stream that yields `{ status, runs }` on every state change. |

Each workflow object is `{ name, displayName, category, description, agentType, steps, subAgent, updatedAt }`.

The frontend Workflows app uses these endpoints to list workflows by category, view and edit a workflow's steps and
settings, create and delete workflows, launch one on a new agent, and follow running workflows step by step.

## Package Exports

| Export | Source | Description |
|--------|--------|-------------|
| `WorkflowService` (default) | `WorkflowService.ts` | Service class for file-backed workflow storage, spawning, and step execution. |
| `formatWorkflowStep` | `formatWorkflowStep.ts` | Converts a workflow step into an agent input string. |
| `formatCommandStep` | `formatWorkflowStep.ts` | Formats a structured command step into a `/command --args ...` string. |
| `formatWorkflowStepLabel` | `formatWorkflowStep.ts` | Short label for a workflow step (UI lists, previews). |
| `WorkflowItemSchema`, `WorkflowSchema`, `WorkflowStepSchema`, `WorkflowCommandStepSchema`, `WorkflowRunSchema`, `WorkflowRunStatusSchema`, `WorkflowServiceConfigSchema` | `schema.ts` | Zod schemas for workflow files, runs, and plugin config. |
| Types: `WorkflowItem`, `WorkflowItemInput`, `Workflow`, `WorkflowStep`, `WorkflowStepInput`, `WorkflowCommandStep`, `WorkflowCommandStepInput`, `WorkflowRun`, `WorkflowRunStatus`, `WorkflowServiceConfig`, `ParsedWorkflowConfig` | `schema.ts` | Inferred TypeScript types for all schemas. |

The plugin definition is exported from `plugin.ts` (not re-exported by `index.ts`) and can be imported via
`@tokenring-ai/workflow/plugin`.

## Dependencies

| Package | Purpose |
|---------|---------|
| `@tokenring-ai/app` | Application framework, atomic YAML writes, configuration, state management |
| `@tokenring-ai/agent` | Agent orchestration, sub-agent configuration schema, agent command types |
| `@tokenring-ai/rpc` | JSON-RPC endpoint management |
| `@tokenring-ai/utility` | Error formatting and string helpers |
| `zod` | Schema validation |

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun test --coverage   # with coverage
```

- `WorkflowService.test.ts` covers the on-disk CRUD: creating, reading, updating, deleting, listing (including skipping
  invalid files), name validation, schema defaults, and structured step round-tripping through YAML. It also covers run
  tracking: stepping a run to completion, stopping at a failing step, structured command step formatting during
  execution, and refusing unknown workflows or agent types.
- `commands/workflow.test.ts` covers the chat commands against a temporary workflow directory, including listing
  workflows, spawning agents, inheriting headless mode, and erroring on non-existent workflows.
- `formatWorkflowStep.test.ts` covers step formatting: plain string pass-through, flag and named-arg emission,
  positional emission, quoting values with spaces, omitting false flags and empty values, and label formatting without
  a live command registry.

## Package Structure

```text
plugin/workflow/
├── index.ts                      # Public exports (WorkflowService, schemas, formatting functions)
├── plugin.ts                     # Plugin definition
├── schema.ts                     # Workflow file schema and plugin config schema
├── WorkflowService.ts            # File-backed workflow storage, spawning, and step execution
├── WorkflowService.test.ts       # Service unit tests (CRUD + run tracking)
├── formatWorkflowStep.ts         # Step-to-agent-input formatting utilities
├── formatWorkflowStep.test.ts    # Formatting unit tests
├── commands.ts                   # Command registry
├── commands/
│   ├── workflow/
│   │   ├── list.ts               # /workflow list
│   │   └── spawn.ts              # /workflow spawn
│   └── workflow.test.ts          # Command unit tests
├── state/
│   └── workflowState.ts          # App-level state slice tracking every run
└── rpc/
    ├── schema.ts                 # JSON-RPC schema
    └── workflow.ts               # JSON-RPC endpoint implementation
```

## License

MIT License — see [LICENSE](./LICENSE) file for details.
