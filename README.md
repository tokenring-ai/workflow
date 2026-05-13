# @tokenring-ai/workflow

Service for defining and running linear, multi-step agent processes with configuration-driven setup and support for
agent spawning.

## Overview

The workflow package provides a comprehensive system for defining and executing multi-step workflows within the
TokenRing AI ecosystem. It integrates seamlessly with the agent system to run sequential command chains, supporting both
direct execution on the current agent and spawning new agents with specific types. The package includes JSON-RPC
endpoints for remote workflow management and chat commands for interactive execution.

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
- **Interactive Commands**: Three chat commands (`/workflow list`, `/workflow run`, `/workflow spawn`)
- **Workflow Listing**: Display available workflows with details
- **Headless Support**: Run workflows in background agents
- **Error Handling**: Comprehensive error handling for workflow execution
- **Abort Support**: Workflow execution can be aborted via agent abort signal
- **Sub-Agent Configuration**: Customize sub-agent behavior for spawned workflows
- **Comprehensive Testing**: Unit tests for all command implementations

## Chat Commands

The workflow package provides the following chat commands:

| Command                  | Description                                                                  |
|--------------------------|------------------------------------------------------------------------------|
| `/workflow list`         | List all available workflows with their names, descriptions, and step counts |
| `/workflow run <name>`   | Run a workflow by name on the current agent                                  |
| `/workflow spawn <name>` | Spawn a new agent and run a workflow on it                                   |

### `/workflow list`

List all available workflows with their names, descriptions, and step counts.

**Usage:**

```bash
/workflow list
```

**Example:**

```bash
/workflow list
# Output:
# Available workflows:
# **morning-article**: MarketMinute Morning Article Generator (9AM EST)
#     Automatically write and publish the 9AM EST morning market minute articles
#     Steps: 4
# **content-pipeline**: Content Creation Pipeline
#     Research, write, and publish content
#     Steps: 5
```

### `/workflow run <name>`

Run a workflow by name on the current agent. Executes all workflow steps sequentially.

**Usage:**

```bash
/workflow run <name>
```

**Example:**

```bash
/workflow run content-pipeline
# Executes the content-pipeline workflow on the current agent
```

**Behavior:**

- Validates that the workflow exists
- Executes each step in the workflow sequentially via `AgentCommandService.executeAgentCommand()`
- Supports abort signals - workflow can be aborted at any step
- Returns success message when all steps complete

### `/workflow spawn <name>`

Spawn a new agent and run a workflow on it.

**Usage:**

```bash
/workflow spawn <name>
```

**Example:**

```bash
/workflow spawn morning-article
# Creates a new agent of type specified in workflow config and runs the workflow
```

**Behavior:**

- Validates that the workflow exists
- Creates a new sub-agent using `SubAgentService.runSubAgent()` with:
- Agent type from workflow configuration
- Workflow name as the input source (`from: 'Workflow <name>'`)
- Command `/workflow run <name>` as the initial message
- Headless mode from parent agent configuration
- Optional sub-agent configuration from workflow
- Returns success message with workflow display name

## Plugin Configuration

Workflows are configured in your `.tokenring/config.mjs` file. Each workflow defines a sequence of commands that will be
executed sequentially.

### Configuration Schema

The configuration schema is defined in `schema.ts`:

```typescript
WorkflowItemSchema = z.object({
  displayName: z.string(),    // Human-readable workflow name
  description: z.string(),    // Detailed description
  agentType: z.string(),      // Required agent type for execution
  steps: z.array(z.string()), // Sequential commands to execute
  subAgent: SubAgentConfigSchema.prefault({}), // Sub-agent configuration options
})

WorkflowConfigSchema = z.record(z.string(), WorkflowItemSchema)
```

### Configuration Example

```javascript
export default {
  workflows: {
    "morning-article": {
      displayName: "MarketMinute Morning Article Generator (9AM EST)",
      description: "Automatically write and publish the 9AM EST morning market minute articles",
      agentType: "contentWriter",
      steps: [
        "/tools enable @tokenring-ai/research/research",
        "/tools enable @tokenring-ai/agent/runAgent",
        "/tools enable @tokenring-ai/websearch/searchNews",
        "/chat Write morning market analysis"
      ],
      subAgent: {
        // Optional sub-agent configuration
        headless: false,
      }
    },
    "daily-report": {
      displayName: "Daily Report Generator",
      description: "Generate and send daily reports",
      agentType: "reportGenerator",
      steps: [
        "/tools enable @tokenring-ai/database/query",
        "/chat Generate daily metrics report",
        "/chat Send report to team"
      ]
    },
    "content-pipeline": {
      displayName: "Content Creation Pipeline",
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

#### Chat Command Steps

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
      displayName: "Research and Write Article",
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
      displayName: "Complete Market Analysis",
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
      displayName: "Background Data Processing",
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

### Workflow with Sub-Agent Configuration

```javascript
export default {
  workflows: {
    "custom-spawned-workflow": {
      displayName: "Custom Spawned Workflow",
      description: "Workflow with custom sub-agent configuration",
      agentType: "specializedAgent",
      steps: [
        "/tools enable @tokenring-ai/specialized/tool",
        "/chat Perform specialized task"
      ],
      subAgent: {
        headless: true,
        // Additional sub-agent options as needed
      }
    }
  }
};
```

## Core Components

### WorkflowService

The main service class that manages workflow execution:

```typescript
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  readonly description = "Manages multi-step agent workflows";

  readonly workflows = new KeyedRegistry<WorkflowItem>();
  getWorkflow = this.workflows.get;
  listWorkflowEntries = this.workflows.entriesArray;

  constructor(
    private app: TokenRingApp,
    private config: ParsedWorkflowConfig,
  )

  // Workflow management
  getWorkflow(name: string): WorkflowItem | undefined

  listWorkflowEntries(): Array<[string, WorkflowItem]>

  reconfigure(newConfig: ParsedWorkflowConfig): void

  // Agent spawning
  spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Agent
}
```

### WorkflowItem Type

Defines the structure for workflow configuration:

```typescript
export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;
// Which resolves to:
{
  displayName: string;        // Human-readable workflow name
  description: string;        // Detailed description
  agentType: string;          // Required agent type for execution
  steps: string[];            // Sequential commands to execute
  subAgent: SubAgentConfig;   // Sub-agent configuration options
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

#### `listWorkflowEntries(): Array<[string, WorkflowItem]>`

Lists all available workflows as key-value pairs.

**Returns:**

- Array of tuples with workflow name and workflow object

#### `reconfigure(newConfig: ParsedWorkflowConfig): void`

Reconfigures the workflow service with a new configuration.

**Parameters:**

- `newConfig`: The new workflow configuration

#### `spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Agent`

Spawns a new agent and runs the specified workflow on it.

**Parameters:**

- `workflowName`: The name of the workflow to run
- `headless`: Whether to run in headless mode

**Returns:**

- The spawned Agent instance

## RPC Endpoints

The workflow package provides JSON-RPC endpoints under `/rpc/workflow`:

### Endpoints

| Method          | Type     | Input                                | Output                    |
|-----------------|----------|--------------------------------------|---------------------------|
| `listWorkflows` | query    | `{}`                                 | Array of workflow objects |
| `getWorkflow`   | query    | `{name: string}`                     | Single workflow object    |
| `spawnWorkflow` | mutation | `{name: string, headless?: boolean}` | Agent info object         |

### Response Types

**listWorkflows Response:**

```typescript
Array<{
  name: string;           // Workflow identifier
  displayName: string;    // Human-readable workflow name
  description: string;    // Workflow description
  agentType: string;      // Agent type for execution
  steps: string[];        // List of workflow steps
}>
```

**getWorkflow Response:**

```typescript
{
  key: string;            // Workflow identifier
  displayName: string;    // Human-readable workflow name
  description: string;    // Workflow description
  agentType: string;      // Agent type for execution
  steps: string[];        // List of workflow steps
}
```

**spawnWorkflow Response:**

```typescript
{
  id: string;             // Spawned agent ID
  displayName: string;    // Spawned agent display name
  description: string;    // Spawned agent description
}
```

### RPC Example Usage

```typescript
import { createRPCEndpoint } from "@tokenring-ai/rpc/createRPCEndpoint";
import WorkflowRpcSchema from "./rpc/schema.ts";
import WorkflowService from "./WorkflowService.ts";

// RPC endpoints are automatically registered via plugin
// Example client usage:
const workflows = await rpcClient.listWorkflows({});
const specificWorkflow = await rpcClient.getWorkflow({ name: "morning-article" });
const agent = await rpcClient.spawnWorkflow({ name: "morning-article", headless: true });
```

## Integration with TokenRing

The workflow package integrates with several TokenRing services:

- **AgentCommandService**: Registers chat commands for workflow interaction
- **Agent System**: Supports both current agent execution and agent spawning via `SubAgentService`
- **Plugin System**: Auto-registers with the TokenRing application
- **Configuration System**: Validates workflow configuration through Zod schemas
- **RpcService**: Provides JSON-RPC endpoints for remote access
- **AgentManager**: Validates agent types at plugin installation time
- **SubAgentService**: Manages sub-agent creation and workflow execution

## Execution Flow

### `/workflow run` Execution Flow

1. **Workflow Selection**: User specifies workflow name via `/workflow run <name>`
2. **Validation**: Workflow existence validation
3. **Agent Resolution**: Uses current agent for execution
4. **Step Execution**: Sequential execution of all workflow steps via `AgentCommandService.executeAgentCommand()`
5. **Command Processing**: Each step processed through the agent command service
6. **Abort Check**: Each step checks for abort signal before execution
7. **Completion**: Workflow completes when all steps have been executed

### `/workflow spawn` Execution Flow

1. **Workflow Selection**: User specifies workflow name via `/workflow spawn <name>`
2. **Validation**: Workflow existence validation via `workflowService.getWorkflow()`
3. **Sub-Agent Creation**: Creates new sub-agent via `SubAgentService.runSubAgent()` with:

- `agentType`: Agent type from workflow configuration
- `from`: Input source set to `'Workflow <workflowName>'`
- `steps`: Array containing `['/workflow run <workflowName>']`
- `headless`: Headless mode from parent agent configuration (`agent.headless`)
- `parentAgent`: Reference to the parent agent
- `options`: Optional sub-agent configuration from workflow (`workflow.subAgent`)

4. **Return**: Returns success message `"Spawned agent for workflow: <workflow.displayName>"`

## Error Handling

- **Workflow Not Found**: Clear error message when specified workflow doesn't exist
- **Configuration Validation**: Schema validation ensures proper workflow structure
- **Step Execution**: Individual step failures are reported through the agent command system
- **Agent Spawning**: Proper error handling for agent creation failures
- **Missing Agent Type**: Clear message when workflow references non-existent agent type
- **Abort Handling**: Workflow can be aborted at any step via agent abort signal

## Services

The workflow package provides the following service:

### WorkflowService Reference

The main service class that manages workflow execution and agent spawning.

**Service Interface:**

```typescript
export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  readonly description = "Manages multi-step agent workflows";

  readonly workflows: KeyedRegistry<WorkflowItem>;
  getWorkflow: (name: string) => WorkflowItem | undefined;
  listWorkflowEntries: () => Array<[string, WorkflowItem]>;

  // Constructor
  constructor(app: TokenRingApp, config: ParsedWorkflowConfig)

  // Methods
  reconfigure(newConfig: ParsedWorkflowConfig): void
  spawnWorkflow(workflowName: string, options: { headless: boolean }): Agent
}
```

## State Management

The workflow package manages workflow state through:

- **Workflow Configuration**: Stored in the application configuration file
- **Runtime State**: WorkflowItem objects loaded into WorkflowService at startup via KeyedRegistry
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

The test file `commands/workflow.test.ts` includes comprehensive unit tests for all chat command implementations:

- **List Command**: Tests for `/workflow list` command output formatting
- Verifies workflow listing with correct formatting
- Checks workflow display names and descriptions
- Validates step count display

- **Run Command**: Tests for sequential workflow step execution
- Basic workflow execution with multiple steps
- Complex workflow with multiple steps
- Error handling for non-existent workflows

- **Spawn Command**: Tests for sub-agent spawning
- Basic spawning functionality with correct agent type
- Headless mode spawning respects parent agent configuration
- Error handling for non-existent workflows

- **Integration Scenarios**: Full workflow execution and spawn flow tests
- Complete workflow execution flow verification
- Complete workflow spawn flow verification

### Test Structure

```typescript
describe('workflow command', () => {
  // Setup with mock workflows and services

  describe('list command', () => {
    it('should list all workflows', async () => { /* ... */
    })
  });

  describe('run command', () => {
    it('should execute workflow steps', async () => { /* ... */
    })
    it('should handle complex workflow steps', async () => { /* ... */
    })
    it('should show error for non-existent workflow', async () => { /* ... */
    })
  });

  describe('spawn command', () => {
    it('should spawn agent and run workflow', async () => { /* ... */
    })
    it('should handle headless spawning', async () => { /* ... */
    })
    it('should show error for non-existent workflow', async () => { /* ... */
    })
  });

  describe('Integration scenarios', () => {
    it('should handle full workflow execution flow', async () => { /* ... */
    })
    it('should handle full workflow spawn flow', async () => { /* ... */
    })
  });
});
```

## Package Structure

```text
pkg/workflow/
├── index.ts                 # Main exports (WorkflowService, WorkflowItem)
├── plugin.ts                # Plugin definition for TokenRing integration
├── package.json             # Dependencies and scripts
├── README.md                # This file
├── schema.ts                # Zod schema definitions
├── WorkflowService.ts       # Core service implementation
├── vitest.config.ts         # Vitest configuration
├── commands.ts              # Command registry (exports list, run, spawn commands)
├── commands/
│   ├── workflow/
│   │   ├── list.ts          # /workflow list command implementation
│   │   ├── run.ts           # /workflow run command implementation
│   │   └── spawn.ts         # /workflow spawn command implementation
│   └── workflow.test.ts     # Unit tests for chat commands
└── rpc/
    ├── schema.ts            # JSON-RPC schema definition
    └── workflow.ts          # RPC endpoint implementation
```

## Dependencies

### Production Dependencies

- `@tokenring-ai/app` (0.2.0) - Base application framework
- `@tokenring-ai/agent` (0.2.0) - Agent orchestration and management
- `@tokenring-ai/rpc` (0.2.0) - JSON-RPC endpoint management
- `@tokenring-ai/utility` (0.2.0) - Utility functions and helpers
- `zod` (^4.3.6) - Schema validation

### Development Dependencies

- `vitest` (^4.1.1) - Testing framework
- `typescript` (^6.0.2) - TypeScript compiler

## License

MIT License - see [LICENSE](./LICENSE) file for details.
