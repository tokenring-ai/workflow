import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import WorkflowService from "../../WorkflowService.js";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const workflowService = agent.requireServiceByType(WorkflowService);
  const workflowName = remainder.trim();
  if (!workflowName) throw new CommandFailedError("Usage: /workflow run <name>");
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
  name: "workflow run", description: "Run a workflow by name", help: `# /workflow run <name>

Run a workflow by name on the current agent.

## Example

/workflow run myWorkflow`, execute } satisfies TokenRingAgentCommand;
