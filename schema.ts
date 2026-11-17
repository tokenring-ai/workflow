import { InstallSourceSchema, SubAgentConfigSchema } from "@tokenring-ai/agent/schema";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import z from "zod";

/** Most times a failed step is re-run; the YAML schema, the tools and the service all hold to it. */
export const MAX_STEP_RETRIES = 10;

/** Longest step output or run message kept in a run record (and streamed); full responses stay in the agent's history. */
export const MAX_STEP_OUTPUT_CHARS = 4000;

/**
 * A structured workflow step that invokes a registered agent command.
 *
 * - `command` is the command name without a leading slash (e.g. `"agent run"`).
 * - `arguments` holds named `--arg` values and positional values keyed by schema name.
 * - `remainder` is free-text trailing input (prompts, messages, etc.).
 * - `onError: "continue"` keeps the run going when the step fails; `"stop"` (default) ends the run.
 * - `retries` re-runs a failed step up to N times before the failure is handled.
 */
export const WorkflowCommandStepSchema = z.object({
  command: z.string().min(1),
  arguments: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  remainder: z.string().default(""),
  onError: z
    .enum(["stop", "continue"])
    .optional()
    .meta({ description: "continue keeps the run going when this step fails; stop (default) ends the run" } satisfies ConfigFieldMeta),
  retries: z
    .number()
    .int()
    .min(0)
    .max(MAX_STEP_RETRIES)
    .optional()
    .meta({ description: `Re-run a failed step up to this many times (at most ${MAX_STEP_RETRIES}) before handling the failure` } satisfies ConfigFieldMeta),
});

/** Per-step execution options; plain-string steps use these defaults. */
export const STEP_DEFAULTS = { onError: "stop", retries: 0 } as const;

/** Execution status of a single step within a run. */
export const WorkflowRunStepStatusSchema = z.enum(["pending", "running", "done", "failed", "skipped", "cancelled"]);
export type WorkflowRunStepStatus = z.output<typeof WorkflowRunStepStatusSchema>;

/** What actually happened to one step in one run — recorded as the run progresses. */
export const WorkflowRunStepSchema = z.object({
  /** Human-readable command/text shown in the UI. */
  label: z.string(),
  status: WorkflowRunStepStatusSchema,
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  /** The agent's response to the step (truncated). */
  output: z.string(),
});
export type WorkflowRunStep = z.output<typeof WorkflowRunStepSchema>;

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
  /** Set when the workflow was installed from a marketplace registry rather than authored here. */
  installedFrom: InstallSourceSchema.exactOptional(),
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
 *
 * - `completedWithErrors`: every step ran, but at least one failed under `onError: "continue"`.
 * - `interrupted`: the app stopped while the run was in flight. Never re-run automatically; it can be run again.
 */
export const WorkflowRunStatusSchema = z.enum(["starting", "running", "completed", "completedWithErrors", "failed", "cancelled", "interrupted"]);

export type WorkflowRunStatus = z.output<typeof WorkflowRunStatusSchema>;

/** A single execution of a workflow, tracked from agent creation through the last step. */
export const WorkflowRunSchema = z.object({
  id: z.string(),
  workflowName: z.string(),
  displayName: z.string(),
  agentType: z.string(),
  /** Null until the agent running the workflow has been created. */
  agentId: z.string().nullable(),
  /** The agent job (AgentJobService) running this workflow; null until it starts, and for runs from older versions. */
  jobId: z.string().nullable().default(null),
  /** The run this one was started to run again, if any. */
  rerunOf: z.string().nullable().default(null),
  /** What the run's agent spent, read from its job when the run ended. */
  costUsd: z.number().nullable().default(null),
  /** The steps as they were when the run started; later edits to the workflow file don't affect it. */
  steps: z.array(WorkflowStepSchema),
  /** What happened to each step, in order. Older runs (and persistence from older versions) may lack records. */
  stepRecords: z.array(WorkflowRunStepSchema).default([]),
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
      .min(1)
      .default(50)
      .meta({ description: "Maximum number of completed workflow runs to keep, in memory and under <workflowDirectory>/.runs" } satisfies ConfigFieldMeta),
    workflowDirectory: z
      .string()
      .default("workflows")
      .meta({ description: "Directory where workflow YAML files are stored" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Workflows", description: "Reusable multi-step workflows, backed by YAML files on disk" } satisfies ConfigFieldMeta);

export type WorkflowServiceConfig = z.input<typeof WorkflowServiceConfigSchema>;
export type ParsedWorkflowConfig = z.output<typeof WorkflowServiceConfigSchema>;
