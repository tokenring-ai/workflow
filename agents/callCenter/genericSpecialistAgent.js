import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
// No Zod schema for the main output, as it uses generateText.

/**
 * A generic specialist agent that responds to a customer query based on its configured type.
 * @param {object} input - Expected to have `customerQuery` (string).
 *                         May also contain other data if router output was passed.
 * @param {object} workflowContext - Shared workflow context.
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration.
 * @param {string} agentConfig.specialistType - Type of specialist (e.g., "technical", "account").
 * @param {string} [agentConfig.systemPrompt] - Optional custom system prompt.
 * @returns {Promise<{response: string}>} - An object containing the agent's text response.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	const specialistType = agentConfig.specialistType || "general"; // Default if not provided
	chatService.systemLine(
		`[GenericSpecialistAgent:${specialistType}] Starting response...`,
	);

	if (!input || typeof input.customerQuery !== "string") {
		throw new Error(
			'Input must be an object with a "customerQuery" string property.',
		);
	}

	const systemPrompt =
		agentConfig.systemPrompt ||
		`You are a ${specialistType} specialist. Please address the following customer query comprehensively and clearly.`;

	const client = await modelRegistry.getFirstOnlineClient({
		tags: ["support", specialistType],
	});

	try {
		// Construct messages for generateText
		// If router output was passed and merged, it might be in `input` if needed for context here.
		// For this example, we'll primarily use the customerQuery.
		const messages = [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: input.customerQuery },
		];

		// Using generateText as specified
		const generated = await client.generateText(
			{
				messages,
				temperature: 0.5, // Allow for more conversational responses
			},
			registry,
		);

		const responseText = generated.text;

		chatService.systemLine(
			`[GenericSpecialistAgent:${specialistType}] Generated response of length ${responseText.length}.`,
		);
		return { response: responseText };
	} catch (error) {
		chatService.errorLine(
			`[GenericSpecialistAgent:${specialistType}] Error during text generation: ${error.message}`,
		);
		console.error(error);
		throw error;
	}
}

export default process;
