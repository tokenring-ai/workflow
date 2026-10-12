import { AgentManager } from "@tokenring-ai/agent";
import type Agent from "@tokenring-ai/agent/Agent";
import { formatWorkflowStepLabel } from "../formatWorkflowStep.ts";
import type { Workflow, WorkflowItem, WorkflowStep } from "../schema.ts";

/** One line per step, numbered, as shown in approval prompts. */
export function describeSteps(steps: WorkflowStep[]): string {
  if (steps.length === 0) return "  (no steps)";
  return steps
    .map((step, index) => {
      const options =
        typeof step === "string"
          ? ""
          : [step.onError === "continue" ? "continue on error" : "", step.retries ? `${step.retries} retries` : ""].filter(Boolean).join(", ");
      return `  ${index + 1}. ${formatWorkflowStepLabel(step)}${options ? ` (${options})` : ""}`;
    })
    .join("\n");
}

/** Human-readable summary of a workflow body for an approval prompt. */
export function describeWorkflow(name: string, item: Pick<WorkflowItem, "displayName" | "agentType" | "description" | "steps">): string {
  return [
    `Workflow: ${name} — ${item.displayName}`,
    `Agent type: ${item.agentType}`,
    item.description ? `Description: ${item.description}` : "",
    "Steps:",
    describeSteps(item.steps),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Error text when `agentType` is not a configured agent type, or null when it exists. */
export function unknownAgentTypeError(agentType: string, agent: Agent): string | null {
  const agentManager = agent.getService(AgentManager);
  if (!agentManager || agentManager.getAgentConfig(agentType)) return null;
  return `Agent type "${agentType}" does not exist. Use an agent type that is configured in this workspace.`;
}

/** The compact JSON shape tools return for a workflow. */
export function workflowSummary(workflow: Workflow) {
  return {
    name: workflow.name,
    displayName: workflow.displayName,
    category: workflow.category,
    description: workflow.description,
    agentType: workflow.agentType,
    stepCount: workflow.steps.length,
    updatedAt: workflow.updatedAt,
  };
}
