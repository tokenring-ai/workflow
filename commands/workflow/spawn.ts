import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import WorkflowService from "../../WorkflowService.js";

const inputSchema = {
  args: {},
  positionals: [{name: "workflowName", description: "Workflow name", required: true}],
  allowAttachments: false,
} as const satisfies AgentCommandInputSchema;

async function execute({positionals: {workflowName}, agent}: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const workflowService = agent.requireServiceByType(WorkflowService);

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) throw new CommandFailedError(`Workflow "${workflowName}" not found.`);
  await runSubAgent({
    agentType: workflow.agentType,
    input: {
      from: `Workflow ${workflowName}`,
      message: `/workflow run ${workflowName}`
    },
    headless: agent.headless
  }, agent, true);
  return `Spawned agent for workflow: ${workflow.name}`;
}

export default {
  name: "workflow spawn",
  description: "Spawn a new agent and run a workflow",
  help: `Spawn a new agent and run a workflow on it.

## Example

/workflow spawn myWorkflow`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
