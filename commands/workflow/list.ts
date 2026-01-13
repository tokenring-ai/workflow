import Agent from "@tokenring-ai/agent/Agent";
import WorkflowService from "../../WorkflowService.js";

export default async function defaultCmd(_remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    agent.infoLine("Workflow service is not running.");
    return;
  }

  agent.infoLine("Available workflows:\n");
  const workflows = workflowService.listWorkflows();
  for (const {key, workflow} of workflows) {
    agent.infoLine(`**${key}**: ${workflow.name}`);
    agent.infoLine(`  ${workflow.description}`);
    agent.infoLine(`  Steps: ${workflow.steps.length}\n`);
  }
}
