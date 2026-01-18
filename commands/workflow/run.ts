import {AgentCommandService} from "@tokenring-ai/agent";
import Agent from "@tokenring-ai/agent/Agent";
import WorkflowService from "../../WorkflowService.js";

export default async function run(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.requireServiceByType(WorkflowService);
  
  if (!workflowService) {
    agent.infoMessage("Workflow service is not running.");
    return;
  }

  const workflowName = remainder.trim();
  if (!workflowName) {
    agent.infoMessage("Usage: /workflow run <name>");
    return;
  }

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) {
    agent.infoMessage(`Workflow "${workflowName}" not found.`);
    return;
  }

  agent.infoMessage(`Running workflow: ${workflow.name}\n`);

  const agentCommandService = agent.requireServiceByType(AgentCommandService);

  const signal = agent.getAbortSignal();
  for (const message of workflow.steps) {
    if (signal.aborted) {
      agent.warningMessage("Workflow was aborted.");
      return;
    }
    await agentCommandService.executeAgentCommand(agent, message);
  }
}
