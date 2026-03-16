import {AgentCommandService} from "@tokenring-ai/agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
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
  const agentCommandService = agent.requireServiceByType(AgentCommandService);
  const signal = agent.getAbortSignal();
  for (const message of workflow.steps) {
    if (signal.aborted) return "Workflow was aborted.";
    await agentCommandService.executeAgentCommand(agent, message);
  }
  return `Workflow "${workflowName}" completed`;
}

export default {
  name: "workflow run",
  description: "Run a workflow by name",
  help: `Run a workflow by name on the current agent.

## Example

/workflow run myWorkflow`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
