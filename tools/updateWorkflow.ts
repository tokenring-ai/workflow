import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { z } from "zod";
import { WorkflowItemSchema } from "../schema.ts";
import WorkflowService from "../WorkflowService.ts";
import { describeWorkflow, unknownAgentTypeError, workflowSummary } from "./shared.ts";
import { ToolWorkflowStepSchema } from "./stepInput.ts";

const name = "workflow_update";
const displayName = "Workflow/update";

async function execute(input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const service = agent.requireService(WorkflowService);
  const { name: workflowName, ...changes } = input;

  const existing = await service.getWorkflow(workflowName);
  if (!existing) throw new ToolCallError(name, `Workflow "${workflowName}" not found. Use workflow_create to make it.`);

  const provided = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  if (Object.keys(provided).length === 0) throw new ToolCallError(name, "Nothing to update: pass at least one field to change.");

  if (changes.agentType !== undefined) {
    const agentTypeError = unknownAgentTypeError(changes.agentType, agent);
    if (agentTypeError) throw new ToolCallError(name, agentTypeError);
  }

  const { name: _name, updatedAt: _updatedAt, ...current } = existing;
  const item = WorkflowItemSchema.parse({ ...current, ...provided });
  const approved = await agent.askForApproval({
    message: `Update workflow "${workflowName}" (changing ${Object.keys(provided).join(", ")})?\n\n${describeWorkflow(workflowName, item)}`,
  });
  if (!approved) throw new ToolCallError(name, "The user did not approve updating the workflow.");

  const workflow = await service.updateWorkflow(workflowName, item);
  return {
    message: `**Workflow** Updated ${workflowName}`,
    result: JSON.stringify({ workflow: workflowSummary(workflow) }),
  };
}

const description =
  "Change an existing workflow. Only the fields you pass are replaced; `steps`, when given, replaces the whole step list " +
  "(read it first with workflow_get). Requires the user's approval.";

const inputSchema = z.object({
  name: z.string().describe("The workflow to update."),
  displayName: z.string().optional().describe("New human-readable title."),
  description: z.string().optional().describe("New description."),
  category: z.string().optional().describe("New library category."),
  agentType: z.string().optional().describe("New agent type that runs the steps."),
  steps: z.array(ToolWorkflowStepSchema).min(1).optional().describe("The complete new step list, in order."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
