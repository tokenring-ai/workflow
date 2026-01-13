import Agent from "@tokenring-ai/agent/Agent";
import WorkflowService from "../../WorkflowService.js";

export default async function run(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    agent.infoLine("Workflow service is not running.");
    return;
  }

  const workflowName = remainder.trim();
  if (!workflowName) {
    agent.infoLine("Usage: /workflow run <name>");
    return;
  }

  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) {
    agent.infoLine(`Workflow "${workflowName}" not found.`);
    return;
  }

  agent.infoLine(`Running workflow: ${workflow.name}\n`);

  for (const message of workflow.steps) {
    agent.handleInput({message});
  }
}
