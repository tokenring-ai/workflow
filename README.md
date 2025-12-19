# @tokenring-ai/workflow

Multi-step workflow orchestration system for TokenRing AI agents. Execute sequential command workflows with configuration-driven setup and support for agent spawning.

## Overview

The workflow package provides a simple yet powerful way to define and execute multi-step workflows within the TokenRing AI ecosystem. It integrates seamlessly with the agent system to run sequential command chains, supporting both direct execution on the current agent and spawning new agents with specific types.

## Installation

```bash
npm install @tokenring-ai/workflow
```

## Package Structure

```
pkg/workflow/
├── WorkflowService.ts          # Core workflow management service
├── plugin.ts                   # Plugin registration and setup
├── chatCommands.ts             # Command exports
├── commands/workflow.ts        # /workflow command implementation
├── index.ts                    # Main exports and schemas
└── package.json
```

## Core Components

### WorkflowService

The main service class that manages workflow execution:

```typescript
class WorkflowService implements TokenRingService {
  name = "WorkflowService";
  description = "Manages multi-step agent workflows";
  
  getWorkflow(name: string): WorkflowItem | undefined;
  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>;
}
```

### WorkflowItem Schema

Defines the structure for workflow configuration:

```typescript
interface WorkflowItem {
  name: string;           // Human-readable workflow name
  description: string;    // Detailed description
  agentType: string;      // Required agent type for execution
  steps: string[];        // Sequential commands to execute
}
```

## Usage

### Basic Integration

```typescript
import TokenRingApp from "@tokenring-ai/app";
import workflow from "@tokenring-ai/workflow";

const app = new TokenRingApp({
  // Your app configuration
});

app.install(workflow);
```

### Configuration

Add a `workflows` section to your `.tokenring/config.mjs`:

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

## Commands

### List Available Workflows

```bash
/workflow
```

Displays all configured workflows with their names, descriptions, and step counts.

### Run Workflow on Current Agent

```bash
/workflow run <name>
```

Executes all steps in the specified workflow sequentially on the current agent. Each step is processed through the AgentCommandService, allowing for complex command chains.

**Example:**
```bash
/workflow run content-pipeline
```

### Spawn Agent and Run Workflow

```bash
/workflow spawn <name>
```

Creates a new agent of the type specified in the workflow configuration, then executes all workflow steps on that new agent.

**Example:**
```bash
/workflow spawn morning-article
```

## Workflow Step Types

Workflow steps can include any valid agent commands:

### Tool Commands
```typescript
steps: [
  "/tools enable @tokenring-ai/research/research",
  "/tools enable @tokenring-ai/websearch/searchNews"
]
```

### Chat Commands
```typescript
steps: [
  "/chat Write morning market analysis",
  "/chat Generate daily metrics report"
]
```

### Mixed Commands
```typescript
steps: [
  "/tools enable @tokenring-ai/database/query",
  "/chat Generate daily metrics report",
  "/chat Send report to team"
]
```

## API Reference

### WorkflowService Methods

#### `getWorkflow(name: string): WorkflowItem | undefined`

Retrieves a workflow by name.

**Parameters:**
- `name`: The workflow identifier

**Returns:** WorkflowItem or undefined if not found

#### `listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>`

Lists all available workflows.

**Returns:** Array of workflow entries with key and workflow object

### Configuration Schema

```typescript
WorkflowConfigSchema = z.record(z.string(), WorkflowItemSchema)
```

Validates the workflows configuration object:
- Keys are workflow identifiers (strings)
- Values are WorkflowItem objects

```typescript
WorkflowItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  agentType: z.string(),
  steps: z.array(z.string()),
})
```

## Integration with TokenRing

The workflow package integrates with several TokenRing services:

- **AgentCommandService**: Executes individual workflow steps
- **Agent System**: Supports both current agent execution and agent spawning
- **Plugin System**: Auto-registers with the TokenRing application
- **Configuration System**: Validates workflow configuration through Zod schemas

## Execution Flow

1. **Workflow Selection**: User specifies workflow name via `/workflow run` or `/workflow spawn`
2. **Validation**: Workflow existence and configuration validation
3. **Agent Resolution**: 
   - `run`: Uses current agent
   - `spawn`: Creates new agent with specified type
4. **Step Execution**: Sequential execution of all workflow steps
5. **Command Processing**: Each step processed through AgentCommandService

## Error Handling

- **Workflow Not Found**: Clear error message when specified workflow doesn't exist
- **Configuration Validation**: Schema validation ensures proper workflow structure
- **Step Execution**: Individual step failures are reported but don't stop workflow execution

## Examples

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
```

Execute with:
```bash
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
```

Execute with:
```bash
/workflow spawn market-analysis
```

## Dependencies

- **@tokenring-ai/app**: Base application framework and service management
- **@tokenring-ai/agent**: Agent system and command execution
- **@tokenring-ai/utility**: Utility functions and helpers
- **zod**: Schema validation and type safety

```

## License

MIT License - see LICENSE file for details.