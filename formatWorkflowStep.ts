import type { AgentCommandService } from "@tokenring-ai/agent";
import type { AgentCommandInputSchema } from "@tokenring-ai/agent/types";
import type { WorkflowCommandStep, WorkflowStep } from "./schema.ts";

function quoteToken(value: string): string {
  if (value === "") return '""';
  if (/[\s"'\\]/.test(value)) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function isPresent(value: string | number | boolean | undefined): value is string | number | boolean {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return true;
  return value.trim() !== "";
}

/** True when the value fills an argument: false flags and blank strings count as absent. */
function fills(value: string | number | boolean | undefined): value is string | number | boolean {
  return isPresent(value) && value !== false;
}

/**
 * Build the agent input string for a structured command step.
 *
 * Named args from the command schema are emitted as `--name` / `--name value`.
 * Positionals (also stored in `arguments` by name) are emitted as bare tokens in schema order.
 * Values not in the schema are emitted as `--name value` so unknown commands still work.
 *
 * The command parser (`parseAgentCommandInput`) fills positionals strictly in order from the tokens
 * after the named args, and it has no placeholder for "absent" or `--name` form for a positional. So
 * when an optional positional is empty but a later positional, or remainder text the parser would
 * read into it, follows, the positional's default value is written out in its place (exactly what the
 * parser would have filled in); without a default the step is rejected rather than letting the later
 * values shift into the wrong positionals. A first token after the named args that starts with `-` is
 * preceded by `--`, so the parser does not mistake it for an option.
 *
 * @throws Error when a step leaves a positional empty that a later value would shift into.
 */
export function formatCommandStep(step: WorkflowCommandStep, inputSchema?: AgentCommandInputSchema): string {
  const parts: string[] = [`/${step.command}`];
  const values = step.arguments;
  const schemaArgs = inputSchema?.args ?? {};
  const positionals = inputSchema?.positionals ?? [];
  const positionalNames = new Set(positionals.map(p => p.name));
  const consumed = new Set<string>();

  for (const [name, argSchema] of Object.entries(schemaArgs)) {
    consumed.add(name);
    const value = values[name];
    if (argSchema.type === "flag") {
      if (value === true || value === "true") parts.push(`--${name}`);
      continue;
    }
    if (!fills(value)) continue;
    const text = String(value);
    if (text.startsWith("-")) {
      parts.push(`--${name}=${quoteToken(text)}`);
    } else {
      parts.push(`--${name}`, quoteToken(text));
    }
  }

  const remainder = step.remainder.trim();
  // Remainder text is read into empty positionals only when the command takes a remainder; otherwise the parser rejects it anyway.
  const remainderFollows = remainder !== "" && inputSchema?.remainder !== undefined;
  let lastFilled = -1;
  for (const [index, positional] of positionals.entries()) if (fills(values[positional.name])) lastFilled = index;
  const positionalTokens: string[] = [];
  for (const [index, positional] of positionals.entries()) {
    consumed.add(positional.name);
    const value = values[positional.name];
    if (fills(value)) {
      positionalTokens.push(String(value));
      continue;
    }
    if (index > lastFilled && !remainderFollows) break;
    if (positional.defaultValue !== undefined) {
      positionalTokens.push(positional.defaultValue);
      continue;
    }
    const follows = index < lastFilled ? `the later positional "${positionals[lastFilled]!.name}" is set` : "the step has remainder text";
    throw new Error(
      `Step /${step.command}: positional "${positional.name}" is empty but ${follows}. /${step.command} reads positionals in order, so the later value would be taken as "${positional.name}"; set "${positional.name}" too${index < lastFilled ? `, or clear "${positionals[lastFilled]!.name}"` : ""}.`,
    );
  }

  // The parser stops reading named args at the first token that is not one; a value starting with "-" would be taken for an unknown option.
  const firstAfterArgs = positionalTokens[0] ?? (remainder || undefined);
  if (Object.keys(schemaArgs).length > 0 && firstAfterArgs?.startsWith("-")) parts.push("--");
  for (const token of positionalTokens) parts.push(quoteToken(token));

  // Arguments not covered by a known schema entry (or when no schema is available).
  for (const [name, value] of Object.entries(values)) {
    if (consumed.has(name) || positionalNames.has(name)) continue;
    if (typeof value === "boolean") {
      if (value) parts.push(`--${name}`);
      continue;
    }
    if (!isPresent(value)) continue;
    const text = String(value);
    if (text.startsWith("-")) {
      parts.push(`--${name}=${quoteToken(text)}`);
    } else {
      parts.push(`--${name}`, quoteToken(text));
    }
  }

  if (remainder) parts.push(remainder);

  return parts.join(" ");
}

/**
 * Convert a workflow step into the message string sent to the agent.
 *
 * Plain strings are chat messages (no leading `/`). Structured steps become
 * `/command --args … remainder` using the live command registry when available.
 */
export function formatWorkflowStep(step: WorkflowStep, commandService?: AgentCommandService | null): string {
  if (typeof step === "string") return step;

  const command = commandService?.getCommand(step.command);
  return formatCommandStep(step, command?.inputSchema);
}

/** Short label for UI lists (runs, previews). */
export function formatWorkflowStepLabel(step: WorkflowStep): string {
  if (typeof step === "string") return step;
  return formatCommandStep(step);
}
