import { describe, expect, test } from "bun:test";
import type Agent from "@tokenring-ai/agent/Agent";
import type { AgentCommandInputSchema, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { parseAgentCommandInput } from "@tokenring-ai/agent/util/parseAgentCommandInput";
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

  describe("optional positionals", () => {
    const pairSchema = {
      args: { verbose: { type: "flag", description: "Verbose" } },
      positionals: [
        { name: "first", description: "First", required: false },
        { name: "second", description: "Second", required: false, defaultValue: "two" },
        { name: "third", description: "Third", required: false },
      ],
    } as const satisfies AgentCommandInputSchema;
    const withRemainder = {
      positionals: [{ name: "target", description: "Target", required: false }],
      remainder: { name: "message", description: "Message", required: false },
    } as const satisfies AgentCommandInputSchema;

    /** What AgentCommandService's parser makes of the formatted step: the values the command would really get. */
    function parsedBy(schema: AgentCommandInputSchema, message: string) {
      const command: TokenRingAgentCommand<AgentCommandInputSchema> = { name: "pair", description: "", help: "", inputSchema: schema, execute: async () => "" };
      const input = message.slice("/pair".length);
      return parseAgentCommandInput(command, input, [], {} as Agent) as { args?: Record<string, unknown>; remainder?: string };
    }

    test("trailing empty positionals are simply left out", () => {
      const message = formatCommandStep({ command: "pair", arguments: { first: "a" }, remainder: "" }, pairSchema);
      expect(message).toBe("/pair a");
      expect(parsedBy(pairSchema, message).args).toMatchObject({ first: "a", second: "two" });
    });

    test("an empty positional with a default is written out, so later values stay in place", () => {
      const message = formatCommandStep({ command: "pair", arguments: { first: "a", third: "c" }, remainder: "" }, pairSchema);
      expect(message).toBe("/pair a two c");
      expect(parsedBy(pairSchema, message).args).toMatchObject({ first: "a", second: "two", third: "c" });
    });

    test("an empty positional without a default, followed by a later one, is rejected rather than shifted", () => {
      expect(() => formatCommandStep({ command: "pair", arguments: { third: "c" }, remainder: "" }, pairSchema)).toThrow(
        'Step /pair: positional "first" is empty but the later positional "third" is set',
      );
    });

    test("remainder text would be read into an empty positional, so that is rejected too", () => {
      expect(() => formatCommandStep({ command: "pair", arguments: {}, remainder: "hello world" }, withRemainder)).toThrow("the step has remainder text");
      const message = formatCommandStep({ command: "pair", arguments: { target: "x" }, remainder: "hello world" }, withRemainder);
      expect(parsedBy(withRemainder, message)).toMatchObject({ args: { target: "x" }, remainder: "hello world" });
    });

    test("a positional starting with - is kept apart from the options with --", () => {
      const message = formatCommandStep({ command: "pair", arguments: { verbose: true, first: "-5" }, remainder: "" }, pairSchema);
      expect(message).toBe("/pair --verbose -- -5");
      expect(parsedBy(pairSchema, message).args).toMatchObject({ verbose: true, first: "-5" });
    });

    test("labels without a command schema never throw", () => {
      expect(formatWorkflowStepLabel({ command: "pair", arguments: { third: "c" }, remainder: "" })).toBe("/pair --third c");
    });
  });
});
