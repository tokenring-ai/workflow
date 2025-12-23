import {JsonRPCSchema} from "@tokenring-ai/web-host/jsonrpc/types";
import { z } from "zod";

export default {
  path: "/rpc/workflow",
  methods: {
    listWorkflows: {
      type: "query",
      input: z.object({}),
      result: z.array(z.object({
        key: z.string(),
        name: z.string(),
        description: z.string(),
        agentType: z.string(),
        steps: z.array(z.string()),
      }))
    },
    getWorkflow: {
      type: "query",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        key: z.string(),
        name: z.string(),
        description: z.string(),
        agentType: z.string(),
        steps: z.array(z.string()),
      })
    },
    spawnWorkflow: {
      type: "mutation",
      input: z.object({
        workflowName: z.string(),
        headless: z.boolean().default(false),
      }),
      result: z.object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
      })
    }
  }
} satisfies JsonRPCSchema;