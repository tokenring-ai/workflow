import Agent from "@tokenring-ai/agent/Agent";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import WorkflowService from "../../WorkflowService.js";

export default async function spawn(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    agent.infoMessage("Workflow service is not running.");
    return;
  }

  const workflowName = remainder.trim();
  if (!workflowName) {
    agent.infoMessage("Usage: /workflow spawn <name>");
    return;
  }

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) {
    agent.infoMessage(`Workflow "${workflowName}" not found.`);
    return;
  }

  agent.infoMessage(`Spawning agent type "${workflow.agentType}" for workflow: ${workflow.name}\n`);

  await runSubAgent({
    agentType: workflow.agentType,
    command: `/workflow run ${workflowName}`,
    headless: agent.headless,
  }, agent, true);
}
