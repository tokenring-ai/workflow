import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import WorkflowService from "../../WorkflowService.js";

export default async function spawn(remainder: string, agent: Agent): Promise<string> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    return "Workflow service is not running.";
  }

  const workflowName = remainder.trim();
  if (!workflowName) {
    throw new CommandFailedError("Usage: /workflow spawn <name>");
  }

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) {
    throw new CommandFailedError(`Workflow "${workflowName}" not found.`);
  }

  await runSubAgent({
    agentType: workflow.agentType,
    command: `/workflow run ${workflowName}`,
    headless: agent.headless,
  }, agent, true);

  return `Spawned agent for workflow: ${workflow.name}`;
}
