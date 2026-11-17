import type Agent from "@tokenring-ai/agent/Agent";
import type { TokenRingToolDefinition, TokenRingToolResult } from "@tokenring-ai/chat/schema";
import { z } from "zod";
import WorkflowService from "../WorkflowService.ts";
import { workflowSummary } from "./shared.ts";

const name = "workflow_list";
const displayName = "Workflow/list";

async function execute(_input: z.output<typeof inputSchema>, agent: Agent): Promise<TokenRingToolResult> {
  const workflows = await agent.requireService(WorkflowService).listWorkflows();
  return {
    message: `**Workflow** Listed ${workflows.length} workflow${workflows.length === 1 ? "" : "s"}`,
    result: JSON.stringify({ workflows: workflows.map(workflowSummary) }),
  };
}

const description =
  "List the workflows: named, saved multi-step scripts (name, display name, agent type, step count). Start one with workflow_run; use workflow_get to read a workflow's steps before changing it.";

const inputSchema = z.object({});

export default {
  name,
  displayName,
  description,
  inputSchema,
  execute,
} satisfies TokenRingToolDefinition<typeof inputSchema>;
