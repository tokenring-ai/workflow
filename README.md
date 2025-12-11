# @tokenring-ai/workflow

Run multi-step agent workflows with a simple configuration.

## Installation

```bash
npm install @tokenring-ai/workflow
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

Add a `workflow` section to your `.tokenring/config.mjs`:

```javascript
export default {
  workflow: {
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
      }
    }
  }
};
```

## Commands

### List Workflows

```
/workflow
```

Shows all available workflows with their names and descriptions.

### Run Workflow

```
/workflow run <name>
```

Executes all steps in the specified workflow sequentially on the current agent. If the current agent type doesn't match the workflow's required agent type, asks for confirmation before proceeding.

### Spawn Agent and Run Workflow

```
/workflow spawn <name>
```

Creates a new agent of the type specified in the workflow, then executes all steps on that new agent.

## Example

```javascript
export default {
  workflow: {
    workflows: {
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
  }
};
```

Then run with:

```
/workflow run content-pipeline
/workflow spawn content-pipeline
```

## API Reference

### WorkflowItem

```typescript
interface WorkflowItem {
  name: string;
  description: string;
  agentType: string;
  steps: string[];
}
```

### WorkflowService

```typescript
class WorkflowService {
  getWorkflow(name: string): WorkflowItem | undefined;
  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }>;
}
```

## License

MIT License - see LICENSE file for details.
