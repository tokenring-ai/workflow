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

## Installation

```bash
bun add @tokenring-ai/workflow
```

Then install the workflow plugin in your TokenRing application.

## Plugin Configuration

The plugin takes a single setting: the directory workflows are read from and written to.

```yaml
workflows:
  workflowDirectory: /path/to/project/.tokenring/workflows
```

TokenRing One defaults this to `<dataDirectory>/workflows` (that is, `.tokenring/workflows` in the project).

## Workflow File Format

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

Steps are ordinary agent commands, so anything valid in chat works:

```yaml
steps:
  - /tools enable @tokenring-ai/research/research
  - /chat Research the latest AI developments
  - /chat Write an article based on the research
```

Files that fail validation (for example a missing `agentType`) are skipped when listing workflows and logged, so one bad
file never hides the rest.

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

## WorkflowService API

```typescript
class WorkflowService implements TokenRingService {
  constructor(app: TokenRingApp, config: ParsedWorkflowConfig);

  reconfigure(newConfig: ParsedWorkflowConfig): void;

  /** Directory workflow YAML files are read from and written to. */
  getWorkflowDirectory(): string;

  /** Every valid workflow in the directory, sorted by name. */
  listWorkflows(): Promise<Workflow[]>;

  /** A single workflow, or null when the file does not exist. */
  getWorkflow(name: string): Promise<Workflow | null>;

  /** Writes a new workflow file; throws when one already exists. */
  createWorkflow(name: string, workflow: WorkflowItemInput): Promise<Workflow>;

  /** Overwrites an existing workflow file; throws when it does not exist. */
  updateWorkflow(name: string, workflow: WorkflowItemInput): Promise<Workflow>;

  /** Deletes the workflow file, returning false when there was nothing to delete. */
  deleteWorkflow(name: string): Promise<boolean>;

  /** Spawns an agent of the workflow's agent type and runs the workflow on it. */
  spawnWorkflow(name: string, options: { headless: boolean }): Promise<Agent>;

  /** Every tracked run, oldest first, including finished ones. */
  getRuns(): WorkflowRun[];
}
```

`Workflow` is the file body (`WorkflowItem`) plus the `name` taken from the file name and the file's `updatedAt`
timestamp. Writes are atomic (temp file + rename) and always schema-validated, so a partially written or invalid
workflow is never persisted.

`spawnWorkflow()` validates that the workflow's `agentType` exists and throws a `ConfigurationError` when it does not —
agent types are checked at spawn time rather than at startup, because workflow files can change while the app is
running.

## Run Tracking

Running a workflow is the service's job, not a chat command's: `spawnWorkflow()` records the run in the app-level
`WorkflowState` slice, spawns the agent, and then sends the agent one step at a time, waiting for each step's response
before sending the next. The run stops at the first step that does not succeed.

Each run holds `{ id, workflowName, displayName, agentType, agentId, steps, currentStep, status, message, startedAt,
finishedAt }`, where `status` is one of `starting`, `running`, `completed`, `failed`, or `cancelled`, and `currentStep`
is the index of the step being executed (`steps.length` once the run completes). The steps are snapshotted when the run
starts, so editing the workflow file mid-run does not change what the agent is running.

Finished runs are kept for history (the newest 50); in-flight runs are never trimmed. Because agents do not survive a
restart, any run still in flight when state is restored is recorded as `cancelled`.

## RPC Endpoints

Registered under `/rpc/workflow`:

| Method                 | Type     | Input                 | Output                             |
|------------------------|----------|-----------------------|------------------------------------|
| `listWorkflows`        | query    | `{}`                  | Array of workflows                 |
| `getWorkflowDirectory` | query    | `{}`                  | `{ directory }`                    |
| `getWorkflow`          | query    | `{ name }`            | `{ workflow }` (nullable)          |
| `createWorkflow`       | mutation | `{ name, workflow }`  | `{ workflow }`                     |
| `updateWorkflow`       | mutation | `{ name, workflow }`  | `{ workflow }`                     |
| `deleteWorkflow`       | mutation | `{ name }`            | `{ success }`                      |
| `spawnWorkflow`        | mutation | `{ name, headless? }` | `{ id, displayName, description }` |
| `streamWorkflowRuns`   | stream   | `{}`                  | `{ status, runs }` on every change  |

Each workflow object is `{ name, displayName, category, description, agentType, steps, subAgent, updatedAt }`.

The frontend Workflows app uses these endpoints to list workflows by category, view and edit a workflow's steps and
settings, create and delete workflows, launch one on a new agent, and follow running workflows step by step.

## Integration with TokenRing

- **AgentCommandService**: registers the `/workflow` chat commands
- **AgentManager**: spawns the workflow agent and validates the workflow's agent type
- **RpcService**: exposes the workflow endpoints to clients
- **Configuration System**: supplies (and can reconfigure) the workflow directory

## Testing

```bash
bun test              # run all tests
bun test --watch      # watch mode
bun test --coverage   # with coverage
```

- `WorkflowService.test.ts` covers the on-disk CRUD: creating, reading, updating, deleting, listing (including skipping
  invalid files), name validation, schema defaults, and multi-line step round-tripping.
- `WorkflowService.test.ts` also covers run tracking: stepping a run to completion, stopping at a failing step, and
  refusing unknown workflows or agent types.
- `commands/workflow.test.ts` covers the chat commands against a temporary workflow directory.

## Package Structure

```text
plugin/workflow/
├── index.ts                 # Public exports (WorkflowService, schema types)
├── plugin.ts                # Plugin definition
├── schema.ts                # Workflow file schema and plugin config schema
├── WorkflowService.ts       # File-backed workflow storage, spawning, and step execution
├── WorkflowService.test.ts  # Service unit tests
├── commands.ts              # Command registry
├── commands/
│   ├── workflow/
│   │   ├── list.ts          # /workflow list
│   │   └── spawn.ts         # /workflow spawn
│   └── workflow.test.ts     # Command unit tests
├── state/
│   └── workflowState.ts     # App-level state slice tracking every run
└── rpc/
    ├── schema.ts            # JSON-RPC schema
    └── workflow.ts          # JSON-RPC endpoint implementation
```

## Dependencies

- `@tokenring-ai/app` — application framework, atomic YAML writes, configuration
- `@tokenring-ai/agent` — agent orchestration, sub-agent configuration schema
- `@tokenring-ai/rpc` — JSON-RPC endpoint management
- `@tokenring-ai/utility` — error formatting and helpers
- `zod` — schema validation

## License

MIT License - see [LICENSE](./LICENSE) file for details.
