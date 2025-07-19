import ChatService from "@token-ring/chat/ChatService";
import * as analyzePromptWorkflow from "../workflows/prompt-analyzer/analyze-prompt.js";
import * as planTasksWorkflow from "../workflows/task-planner/plan-tasks.js";
import runChat from "@token-ring/ai-client/runChat";
import WorkflowService from "../WorkflowService.js";

export const description =
	"/analyze <option1=val1 option2=val2 ...> -- <prompt>";

export async function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const workFlowService = registry.requireFirstServiceByType(WorkflowService);

	if (!remainder || !remainder.trim()) {
		chatService.errorLine(
			"Usage: /analyze <option1=val1 option2=val2 ...> -- <prompt>",
		);
		return;
	}

	// Split options and prompt
	const [optionsPart, ...promptParts] = remainder.split("--");
	const prompt = promptParts.join("--").trim();
	const optionsString = optionsPart.trim();

	if (!prompt) {
		chatService.errorLine(
			"Usage: /analyze <option1=val1 option2=val2 ...> -- <prompt>",
		);
		return;
	}

	// Parse options
	const options = {};
	if (optionsString) {
		for (const opt of optionsString.split(" ")) {
			if (opt.includes("=")) {
				const [key, value] = opt.split("=");
				options[key.trim()] = value.trim();
			}
		}
	}

	const analysisResult = await workFlowService.run(
		analyzePromptWorkflow,
		{ prompt },
		registry,
	);

	if (analysisResult.isExceptionallyComplex) {
		chatService.systemLine(
			"[AnalyzeCommand] Task is exceptionally complex. Running task planner...",
		);
		const subTaskAnalyses = await workFlowService.run(
			planTasksWorkflow,
			{ prompt },
			registry,
		);

		if (!subTaskAnalyses || subTaskAnalyses.length === 0) {
			chatService.warningLine(
				"[AnalyzeCommand] Task planner did not return any subtasks. Nothing to execute.",
			);
			return;
		}

		chatService.systemLine(
			`[AnalyzeCommand] Task planner generated ${subTaskAnalyses.length} subtasks. Executing them sequentially...`,
		);
		let lastSubTaskResult;
		for (let i = 0; i < subTaskAnalyses.length; i++) {
			const subTask = subTaskAnalyses[i];
			// Check if subTask itself might indicate an error from the planning/analysis stage for that subtask
			if (subTask.error) {
				chatService.errorLine(
					`[AnalyzeCommand] Skipping subtask ${i + 1} due to error during its planning/analysis: ${subTask.error}`,
				);
				continue;
			}
			chatService.systemLine(
				`[AnalyzeCommand] Executing subtask ${i + 1}/${subTaskAnalyses.length}: ${subTask.input.find((m) => m.role === "user")?.content?.substring(0, 100) || "User prompt not found"}...`,
			);
			lastSubTaskResult = await runChat(
				{
					input: subTask.input,
					systemPrompt: chatService.getInstructions(),
					temperature: subTask.temperature,
					top_p: subTask.top_p,
					model: subTask.model,
				},
				registry,
			);
		}
		chatService.systemLine("[AnalyzeCommand] Finished executing all subtasks.");
		return lastSubTaskResult; // Return the result of the last subtask execution
	} else {
		chatService.systemLine(
			"[AnalyzeCommand] Task is not exceptionally complex. Running directly...",
		);
		return runChat(
			{
				input: analysisResult.input,
				systemPrompt: chatService.getInstructions(),
				temperature: analysisResult.temperature,
				top_p: analysisResult.top_p,
				model: analysisResult.model,
			},
			registry,
		);
	}
}

export function help() {
	return [
		"/analyze <option1=val1 option2=val2 ...> -- <prompt>",
		"  - With no arguments: shows command help",
		"  - Options:",
		"    - model: The model to use for analysis",
		"    - rewrite: Whether to rewrite input (true/false)",
		"    - plan: Whether to generate task plan (true/false)",
		"    - fewshot: Whether to use few-shot prompting (true/false)",
	];
}
