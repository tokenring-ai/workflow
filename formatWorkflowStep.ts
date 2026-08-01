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

/**
 * Build the agent input string for a structured command step.
 *
 * Named args from the command schema are emitted as `--name` / `--name value`.
 * Positionals (also stored in `arguments` by name) are emitted as bare tokens in schema order.
 * Values not in the schema are emitted as `--name value` so unknown commands still work.
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
    if (!isPresent(value) || value === false) continue;
    const text = String(value);
    if (text.startsWith("-")) {
      parts.push(`--${name}=${quoteToken(text)}`);
    } else {
      parts.push(`--${name}`, quoteToken(text));
    }
  }

  for (const positional of positionals) {
    consumed.add(positional.name);
    const value = values[positional.name];
    if (!isPresent(value) || value === false) continue;
    parts.push(quoteToken(String(value)));
  }

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

  const remainder = step.remainder.trim();
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
