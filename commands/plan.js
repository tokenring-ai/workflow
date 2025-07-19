import ChatService from "@token-ring/chat/ChatService";
import * as planTasksWorkflow from "../workflows/task-planner/plan-tasks.js";
import WorkflowService from "../WorkflowService.js";

export const description =
	"/plan <prompt> - Generate a plan of AI tasks from the prompt";

export async function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const workflowService = registry.requireFirstServiceByType(WorkflowService);

	if (!remainder || remainder.trim() === "") {
		// No arguments provided, show help
		this.help(chatService);
		return;
	}

	try {
		// Generate the plan using plan-tasks.js
		chatService.systemLine(`Generating plan for: "${remainder}"`);

		const plan = await workflowService.run(
			planTasksWorkflow,
			{ prompt: remainder },
			registry,
		);

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
	} catch (error) {
		chatService.errorLine(`Error generating plan: ${error.message}`);
	}
}

export function help() {
	return [
		"/plan [prompt]",
		"  - With no arguments: shows command help",
		"  - /plan <prompt>: Generate a plan of AI tasks from the prompt",
	];
}
