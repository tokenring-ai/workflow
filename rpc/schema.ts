import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { WorkflowItemSchema, WorkflowRunSchema, WorkflowSchema } from "../schema.ts";

const StartedRunSchema = z.object({
  /** The agent running the workflow. */
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  runId: z.string(),
  jobId: z.string(),
});

export default {
  name: "Workflow RPC",
  path: "/rpc/workflow",
  methods: {
    listWorkflows: {
      type: "query",
      input: z.object({}),
      result: z.array(WorkflowSchema),
    },
    getWorkflowDirectory: {
      type: "query",
      input: z.object({}),
      result: z.object({
        directory: z.string(),
      }),
    },
    getWorkflow: {
      type: "query",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        workflow: WorkflowSchema.nullable(),
      }),
    },
    createWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        workflow: WorkflowItemSchema,
      }),
      result: z.object({
        workflow: WorkflowSchema,
      }),
    },
    updateWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        workflow: WorkflowItemSchema,
      }),
      result: z.object({
        workflow: WorkflowSchema,
      }),
    },
    duplicateWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        /** Defaults to the first free `<name>-copy`, `<name>-copy2`, …. */
        newName: z.string().optional(),
      }),
      result: z.object({
        workflow: WorkflowSchema,
      }),
    },
    exportWorkflow: {
      type: "query",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        fileName: z.string(),
        yaml: z.string(),
      }),
    },
    importWorkflow: {
      type: "mutation",
      input: z.object({
        yaml: z.string(),
        /** Overrides the `name` key in the file. */
        name: z.string().optional(),
      }),
      result: z.object({
        workflow: WorkflowSchema,
      }),
    },
    deleteWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
    streamWorkflowRuns: {
      type: "stream",
      input: z.object({}),
      result: SuccessSchema.extend({
        runs: z.array(WorkflowRunSchema),
      }),
    },
    /**
     * Starts a run as a person-started agent job. Whether its agent may ask a person is decided by
     * the job engine (approval escalation configured or not); a `headless` field sent by older
     * clients is ignored (stripped).
     */
    spawnWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
      }),
      result: StartedRunSchema,
    },
    /** Runs a finished (e.g. interrupted) run's workflow again, linked to it by `rerunOf`. */
    rerunRun: {
      type: "mutation",
      input: z.object({
        runId: z.string(),
      }),
      result: StartedRunSchema,
    },
    cancelRun: {
      type: "mutation",
      input: z.object({
        runId: z.string(),
      }),
      result: z.object({
        success: z.boolean(),
      }),
    },
  },
} satisfies RPCSchema;
