import {SubAgentService} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import type {AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import WorkflowService from "../../WorkflowService.ts";

const inputSchema = {
  args: {},
  positionals: [
    {name: "workflowName", description: "Workflow name", required: true},
  ],
} as const satisfies AgentCommandInputSchema;

async function execute({
                         positionals: {workflowName},
                         agent,
                       }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const workflowService = agent.requireServiceByType(WorkflowService);

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow)
    throw new CommandFailedError(`Workflow "${workflowName}" not found.`);

  const subAgentService = agent.requireServiceByType(SubAgentService);
  await subAgentService.runSubAgent({
    agentType: workflow.agentType,
    from: `Workflow ${workflowName}`,
    steps: [`/workflow run ${workflowName}`],
    headless: agent.headless,
    parentAgent: agent,
    options: workflow.subAgent,
  });
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
