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

  // Started from this agent: the run is a child of its job (if any), so the job limits and cancellation cascade apply.
  const started = await workflowService.spawnWorkflow(workflowName, { startedBy: agent });

  return `Started workflow ${workflow.displayName} as run ${started.runId} on agent ${started.agent.id}`;
}

export default {
  name: "workflow spawn",
  description: "Spawn a new agent and run a workflow",
  help: `Spawn a new agent and run a workflow on it.

The steps run on the new agent in the background; this command returns as soon as the agent exists.
Progress is tracked in the Workflows app. The run is a job started by this agent: it counts toward
the job depth and fan-out limits (agent.jobs settings), and is cancelled when the job running this agent is.

## Example

/workflow spawn myWorkflow`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
