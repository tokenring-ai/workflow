import { SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

/**
 * A structured workflow step that invokes a registered agent command.
 *
 * - `command` is the command name without a leading slash (e.g. `"agent run"`).
 * - `arguments` holds named `--arg` values and positional values keyed by schema name.
 * - `remainder` is free-text trailing input (prompts, messages, etc.).
 */
export const WorkflowCommandStepSchema = z.object({
  command: z.string().min(1),
  arguments: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  remainder: z.string().default(""),
});

/**
 * One workflow step:
 * - a plain string is a chat message (fed to the agent without a leading `/`)
 * - an object is a structured agent command
 */
export const WorkflowStepSchema = z.union([z.string(), WorkflowCommandStepSchema]);

export type WorkflowCommandStep = z.output<typeof WorkflowCommandStepSchema>;
export type WorkflowStep = z.output<typeof WorkflowStepSchema>;
export type WorkflowCommandStepInput = z.input<typeof WorkflowCommandStepSchema>;
export type WorkflowStepInput = z.input<typeof WorkflowStepSchema>;

/**
 * The contents of a single workflow YAML file. The workflow name comes from the
 * file name, so it is not part of the file body.
 */
export const WorkflowItemSchema = z.object({
  displayName: z.string(),
  category: z.string().default("User-Created Workflows"),
  description: z.string().default(""),
  agentType: z.string(),
  steps: z.array(WorkflowStepSchema).default([]),
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
  steps: z.array(WorkflowStepSchema),
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
    maxFinishedRuns: z
      .number()
      .default(50)
      .meta({ description: "Maximum number of completed workflow runs to keep in memory" } satisfies ConfigFieldMeta),
    workflowDirectory: z
      .string()
      .default("workflows")
      .meta({ description: "Directory where workflow YAML files are stored" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Workflows", description: "Reusable multi-step workflows, backed by YAML files on disk" } satisfies ConfigFieldMeta);

export type WorkflowServiceConfig = z.input<typeof WorkflowServiceConfigSchema>;
export type ParsedWorkflowConfig = z.output<typeof WorkflowServiceConfigSchema>;
