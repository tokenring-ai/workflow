import { z } from "zod";
import { MAX_STEP_RETRIES } from "../schema.ts";

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
      retries: z.number().int().min(0).max(MAX_STEP_RETRIES).optional().describe(`Re-run a failed step up to this many times (at most ${MAX_STEP_RETRIES}).`),
    })
    .describe("A structured agent command."),
]);
