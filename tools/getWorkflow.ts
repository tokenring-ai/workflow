import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { ToolCallError } from "@tokenring-ai/chat/util/tokenRingTool";
import { z } from "zod";
import WorkflowService from "../WorkflowService.ts";

const name = "workflow_get";
const displayName = "Workflow/get";

async function execute({ name: workflowName }: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const workflow = await agent.requireService(WorkflowService).getWorkflow(workflowName);
  if (!workflow) throw new ToolCallError(name, `Workflow "${workflowName}" not found. Use workflow_list to see the available workflows.`);
  return {
    message: `**Workflow** Read ${workflowName}`,
    result: JSON.stringify({ workflow }),
  };
}

const description = "Read one saved workflow in full, including every step (chat messages and structured agent commands).";

const inputSchema = z.object({
  name: z.string().describe("The workflow name (its file name, as returned by workflow_list)."),
});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
