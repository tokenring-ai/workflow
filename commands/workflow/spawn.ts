import Agent from "@tokenring-ai/agent/Agent";
import {CommandFailedError} from "@tokenring-ai/agent/AgentError";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import WorkflowService from "../../WorkflowService.js";

async function execute(remainder: string, agent: Agent): Promise<string> {
  const workflowService = agent.app.getService(WorkflowService);
  if (!workflowService) return "Workflow service is not running.";
  const workflowName = remainder.trim();
  if (!workflowName) throw new CommandFailedError("Usage: /workflow spawn <name>");
  const workflow = workflowService.getWorkflow(workflowName);
  if (!workflow) throw new CommandFailedError(`Workflow "${workflowName}" not found.`);
  await runSubAgent({
    agentType: workflow.agentType,
    input: {
      from: `Workflow ${workflowName}`,
      message: `/workflow run ${workflowName}`
    },
    headless: agent.headless
  }, agent, true);
  return `Spawned agent for workflow: ${workflow.name}`;
}

export default {
  name: "workflow spawn", description: "Spawn a new agent and run a workflow", help: `# /workflow spawn <name>

Spawn a new agent and run a workflow on it.

## Example

/workflow spawn myWorkflow`, execute } satisfies TokenRingAgentCommand;
