import Agent from "@tokenring-ai/agent/Agent";
import WorkflowService from "../../WorkflowService.js";

export default async function run(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
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

  for (const message of workflow.steps) {
    agent.handleInput({message});
  }
}
