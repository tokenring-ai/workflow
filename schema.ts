import {SubAgentConfigSchema} from "@tokenring-ai/agent/schema";
import z from "zod";

export const WorkflowItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  agentType: z.string(),
  steps: z.array(z.string()),
  subAgent: SubAgentConfigSchema.prefault({}),
});

export const WorkflowConfigSchema = z.record(
  z.string(), WorkflowItemSchema
);

export type ParsedWorkflowConfig = z.output<typeof WorkflowConfigSchema>;