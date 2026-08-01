import { describe, expect, test } from "bun:test";
import type { AgentCommandInputSchema } from "@tokenring-ai/agent/types";
import { formatCommandStep, formatWorkflowStep, formatWorkflowStepLabel } from "./formatWorkflowStep.ts";

const agentRunSchema = {
  args: {
    bg: { type: "flag", description: "Background" },
    type: { type: "string", description: "Agent type", required: true },
  },
  remainder: { name: "message", description: "Message", required: true },
} as const satisfies AgentCommandInputSchema;

const providerSetSchema = {
  positionals: [{ name: "providerName", description: "Provider", required: true }],
} as const satisfies AgentCommandInputSchema;

describe("formatWorkflowStep", () => {
  test("plain strings pass through as chat messages", () => {
    expect(formatWorkflowStep("Review the codebase")).toBe("Review the codebase");
  });

  test("formats flags, named args, and remainder", () => {
    expect(
      formatCommandStep(
        {
          command: "agent run",
          arguments: { bg: true, type: "leader" },
          remainder: "find bugs",
        },
        agentRunSchema,
      ),
    ).toBe("/agent run --bg --type leader find bugs");
  });

  test("omits false flags and empty values", () => {
    expect(
      formatCommandStep(
        {
          command: "agent run",
          arguments: { bg: false, type: "leader" },
          remainder: "",
        },
        agentRunSchema,
      ),
    ).toBe("/agent run --type leader");
  });

  test("emits positionals from arguments by schema name", () => {
    expect(
      formatCommandStep(
        {
          command: "filesystem provider set",
          arguments: { providerName: "local" },
          remainder: "",
        },
        providerSetSchema,
      ),
    ).toBe("/filesystem provider set local");
  });

  test("quotes values with spaces", () => {
    expect(
      formatCommandStep(
        {
          command: "agent run",
          arguments: { type: "my agent" },
          remainder: "go",
        },
        agentRunSchema,
      ),
    ).toBe('/agent run --type "my agent" go');
  });

  test("label formatting works without a live command registry", () => {
    expect(formatWorkflowStepLabel("hello")).toBe("hello");
    expect(
      formatWorkflowStepLabel({
        command: "agent run",
        arguments: { type: "leader", bg: true },
        remainder: "scan",
      }),
    ).toBe("/agent run --type leader --bg scan");
  });
});
