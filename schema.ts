import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

export const WorkflowItemSchema = z.object({
  displayName: z.string().meta({ description: "Human-readable name shown in the UI" } satisfies ConfigFieldMeta),
  category: z
    .string()
    .default("User-Created Workflows")
    .meta({ description: "Group heading this workflow is listed under" } satisfies ConfigFieldMeta),
  description: z.string().meta({ uiType: "multilineText", description: "What this workflow does" } satisfies ConfigFieldMeta),
  agentType: z.string().meta({ description: "Agent type used to run this workflow" } satisfies ConfigFieldMeta),
  steps: z.array(z.string()).meta({ uiType: "stringList", description: "Ordered list of step prompts/instructions" } satisfies ConfigFieldMeta),
  subAgent: SubAgentConfigSchema.prefault({}),
});

export const WorkflowConfigSchema = z
  .record(z.string(), WorkflowItemSchema)
  .meta({ label: "Workflow", description: "Reusable multi-step workflows, keyed by name" } satisfies ConfigFieldMeta);

export type ParsedWorkflowConfig = z.output<typeof WorkflowConfigSchema>;
