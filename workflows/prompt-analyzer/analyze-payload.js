import ModelRegistry from "@token-ring/ai-client/ModelRegistry";

import { z } from "zod";

const outputSchema = z.object({
	// Temperature between 0.0 and 1.0
	temperature: z.number().min(0).max(1),

	// Top_p between 0.0 and 1.0
	top_p: z.number().min(0).max(1),

	// How much reasoning should be applied (0 = low, 1 = medium, 2 = high, 3 = very high)
	reasoning: z.number().min(0).max(3).int(),

	// Whether a high-parameter model is needed
	requiresHighParameterModel: z.boolean(),

	// Whether a long context window is needed
	requiresLongService: z.boolean(),

	// Specific files needed to complete the request
	requiresFiles: z.array(z.string()),

	// File search queries to execute
	searchFilesFor: z.array(z.string()),

	// Web search queries to execute
	searchWebFor: z.array(z.string()),

	// Whether task is exceptionally complex and needs to be broken down
	isExceptionallyComplex: z.boolean(),
});

const systemPrompt = `You are a prompt analyzer, analyzing a prompt that will be fed to an AI model. Given the following chat payload, determine:
- A suitable temperature (0.0–1.0).
- A suitable top_p (0.0–1.0).
- Whether a low, or high parameter AI model is needed to respond to the query.
- How much reasoning should be applied (0 = low, 1 = medium, 2 = high, 3 = very high).
- A list of any specific files that are needed to complete the request. Each item should be a file path relative to the project root.
- Whether a web search is necessary to gather information to complete the request, and if so, a list of search queries to execute.
- Whether a file search is necessary to gather information to complete the request, and if so, a list of file search queries to execute.
- Whether the task is so exceptionally complex and difficult to solve, that it absolutely needs to be broken down into discrete subtasks to execute one by one.`;

/**
 * Analyze a chat payload for meta-parameters (model, temperature, etc.).
 * @param {ChatRequest} request - The chat payload.
 * @param {TokenRingRegistry} registry - The package registry
 */
export default async function analyzePayload(request, registry) {
	const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

	let input = request.messages
		.map(({ role, content }) => `"${role}": "${content}"`)
		.join(",\n  ");
	if (input.length > 30000) {
		input = `${input.slice(0, 2500)}
--- Chat length was ${input.length} characters, omitting the middle of chat for brevity---
${input.slice(-5000)}`;
	}

	const client = await modelRegistry.getFirstOnlineClient({
		tags: ["analyze"],
	});

	// Generate object using schema
	const [output] = await client.generateObject(
		{
			messages: [
				{
					role: "system",
					content: systemPrompt,
				},
				{
					role: "user",
					content: input,
				},
			],
			schema: outputSchema,
			temperature: 0.0,
		},
		registry,
	);

	return output;
}

export const execute = analyzePayload;
