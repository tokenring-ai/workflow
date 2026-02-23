import Agent from "@tokenring-ai/agent/Agent";
import indent from "@tokenring-ai/utility/string/indent";
import WorkflowService from "../../WorkflowService.js";

export default async function defaultCmd(_remainder: string, agent: Agent): Promise<string> {
  const workflowService = agent.app.getService(WorkflowService);
  
  if (!workflowService) {
    return "Workflow service is not running.";
  }

  const workflows = workflowService.listWorkflows();
  const lines: string[] = ["Available workflows:"];
  
  for (const {key, workflow} of workflows) {
    lines.push(`**${key}**: ${workflow.name}`);
    lines.push(indent([
      workflow.description,
      `Steps: ${workflow.steps.length}`
    ], 1));
  }

  return lines.join("\n");
}
