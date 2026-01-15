import Agent from "@tokenring-ai/agent/Agent";
import indent from "@tokenring-ai/utility/string/indent";
import WorkflowService from "../../WorkflowService.js";

export default async function defaultCmd(_remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    agent.infoMessage("Workflow service is not running.");
    return;
  }

  agent.infoMessage("Available workflows:\n");
  const workflows = workflowService.listWorkflows();
  for (const {key, workflow} of workflows) {
    agent.infoMessage(`**${key}**: ${workflow.name}`);
    agent.infoMessage(indent([
      workflow.description,
      `Steps: ${workflow.steps.length}\n`
    ], 1));
  }
}
