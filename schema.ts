import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

/**
 * The contents of a single workflow YAML file. The workflow name comes from the
 * file name, so it is not part of the file body.
 */
export const WorkflowItemSchema = z.object({
  displayName: z.string(),
  category: z.string().default("User-Created Workflows"),
  description: z.string().default(""),
  agentType: z.string(),
  steps: z.array(z.string()).default([]),
  subAgent: SubAgentConfigSchema.prefault({}),
});

export type WorkflowItem = z.output<typeof WorkflowItemSchema>;
export type WorkflowItemInput = z.input<typeof WorkflowItemSchema>;

/** A workflow as read from disk: the file body plus its name and last-modified time. */
export const WorkflowSchema = WorkflowItemSchema.extend({
  name: z.string(),
  updatedAt: z.string(),
});

export type Workflow = z.output<typeof WorkflowSchema>;

/**
 * Where a run is in its lifecycle. `starting` covers the window between the run being recorded and
 * its agent picking up the first step; everything from `completed` on is terminal.
 */
export const WorkflowRunStatusSchema = z.enum(["starting", "running", "completed", "failed", "cancelled"]);

export type WorkflowRunStatus = z.output<typeof WorkflowRunStatusSchema>;

/** A single execution of a workflow, tracked from agent creation through the last step. */
export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowName: z.string(),
  displayName: z.string(),
  agentType: z.string(),
  /** Null until the agent running the workflow has been created. */
  agentId: z.string().nullable(),
  /** The steps as they were when the run started; later edits to the workflow file don't affect it. */
  steps: z.array(z.string()),
  /** Index of the step being executed, or the index it stopped at; equals `steps.length` once completed. */
  currentStep: z.number(),
  status: WorkflowRunStatusSchema,
  /** The last step response, or the reason the run ended. */
  message: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
});

export type WorkflowRun = z.output<typeof WorkflowRunSchema>;

export const WorkflowServiceConfigSchema = z
  .object({
    workflowDirectory: z
      .string()
      .default("workflows")
      .meta({ description: "Directory where workflow YAML files are stored" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Workflows", description: "Reusable multi-step workflows, backed by YAML files on disk" } satisfies ConfigFieldMeta);

export type WorkflowServiceConfig = z.input<typeof WorkflowServiceConfigSchema>;
export type ParsedWorkflowConfig = z.output<typeof WorkflowServiceConfigSchema>;
