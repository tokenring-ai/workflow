# @tokenring-ai/workflow

Service for running multi-step agent workflows with configuration-driven setup and support for agent spawning.

## Overview

The workflow package provides a comprehensive system for defining and executing multi-step workflows within the TokenRing AI ecosystem. It integrates seamlessly with the agent system to run sequential command chains, supporting both direct execution on the current agent and spawning new agents with specific types. The package includes JSON-RPC endpoints for remote workflow management and chat commands for interactive execution.

## Installation

To install this package, add it to your project using bun:

```bash
bun add @tokenring-ai/workflow
```

Then, in your TokenRing application, install the workflow plugin.

## Features

- **Multi-step Workflow Execution**: Execute sequential command chains with any agent commands
- **Agent Spawning**: Create new agents of specified types to run workflows
- **Configuration-driven**: Workflows defined in configuration files with schema validation
- **JSON-RPC API**: Remote workflow management via WebSocket API
- **Interactive Commands**: `/workflow` chat command with subcommands (`list`, `run`, `spawn`)
- **Workflow Listing**: Display available workflows with details
- **Headless Support**: Run workflows in background agents
- **Output Forwarding**: Forward chat, reasoning, human requests, and system output when spawning agents
- **Error Handling**: Comprehensive error handling for workflow execution
- **Comprehensive Testing**: Unit tests for all command implementations

## Chat Commands

The workflow package provides the following chat commands:

### `/workflow`

Manage and run workflows on the current agent.

#### Usage

```
/workflow                    # List all available workflows
/workflow list               # List all available workflows (explicit)
/workflow run <name>         # Run a workflow by name on current agent
/workflow spawn <name>       # Spawn new agent and run workflow
```

#### Subcommands

| Command | Description |
|---------|-------------|
| `list` | List all available workflows with details |
| `run <name>` | Execute a workflow by name on the current agent |
| `spawn <name>` | Spawn a new agent and run the workflow |

#### Examples

```bash
/workflow                    # Display all available workflows with their details
/workflow list               # Display all available workflows with their details
/workflow run content-pipeline  # Execute the content-pipeline workflow on the current agent
/workflow spawn morning-article   # Create a new agent and run the morning-article workflow
```

#### Help Text

```markdown
# /workflow

## Description
Run multi-step workflows on the current agent.

## Usage
/workflow list             - List available workflows
/workflow run <name>       - Run a workflow by name on current agent
/workflow spawn <name>     - Spawn new agent and run workflow

## Example
/workflow run myWorkflow
/workflow spawn myWorkflow
```

## Plugin Configuration

Workflows are configured in your `.tokenring/config.mjs` file. Each workflow defines a sequence of commands that will be executed sequentially.

### Configuration Schema

The configuration schema is defined in `schema.ts`:

```typescript
WorkflowItemSchema = z.object({
  name: z.string(),           // Human-readable workflow name
  description: z.string(),    // Detailed description
  agentType: z.string(),      // Required agent type for execution
  steps: z.array(z.string()), // Sequential commands to execute
})

WorkflowConfigSchema = z.record(z.string(), WorkflowItemSchema)
```

### Configuration Example

```javascript
export default {
  workflows: {
    "morning-article": {
      name: "MarketMinute Morning Article Generator (9AM EST)",
      description: "Automatically write and publish the 9AM EST morning market minute articles",
      agentType: "contentWriter",
      steps: [
        "/tools enable @tokenring-ai/research/research",
        "/tools enable @tokenring-ai/agent/runAgent",
        "/tools enable @tokenring-ai/websearch/searchNews",
        "/chat Write morning market analysis"
      ]
    },
    "daily-report": {
      name: "Daily Report Generator",
      description: "Generate and send daily reports",
      agentType: "reportGenerator",
      steps: [
        "/tools enable @tokenring-ai/database/query",
        "/chat Generate daily metrics report",
        "/chat Send report to team"
      ]
    },
    "content-pipeline": {
      name: "Content Creation Pipeline",
      description: "Research, write, and publish content",
      agentType: "contentWriter",
      steps: [
        "/tools enable @tokenring-ai/research/research",
        "/tools enable @tokenring-ai/websearch/searchNews",
        "/chat Research latest trends in AI",
        "/chat Write article based on research",
        "/chat Publish to blog"
      ]
    }
  }
};
```

## Usage Examples

### Basic Integration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import workflow from "@tokenring-ai/workflow";

const app = new TokenRingApp({
  // Your app configuration
});

app.install(workflow);
```

### Workflow Step Types

Workflow steps can include any valid agent commands:

#### Tool Commands

```typescript
steps: [
  "/tools enable @tokenring-ai/research/research",
  "/tools enable @tokenring-ai/websearch/searchNews"
]
```

#### Chat Commands

```typescript
steps: [
  "/chat Write morning market analysis",
  "/chat Generate daily metrics report"
]
```

#### Mixed Commands

```typescript
steps: [
  "/tools enable @tokenring-ai/database/query",
  "/chat Generate daily metrics report",
  "/chat Send report to team"
]
```

### Complete Content Creation Workflow

```javascript
export default {
  workflows: {
    "research-and-write": {
      name: "Research and Write Article",
      description: "Complete workflow from research to published article",
      agentType: "contentWriter",
      steps: [
        "/tools enable @tokenring-ai/research/research",
        "/tools enable @tokenring-ai/websearch/searchNews",
        "/chat Research latest AI developments",
        "/chat Write comprehensive article",
        "/chat Review and edit content",
        "/chat Publish to blog"
      ]
    }
  }
};

// Execute with:
/workflow run research-and-write
```

### Multi-Agent Workflow

```javascript
export default {
  workflows: {
    "market-analysis": {
      name: "Complete Market Analysis",
      description: "Research, analyze, and report on market trends",
      agentType: "analyst",
      steps: [
        "/tools enable @tokenring-ai/research/research",
        "/tools enable @tokenring-ai/websearch/searchNews",
        "/tools enable @tokenring-ai/database/query",
        "/chat Analyze market data",
        "/chat Generate comprehensive report"
      ]
    }
  }
};

// Execute with:
/workflow spawn market-analysis
```

### Headless Workflow Execution

```javascript
export default {
  workflows: {
    "background-data-processing": {
      name: "Background Data Processing",
      description: "Process data without user interaction",
      agentType: "dataProcessor",
      steps: [
        "/tools enable @tokenring-ai/database/query",
        "/chat Process incoming data batches",
        "/chat Generate summary reports"
      ]
    }
  }
};

// Execute in background:
/workflow spawn background-data-processing
```

## Core Components

### WorkflowService

The main service class that manages workflow execution:

```typescript
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows";

  constructor(private app: TokenRingApp, workflows: ParsedWorkflowConfig)

  // Workflow management
  getWorkflow(name: string): WorkflowItem | undefined
  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>

  // Agent spawning
  async spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Promise<Agent>
}
```

### WorkflowItem Type

Defines the structure for workflow configuration:

```typescript
export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;
// Which resolves to:
{
  name: string;           // Human-readable workflow name
  description: string;    // Detailed description
  agentType: string;      // Required agent type for execution
  steps: string[];        // Sequential commands to execute
}
```

## API Reference

### WorkflowService Methods

#### `getWorkflow(name: string): WorkflowItem | undefined`

Retrieves a workflow by name.

**Parameters:**
- `name`: The workflow identifier

**Returns:**
- WorkflowItem or undefined if not found

#### `listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>`

Lists all available workflows.

**Returns:**
- Array of workflow entries with key and workflow object

#### `spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Promise<Agent>`

Spawns a new agent and runs the specified workflow.

**Parameters:**
- `workflowName`: The name of the workflow to run
- `headless`: Whether to run in headless mode (default: false)

**Returns:**
- Promise resolving to the spawned Agent instance

## RPC Endpoints

The workflow package provides JSON-RPC endpoints under `/rpc/workflow`:

### Endpoints

| Method | Type | Input | Output |
|--------|------|-------|--------|
| `listWorkflows` | query | `{}` | Array of workflow objects |
| `getWorkflow` | query | `{name: string}` | Single workflow object |
| `spawnWorkflow` | mutation | `{workflowName: string, headless?: boolean}` | Agent info object |

### Response Types

**listWorkflows Response:**
```typescript
{
  key: string;           // Workflow identifier
  name: string;          // Human-readable workflow name
  description: string;   // Workflow description
  agentType: string;     // Agent type for execution
  steps: string[];       // List of workflow steps
}
```

**getWorkflow Response:**
```typescript
{
  key: string;           // Workflow identifier
  name: string;          // Human-readable workflow name
  description: string;   // Workflow description
  agentType: string;     // Agent type for execution
  steps: string[];       // List of workflow steps
}
```

**spawnWorkflow Response:**
```typescript
{
  id: string;            // Spawned agent ID
  name: string;          // Spawned agent name
  description: string;   // Spawned agent description
}
```

### Example Usage

```typescript
import {createRPCEndpoint} from "@tokenring-ai/rpc/createRPCEndpoint";
import WorkflowRpcSchema from "./rpc/schema.ts";
import WorkflowService from "./WorkflowService.ts";

// RPC endpoints are automatically registered via plugin
// Example client usage:
const workflows = await rpcClient.listWorkflows({});
const specificWorkflow = await rpcClient.getWorkflow({ name: "morning-article" });
const agent = await rpcClient.spawnWorkflow({ workflowName: "morning-article", headless: true });
```

## Integration with TokenRing

The workflow package integrates with several TokenRing services:

- **AgentCommandService**: Registers chat commands for workflow interaction
- **Agent System**: Supports both current agent execution and agent spawning via `runSubAgent`
- **Plugin System**: Auto-registers with the TokenRing application
- **Configuration System**: Validates workflow configuration through Zod schemas
- **RpcService**: Provides JSON-RPC endpoints for remote access
- **AgentManager**: Handles agent spawning and lifecycle
- **runSubAgent**: Utility for spawning agents with commands

## Execution Flow

1. **Workflow Selection**: User specifies workflow name via `/workflow run` or `/workflow spawn`
2. **Validation**: Workflow existence and configuration validation
3. **Agent Resolution**:
   - `run`: Uses current agent
   - `spawn`: Creates new agent with specified type via `runSubAgent`
4. **Step Execution**: Sequential execution of all workflow steps via `agent.handleInput()`
5. **Command Processing**: Each step processed through the agent's input handler
6. **Output Forwarding**: Results forwarded back to parent agent when spawning (chat, reasoning, human requests, system output)
7. **Completion**: Workflow completes when all steps have been executed

## Error Handling

- **Workflow Not Found**: Clear error message when specified workflow doesn't exist
- **Configuration Validation**: Schema validation ensures proper workflow structure
- **Step Execution**: Individual step failures are reported but don't stop workflow execution
- **Agent Spawning**: Proper error handling for agent creation failures
- **Missing Service**: Clear message when workflow service is not running

## Services

The workflow package provides the following service:

### WorkflowService

The main service class that manages workflow execution and agent spawning.

**Service Interface:**
```typescript
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows";

  // Methods
  getWorkflow(name: string): WorkflowItem | undefined
  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>
  async spawnWorkflow(workflowName: string, options: { headless: boolean }): Promise<Agent>
}
```

## State Management

The workflow package manages workflow state through:

- **Workflow Configuration**: Stored in the application configuration file
- **Runtime State**: WorkflowItem objects loaded into WorkflowService at startup
- **Execution State**: Managed through agent command execution
- **Agent State**: Handled by the agent system during workflow execution

## Testing

The package includes comprehensive unit and integration tests:

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run tests with coverage
bun test --coverage
```

### Test Coverage

- **Command Implementation**: Tests for list, run, and spawn subcommands
- **Workflow Execution**: Tests for workflow step execution
- **Agent Spawning**: Tests for runSubAgent integration
- **Error Handling**: Tests for workflow not found scenarios
- **Input Parsing**: Tests for various input formats and edge cases
- **Integration**: Full workflow execution flow tests

## Package Structure

```
pkg/workflow/
├── index.ts                 # Main exports (WorkflowService, WorkflowItem)
├── plugin.ts                # Plugin definition for TokenRing integration
├── package.json             # Dependencies and scripts
├── README.md                # This file
├── schema.ts                # Zod schema definitions
├── WorkflowService.ts       # Core service implementation
├── chatCommands.ts          # Chat command registry
├── vitest.config.ts         # Vitest configuration
├── commands/
│   └── workflow.ts          # Main /workflow command with subcommand router
│   └── workflow/
│       ├── list.ts          # /workflow list implementation
│       ├── run.ts           # /workflow run implementation
│       └── spawn.ts         # /workflow spawn implementation
├── rpc/
│   ├── schema.ts            # JSON-RPC schema definition
│   └── workflow.ts          # RPC endpoint implementation
└── test/
    └── commands.test.ts     # Unit tests for chat commands
```

## Dependencies

### Production Dependencies

- `@tokenring-ai/app` (0.2.0) - Base application framework
- `@tokenring-ai/agent` (0.2.0) - Agent orchestration and management
- `@tokenring-ai/chat` (0.2.0) - Chat service integration
- `@tokenring-ai/rpc` (0.2.0) - JSON-RPC endpoint management
- `@tokenring-ai/utility` (0.2.0) - Utility functions and helpers
- `zod` (^4.3.6) - Schema validation

### Development Dependencies

- `vitest` (^4.0.18) - Testing framework
- `typescript` (^5.9.3) - TypeScript compiler

## License

MIT License - see [LICENSE](./LICENSE) file for details.
