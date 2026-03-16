import Agent from "@tokenring-ai/agent/Agent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import WorkflowService from "../../WorkflowService.js";

export default {
  name: "workflow list",
  description: "List available workflows",
  help: `# /workflow list

List all available workflows with their names, descriptions, and step counts.

## Example

/workflow list`,
  execute: async (_remainder: string, agent: Agent): Promise<string> => {
    const workflowService = agent.app.getService(WorkflowService);
    if (!workflowService) return "Workflow service is not running.";
    const workflows = workflowService.listWorkflows();
    const lines = ["Available workflows:"];
    for (const {key, workflow} of workflows) {
      lines.push(`**${key}**: ${workflow.name}`);
      lines.push(indent([workflow.description, `Steps: ${workflow.steps.length}`], 1));
    }
    return lines.join("\n");
  },
} satisfies TokenRingAgentCommand;
