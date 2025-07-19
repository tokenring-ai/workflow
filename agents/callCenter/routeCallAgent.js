import { z } from "zod";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";

const routeDecisionSchema = z.object({
	agent_type: z
		.enum(["technical", "account", "finance", "unknown"])
		.describe("The type of agent the call should be routed to."),
});

const systemPrompt =
	"You are a first point of contact for a call center. Your job is to redirect the client to the correct agent based on their query. Valid agent types are: technical (for product issues, troubleshooting), account (for billing, subscription, user details), finance (for payments, refunds, financial queries), or unknown (if the query is unclear or doesn't fit).";

/**
 * Agent to route a call based on customer query.
 * @param {object} input - Expected to have a `customerQuery` string.
 * @param {object} workflowContext - Shared workflow context.
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration (not used).
 * @returns {Promise<z.infer<typeof routeDecisionSchema>>} - The routing decision.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	chatService.systemLine("[RouteCallAgent] Starting call routing...");

	if (!input || typeof input.customerQuery !== "string") {
		throw new Error(
			'Input must be an object with a "customerQuery" string property.',
		);
	}

	const client = await modelRegistry.getFirstOnlineClient({
		tags: ["routing", "classification"],
	});

	try {
		const messages = [{ role: "user", content: input.customerQuery }];

		const generated = await client.generateObject(
			{
				messages,
				schema: routeDecisionSchema,
				prompt: systemPrompt,
				temperature: 0.1,
			},
			registry,
		);

		const decision = generated.object;

		chatService.systemLine(
			`[RouteCallAgent] Routing decision: ${JSON.stringify(decision)}`,
		);
		return decision; // This object will be used, the key 'agent_type' contains the routeKey
	} catch (error) {
		chatService.errorLine(
			`[RouteCallAgent] Error during routing: ${error.message}`,
		);
		console.error(error);
		throw error;
	}
}

export default process;
