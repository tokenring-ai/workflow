import type { RPCSchema } from "@tokenring-ai/rpc/types";
import { z } from "zod";

export default {
  name: "Workflow RPC",
  path: "/rpc/workflow",
  methods: {
    listWorkflows: {
      type: "query",
      input: z.object({}),
      result: z.array(
        z.object({
          name: z.string(),
          displayName: z.string(),
          description: z.string(),
          agentType: z.string(),
          steps: z.array(z.string()),
        }),
      ),
    },
    getWorkflow: {
      type: "query",
      input: z.object({
        name: z.string(),
      }),
      result: z.object({
        displayName: z.string(),
        description: z.string(),
        agentType: z.string(),
        steps: z.array(z.string()),
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
  },
} satisfies RPCSchema;
