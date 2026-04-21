import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import indent from "@tokenring-ai/utility/string/indent";
import WorkflowService from "../../WorkflowService.ts";

const inputSchema = {} as const satisfies AgentCommandInputSchema;

export default {
  name: "workflow list",
  description: "List available workflows",
  help: `List all available workflows with their names, descriptions, and step counts.

## Example

/workflow list`,
  inputSchema,
  execute: ({ agent }: AgentCommandInputType<typeof inputSchema>): string => {
    const workflowService = agent.requireServiceByType(WorkflowService);

    const workflows = workflowService.listWorkflowEntries();
    const lines = ["Available workflows:"];
    for (const [name, workflow] of workflows) {
      lines.push(`**${name}**: ${workflow.displayName}`);
      lines.push(indent([workflow.description, `Steps: ${workflow.steps.length}`], 1));
    }
    return lines.join("\n");
  },
} satisfies TokenRingAgentCommand<typeof inputSchema>;
