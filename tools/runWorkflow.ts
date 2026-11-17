import { LimitError } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ApprovalLevel } from "@tokenring-ai/chat/schema";
import { requireToolApproval } from "@tokenring-ai/chat/util/requireToolApproval";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import formatError from "@tokenring-ai/utility/error/formatError";
import { z } from "zod";
import WorkflowService from "../WorkflowService.ts";
import { describeSteps, unknownAgentTypeError } from "./shared.ts";

const name = "workflow_run";
const displayName = "Workflow/run";

async function execute({ name: workflowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const service = agent.requireService(WorkflowService);
  const workflow = await service.getWorkflow(workflowName);
  if (!workflow) throw new ToolCallError(name, `Workflow "${workflowName}" not found. Use workflow_list to see the available workflows.`);
  const agentTypeError = unknownAgentTypeError(workflow.agentType, agent);
  if (agentTypeError) throw new ToolCallError(name, `Workflow "${workflowName}" cannot run: ${agentTypeError}`);

  await requireToolApproval(agent, {
    toolName: name,
    message: `Run workflow "${workflowName}" (${workflow.displayName}) on a new ${workflow.agentType} agent?`,
    detailedDescription: `Starts an agent that works through these steps unattended, using its own tools:\n${describeSteps(workflow.steps)}`,
    // Starting an agent that works unattended once.
    safetyLevel: ApprovalLevel.CostlyChange,
    default: true,
  });

  let started: Awaited<ReturnType<WorkflowService["spawnWorkflow"]>>;
  try {
    // Started by this agent: the run is a child of its job, so the job depth, fan-out and cancel cascade apply.
    started = await service.spawnWorkflow(workflowName, { startedBy: agent });
  } catch (error) {
    if (error instanceof LimitError) throw new ToolCallError(name, `The workflow was not started: ${error.message}`);
    throw new ToolCallError(name, formatError(error));
  }
  return {
    message: `**Workflow** Started ${workflowName} (run ${started.runId})`,
    result: JSON.stringify({ runId: started.runId, jobId: started.jobId, agentId: started.agent.id, workflow: workflowName, steps: workflow.steps.length }),
  };
}

const description =
  "Start a workflow: a named, saved multi-step script. A new agent of the workflow's agent type works through its steps in order in the background; " +
  "this returns the run id at once (it does not wait for the run). Progress shows in the Workflows app. " +
  "Use workflow_list to find workflows. Workflows take no parameters: the steps run as saved. " +
  "For a single one-off prompt use a queue item (queue_addTaskToQueue); for tracked work on a board, a board task (task_dispatch); to run this later or repeatedly, a schedule. " +
  "The run's agent works unattended: it can auto-approve no more than the app's cap for unattended agents, and the app-wide limits on how deep agents may start agents and how many one chain may start apply.";

const inputSchema = z.object({
  name: z.string().describe("The workflow's name (file name), as workflow_list returns it."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
