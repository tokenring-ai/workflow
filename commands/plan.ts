import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import * as planTasksWorkflow from "../workflows/task-planner/plan-tasks.js";
import WorkflowService from "../WorkflowService.js";

/**
 * /plan <prompt> - Generate a plan of AI tasks from the prompt
 */

export const description: string =
  "/plan <prompt> - Generate a plan of AI tasks from the prompt";

interface PlanTask {
  intent?: string;
  description?: string;
  subtasks?: string[];
  execution?: (registry: Registry) => Promise<any>;
}

/**
 * Returns help information for the plan command
 */
export function help(): Array<string> {
  return [
    "/plan [prompt] - Generate a plan of AI tasks from the prompt",
    "",
    "  Examples:",
    "    /plan create a new React component    - Generate plan for creating component",
    "    /plan refactor database layer        - Generate plan for refactoring",
    "    /plan                                - Show this help",
  ];
}

export async function execute(
  remainder: string,
  registry: Registry
): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const workflowService = registry.requireFirstServiceByType(WorkflowService);

  if (!remainder || remainder.trim() === "") {
    // No arguments provided, show help
    const helpLines = help();
    helpLines.forEach(line => chatService.systemLine(line));
    return;
  }

  try {
    // Generate the plan using plan-tasks.js
    chatService.systemLine(`Generating plan for: "${remainder}"`);

    const plan = await workflowService.run(
      planTasksWorkflow,
      {prompt: remainder},
      registry,
    ) as PlanTask[];

    if (!plan || plan.length === 0) {
      chatService.warningLine("No tasks were generated for the plan.");
      return;
    }

    // Display the plan to the user
    chatService.systemLine("Generated plan:");
    plan.forEach((task, index) => {
      chatService.systemLine(
        `Task ${index + 1}: ${task.intent || "Unknown task"}`,
      );
      if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach((subtask, subIndex) => {
          chatService.systemLine(`  ${index + 1}.${subIndex + 1}: ${subtask}`);
        });
      }
    });

    // Ask for confirmation
    chatService.systemLine("\nDo you want to apply this plan? (yes/no)");

    // Store the plan in the WorkflowService for later use
    workflowService.currentPlan = plan;
    workflowService.planPrompt = remainder;

    chatService.systemLine(
      "Plan saved. Use /apply to execute the plan when ready.",
    );
  } catch (error: any) {
    chatService.errorLine(`Error generating plan: ${error.message}`);
  }
}