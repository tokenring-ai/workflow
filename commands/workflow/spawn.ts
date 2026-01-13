import Agent from "@tokenring-ai/agent/Agent";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import WorkflowService from "../../WorkflowService.js";

export default async function spawn(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    agent.infoLine("Workflow service is not running.");
    return;
  }

  const workflowName = remainder.trim();
  if (!workflowName) {
    agent.infoLine("Usage: /workflow spawn <name>");
    return;
  }

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) {
    agent.infoLine(`Workflow "${workflowName}" not found.`);
    return;
  }

  agent.infoLine(`Spawning agent type "${workflow.agentType}" for workflow: ${workflow.name}\n`);

  await runSubAgent({
    agentType: workflow.agentType,
    command: `/workflow run ${workflowName}`,
    headless: agent.headless,
    forwardChatOutput: true,
    forwardReasoning: true,
    forwardHumanRequests: true,
    forwardSystemOutput: true
  }, agent, true);
}
