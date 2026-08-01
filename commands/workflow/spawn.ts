import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import WorkflowService from "../../WorkflowService.ts";

const inputSchema = {
  args: {},
  positionals: [{ name: "workflowName", description: "Workflow name", required: true }],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { workflowName }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const workflowService = agent.requireService(WorkflowService);

  const workflow = await workflowService.getWorkflow(workflowName);
  if (!workflow) throw new CommandFailedError(`Workflow "${workflowName}" not found.`);

  const spawnedAgent = await workflowService.spawnWorkflow(workflowName, { headless: agent.headless });

  return `Spawned agent ${spawnedAgent.id} for workflow: ${workflow.displayName}`;
}

export default {
  name: "workflow spawn",
  description: "Spawn a new agent and run a workflow",
  help: `Spawn a new agent and run a workflow on it.

The steps run on the new agent in the background; this command returns as soon as the agent exists.
Progress is tracked in the Workflows app.

## Example

/workflow spawn myWorkflow`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
