import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { z } from "zod";
import { WorkflowItemSchema } from "../schema.ts";
import WorkflowService from "../WorkflowService.ts";
import { describeWorkflow, unknownAgentTypeError, workflowSummary } from "./shared.ts";
import { ToolWorkflowStepSchema } from "./stepInput.ts";

const name = "workflow_create";
const displayName = "Workflow/create";

async function execute(input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const service = agent.requireService(WorkflowService);
  const { name: workflowName, ...body } = input;

  if (await service.getWorkflow(workflowName)) {
    throw new ToolCallError(name, `Workflow "${workflowName}" already exists. Use workflow_update to change it, or pick another name.`);
  }
  const agentTypeError = unknownAgentTypeError(body.agentType, agent);
  if (agentTypeError) throw new ToolCallError(name, agentTypeError);

  const item = WorkflowItemSchema.parse(body);
  const approved = await agent.askForApproval({ message: `Create this workflow?\n\n${describeWorkflow(workflowName, item)}` });
  if (!approved) throw new ToolCallError(name, "The user did not approve creating the workflow.");

  const workflow = await service.createWorkflow(workflowName, item);
  return {
    message: `**Workflow** Created ${workflowName}`,
    result: JSON.stringify({ workflow: workflowSummary(workflow) }),
  };
}

const description =
  "Create a workflow: a named, reusable multi-step script. Each step is either a chat message or a structured agent command; " +
  "a run (workflow_run) spawns an agent of `agentType` and feeds it the steps in order. Requires the user's approval.";

const inputSchema = z.object({
  name: z.string().describe("File name for the workflow: letters, numbers, hyphens and underscores, starting with a letter or number."),
  displayName: z.string().describe("Human-readable title."),
  description: z.string().default("").describe("What the workflow does."),
  category: z.string().optional().describe('Grouping shown in the library (default "User-Created Workflows").'),
  agentType: z.string().describe("The agent type that runs the steps."),
  steps: z.array(ToolWorkflowStepSchema).min(1).describe("The steps, in order."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
