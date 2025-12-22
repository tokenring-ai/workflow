import Agent from "@tokenring-ai/agent/Agent";
import {AgentCommandService} from "@tokenring-ai/agent";
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import type {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import WorkflowService from "../WorkflowService.ts";

const description = "/workflow run <name> - Run a workflow by name." as const;

export async function execute(remainder: string, agent: Agent): Promise<void> {
  const workflowService = agent.app.getService(WorkflowService);
  const agentCommandService = agent.app.getService(AgentCommandService);
  
  if (!workflowService) {
    agent.infoLine("Workflow service is not running.");
    return;
  }

  if (!remainder) {
    agent.infoLine("Available workflows:\n");
    const workflows = workflowService.listWorkflows();
    for (const {key, workflow} of workflows) {
      agent.infoLine(`**${key}**: ${workflow.name}`);
      agent.infoLine(`  ${workflow.description}`);
      agent.infoLine(`  Steps: ${workflow.steps.length}\n`);
    }
    return;
  }

  const [command, ...args] = remainder.trim().split(/\s+/);
  
  if (command === "run") {
    const workflowName = args.join(" ");
    if (!workflowName) {
      agent.infoLine("Usage: /workflow run <name>");
      return;
    }

    const workflow = workflowService.getWorkflow(workflowName);
    if (!workflow) {
      agent.infoLine(`Workflow "${workflowName}" not found.`);
      return;
    }

    /*if (agent.config.agentType !== workflow.agentType) {
      const confirmed = await agent.askHuman({
        type: "askForConfirmation",
        message: `Workflow "${workflow.name}" is designed for agent type "${workflow.agentType}" but current agent is "${agent.config.agentType}". Run anyway?`,
        default: false,
      });
      
      if (!confirmed) {
        agent.infoLine("Workflow cancelled.");
        return;
      }
    }*/

    agent.infoLine(`Running workflow: ${workflow.name}\n`);
    
    for (const step of workflow.steps) {
      await agentCommandService?.executeAgentCommand(agent, step);
    }
  } else if (command === "spawn") {
    const workflowName = args.join(" ");
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
    }, agent, true)
  } else {
    agent.infoLine("Usage: /workflow run <name> | /workflow spawn <name>");
  }
}

const help: string = `# /workflow

## Description
Run multi-step workflows on the current agent.

## Usage
/workflow                  - List available workflows
/workflow run <name>       - Run a workflow by name on current agent
/workflow spawn <name>     - Spawn new agent and run workflow

## Example
/workflow run myWorkflow
/workflow spawn myWorkflow`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
