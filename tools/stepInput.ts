import { z } from "zod";

/** Step input for the workflow tools — the same shape the workflow YAML stores, with model-facing descriptions. */
export const ToolWorkflowStepSchema = z.union([
  z.string().describe("A chat message sent to the agent as-is."),
  z
    .object({
      command: z.string().min(1).describe('An agent command name without the leading slash, e.g. "agent run".'),
      arguments: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .default({})
        .describe("Named --arg values and positional values, keyed by argument name."),
      remainder: z.string().default("").describe("Free-text trailing input such as a prompt."),
      onError: z.enum(["stop", "continue"]).optional().describe("continue keeps the run going when this step fails; stop (default) ends it."),
      retries: z.number().int().min(0).max(10).optional().describe("Re-run a failed step up to this many times."),
    })
    .describe("A structured agent command."),
]);
