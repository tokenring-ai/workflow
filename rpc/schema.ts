import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { SuccessSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";
import { WorkflowItemSchema, WorkflowRunSchema, WorkflowSchema } from "../schema.ts";

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
    spawnWorkflow: {
      type: "mutation",
      input: z.object({
        name: z.string(),
        headless: z.boolean().default(false),
      }),
      result: z.object({
        id: z.string(),
        displayName: z.string(),
        description: z.string(),
      }),
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
