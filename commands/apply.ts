import ChatService from "@token-ring/chat/ChatService";
import * as analyzePromptWorkflow from "../workflows/prompt-analyzer/analyze-prompt.js";
import {flow} from "../flow.js";
import WorkflowService from "../WorkflowService.js";
import {Registry} from "@token-ring/registry";

/**
 * /apply - Execute the previously generated plan
 */

export const description: string =
    "/apply - Execute the previously generated plan";

interface PlanTask {
    intent?: string;
    description?: string;
    execution?: (registry: Registry) => Promise<any>;
}

/**
 * Returns help information for the apply command
 */
export function help(): Array<string> {
    return [
        "/apply - Execute the previously generated plan",
        "  - Must use /plan first to create a plan before applying it",
        "  - Executes each task in the plan sequentially",
        "  - Clears the plan after successful execution",
        "",
        "  Examples:",
        "    /apply              - Execute the current plan",
    ];
}

export async function execute(remainder: string, registry: Registry): Promise<void> {
    const chatService = registry.requireFirstServiceByType(ChatService);
    const workflowService = registry.requireFirstServiceByType(WorkflowService);

    // Check if there's a plan to apply
    if (
        !workflowService.currentPlan ||
        workflowService.currentPlan.length === 0
    ) {
        chatService.errorLine(
            "No plan available to apply. Use /plan first to create a plan.",
        );
        const helpLines = help();
        helpLines.forEach(line => chatService.systemLine(line));
        return;
    }

    try {
        const plan: PlanTask[] = workflowService.currentPlan;
        const planPrompt: string = workflowService.planPrompt;

        chatService.systemLine(`Applying plan for: "${planPrompt}"`);
        chatService.systemLine(`Plan contains ${plan.length} tasks.`);

        // Display the plan that will be executed
        chatService.systemLine("Plan to be applied:");
        plan.forEach((task, index) => {
            chatService.systemLine(
                `Task ${index + 1}: ${task.intent || "Unknown task"}`,
            );
        });

        // Execute each task in the plan
        for (let i = 0; i < plan.length; i++) {
            const task = plan[i];
            chatService.systemLine(
                `\nExecuting task ${i + 1}/${plan.length}: ${task.intent || "Unknown task"}`,
            );

            try {
                // If the task has a specific execution function, use it
                // Otherwise, use the analyze-prompt workflow as a fallback
                if (task.execution && typeof task.execution === "function") {
                    await flow(`Execute task: ${task.intent}`, () =>
                        task.execution!(registry),
                    );
                } else {
                    // Use the task intent or description as the prompt
                    const taskPrompt =
                        task.intent || task.description || `Task ${i + 1} from plan`;
                    await flow(`Execute task: ${taskPrompt}`, () =>
                        workflowService.run(
                            analyzePromptWorkflow,
                            { prompt: taskPrompt },
                            registry,
                        ),
                    );
                }

                chatService.systemLine(
                    `Task ${i + 1}/${plan.length} completed successfully.`,
                );
            } catch (error: any) {
                chatService.errorLine(
                    `Error executing task ${i + 1}/${plan.length}: ${error.message}`,
                );
                chatService.warningLine("Continuing with next task...");
            }
        }

        chatService.systemLine("\nPlan execution completed.");

        // Clear the plan after execution
        workflowService.currentPlan = null;
        workflowService.planPrompt = null;
    } catch (error: any) {
        chatService.errorLine(`Error applying plan: ${error.message}`);
    }
}