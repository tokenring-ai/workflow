import { z } from "zod";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService"; // Adjust if your path is different

const estimationSchema = z.object({
	man_days_estimate: z
		.number()
		.positive()
		.describe("The estimated effort in man-days (e.g., 0.5, 1, 2.5)."),
	reasoning: z
		.string()
		.describe("A brief reasoning for the provided estimate."),
});

/**
 * Generic estimation agent for different roles.
 * @param {object} input - Expected to be a task object from TechLeadAgent,
 *                         e.g., { role: 'developer', taskId: 'dev-01', taskDescription: '...' }.
 * @param {object} workflowContext - Shared workflow context.
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration. Can be used to specialize the prompt further if needed.
 * @returns {Promise<z.infer<typeof estimationSchema>>} - The estimation object.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	const role = input.role || "team member"; // Default role if not specified in input
	chatService.systemLine(
		`[EstimationAgent:${role}] Starting estimation for task ID "${input.taskId}"...`,
	);

	if (
		!input ||
		typeof input.taskDescription !== "string" ||
		typeof input.role !== "string" ||
		typeof input.taskId !== "string"
	) {
		throw new Error(
			"Input must be a task object with role, taskId, and taskDescription string properties.",
		);
	}

	// System prompt can be made more specific using agentConfig if desired, e.g.,
	// agentConfig.roleSpecificPrompt || `You are a ${role} specialist...`
	const systemPrompt =
		agentConfig.baseSystemPrompt ||
		`You are a software development ${role}. You will be given a task description. Your job is to estimate the effort in man-days and provide a brief reasoning. Be realistic and consider potential complexities.`;

	const client = await modelRegistry.getFirstOnlineClient({
		tags: ["estimation", role],
	});

	try {
		let userMessageContent = `Please estimate the following task for your role ('${input.role}'):\nTask ID: ${input.taskId}\nDescription: ${input.taskDescription}`;
		if (input.additionalData) {
			// If TechLeadAgent provided more context
			userMessageContent += `\nAdditional Context: ${JSON.stringify(input.additionalData)}`;
		}
		const messages = [{ role: "user", content: userMessageContent }];

		const generated = await client.generateObject(
			{
				messages,
				schema: estimationSchema,
				prompt: systemPrompt,
				temperature: 0.3, // Slightly higher temperature for more varied reasoning
			},
			registry,
		);

		const estimation = generated.object;

		chatService.systemLine(
			`[EstimationAgent:${role}] Successfully estimated task ID "${input.taskId}": ${JSON.stringify(estimation)}`,
		);
		return estimation;
	} catch (error) {
		chatService.errorLine(
			`[EstimationAgent:${role}] Error during estimation for task ID "${input.taskId}": ${error.message}`,
		);
		console.error(error);
		throw error;
	}
}

export default process;
