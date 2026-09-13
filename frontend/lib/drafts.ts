import { normalizeSteps, type WorkflowStep } from "@tokenring-ai/one-frontend/features/workflows/commandStep.ts";
import { type Workflow, WorkflowItemSchema } from "@tokenring-ai/workflow/schema";
import { parse, stringify } from "yaml";

/** Matches the workflow service's name validation. */
export const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
/** Matches the workflow schema's default category. */
export const DEFAULT_CATEGORY = "User-Created Workflows";
/** Shared route for the embedded marketplace pane (defined once, used by app.tsx and the app). */
export const MARKETPLACE_PATH = "/workflows/marketplace";

export interface SubAgentSettings {
  forwardChatOutput: boolean;
  forwardStatusMessages: boolean;
  forwardSystemOutput: boolean;
  forwardHumanRequests: boolean;
  forwardReasoning: boolean;
  forwardInputCommands: boolean;
  timeout: number;
  maxResponseLength: number;
  minContextLength: number;
}

export interface WorkflowDraft {
  displayName: string;
  category: string;
  description: string;
  agentType: string;
  steps: WorkflowStep[];
  subAgent: SubAgentSettings;
}

export type { Workflow, WorkflowStep };

export const DEFAULT_SUB_AGENT: SubAgentSettings = {
  forwardChatOutput: false,
  forwardStatusMessages: true,
  forwardSystemOutput: false,
  forwardHumanRequests: true,
  forwardReasoning: false,
  forwardInputCommands: true,
  timeout: 0,
  maxResponseLength: 10000,
  minContextLength: 1000,
};

export function emptyDraft(): WorkflowDraft {
  return {
    displayName: "",
    category: "",
    description: "",
    agentType: "",
    steps: [""],
    subAgent: { ...DEFAULT_SUB_AGENT },
  };
}

export function toDraft(workflow: Workflow): WorkflowDraft {
  return {
    displayName: workflow.displayName,
    category: workflow.category,
    description: workflow.description,
    agentType: workflow.agentType,
    steps: workflow.steps.length > 0 ? [...workflow.steps] : [""],
    subAgent: { ...DEFAULT_SUB_AGENT, ...workflow.subAgent },
  };
}

/** Deep-ish copy of a draft so a clone can be edited independently of the source. */
export function cloneDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    displayName: draft.displayName,
    category: draft.category,
    description: draft.description,
    agentType: draft.agentType,
    steps: draft.steps.map(step => (typeof step === "string" ? step : { command: step.command, arguments: { ...step.arguments }, remainder: step.remainder })),
    subAgent: { ...draft.subAgent },
  };
}

/** Picks a free file name for a clone of `baseName` (e.g. bugHunter → bugHunter-copy). */
export function uniqueCloneName(baseName: string, existingNames: Iterable<string>): string {
  const taken = new Set(existingNames);
  const candidate = `${baseName}-copy`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${baseName}-copy${n}`)) n += 1;
  return `${baseName}-copy${n}`;
}

/** Drops blank steps so a stray editor row is never persisted, and fills in an empty category. */
export function normalizeDraft(draft: WorkflowDraft): WorkflowDraft {
  return {
    ...draft,
    displayName: draft.displayName.trim(),
    category: draft.category.trim() || DEFAULT_CATEGORY,
    description: draft.description.trim(),
    steps: normalizeSteps(draft.steps),
  };
}

function sameStep(a: WorkflowStep, b: WorkflowStep): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a === "string") return a === b;
  if (typeof b === "string" || typeof a === "string") return false;
  if (a.command !== b.command || a.remainder !== b.remainder) return false;
  const aEntries = Object.entries(a.arguments);
  const bEntries = Object.entries(b.arguments);
  if (aEntries.length !== bEntries.length) return false;
  return aEntries.every(([key, value]) => {
    const other = (b.arguments as Record<string, unknown>)[key];
    return other === value;
  });
}

/** Field-wise draft comparison — unlike a JSON stringify compare, key order cannot fake equality. */
export function isSameDraft(a: WorkflowDraft, b: WorkflowDraft): boolean {
  const left = normalizeDraft(a);
  const right = normalizeDraft(b);
  return (
    left.displayName === right.displayName &&
    left.category === right.category &&
    left.description === right.description &&
    left.agentType === right.agentType &&
    left.steps.length === right.steps.length &&
    left.steps.every((step, index) => sameStep(step, right.steps[index]!)) &&
    (Object.keys(DEFAULT_SUB_AGENT) as (keyof SubAgentSettings)[]).every(key => left.subAgent[key] === right.subAgent[key])
  );
}

export function matchesWorkflowFilter(workflow: Workflow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    workflow.displayName.toLowerCase().includes(q) ||
    workflow.name.toLowerCase().includes(q) ||
    workflow.description.toLowerCase().includes(q) ||
    workflow.category.toLowerCase().includes(q) ||
    workflow.agentType.toLowerCase().includes(q)
  );
}

export function workflowTitle(workflow: Workflow): string {
  return workflow.displayName || workflow.name;
}

/** Serializes a draft into workflow YAML exactly as the backend would store it. */
export function workflowYaml(draft: WorkflowDraft): string {
  const normalized = normalizeDraft(draft);
  const item = WorkflowItemSchema.parse({
    displayName: normalized.displayName,
    category: normalized.category,
    description: normalized.description,
    agentType: normalized.agentType,
    steps: normalized.steps,
    subAgent: normalized.subAgent,
  });
  return `# TokenRing workflow definition. The file name is the workflow name.\n${stringify(item)}`;
}

/**
 * Parses YAML text into a draft. Throws (with the schema's message) when the YAML
 * does not match the workflow schema, so callers can block saving invalid text.
 */
export function parseWorkflowYaml(text: string): WorkflowDraft {
  const parsed: unknown = parse(text);
  const item = WorkflowItemSchema.parse(parsed ?? {});
  return {
    displayName: item.displayName,
    category: item.category,
    description: item.description,
    agentType: item.agentType,
    steps: item.steps.length > 0 ? [...item.steps] : [""],
    subAgent: { ...DEFAULT_SUB_AGENT, ...item.subAgent },
  };
}
