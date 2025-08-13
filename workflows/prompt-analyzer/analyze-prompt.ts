import { flow } from "../../flow.js";
import { z } from "zod";
import analyzePayload from "./analyze-payload.js";
import { ChatService } from "@token-ring/chat";
import { FileSystemService } from "@token-ring/filesystem";
import { createChatRequest } from "@token-ring/ai-client";
import {Registry} from "@token-ring/registry";
import {ChatInputMessage} from "@token-ring/ai-client/client/AIChatClient";
import { FileIndexService } from "@token-ring/file-index";

export const description =
	"Analyze a prompt and determine optimal parameters, model, task complexity, and files";
// Input Schema
export const inputSchema = z.object({
	prompt: z.string().describe("The user prompt to analyze"),
});

// Output Schema
export const outputSchema = z.object({
	model: z.string().describe("The selected model with appropriate tags"),
	input: z
		.array(
			z.object({
				role: z.enum(["user", "system", "assistant","data"]),
				content: z.string(),
			}),
		)
		.describe("Array of messages to send to the AI model"),
	temperature: z
		.number()
		.min(0)
		.max(1)
		.describe("The temperature parameter for the AI model (0.0-1.0)"),
	top_p: z
		.number()
		.min(0)
		.max(1)
		.describe("The top_p parameter for the AI model (0.0-1.0)"),
	isExceptionallyComplex: z
		.boolean()
		.describe(
			"Whether the task is exceptionally complex and needs to be broken down",
		),
});

// Types from the schemas
export type PromptAnalyzerInput = z.infer<typeof inputSchema>;
export type PromptAnalyzerOutput = z.infer<typeof outputSchema>;

interface AnalysisResult {
  requiresHighParameterModel?: boolean;
  reasoning?: number;
  searchWebFor?: string[];
  isExceptionallyComplex: boolean;
  temperature: number;
  top_p: number;
  searchFilesFor: string[];
  requiresFiles: string[];
}

export async function execute({ prompt }: PromptAnalyzerInput, registry: Registry): Promise<PromptAnalyzerOutput> {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const filesystem = registry.requireFirstServiceByType(FileSystemService);

	const systemPrompt = chatService.getInstructions();

	const chatRequest = await createChatRequest(
		{ input: prompt, systemPrompt },
		registry,
	);

	const analysis = await flow(
		"Analyze a chat payload for it's meta-parameters",
		() => analyzePayload(chatRequest, registry),
	) as AnalysisResult;

	const tags: string[] = [];
	if (analysis.requiresHighParameterModel) tags.push("frontier");
	if (analysis.reasoning && analysis.reasoning > 0) tags.push("reasoning");
	if (analysis.searchWebFor && analysis.searchFilesFor.length > 0) tags.push("web-search");

	const model = `chat:${tags.join(",")}`;

	chatService.systemLine(`[PromptAnalyzer] Selected suitable model: ${model}`);
	if (analysis.isExceptionallyComplex) {
		chatService.systemLine(
			"[PromptAnalyzer] Task is flagged as exceptionally complex.",
		);
	}

	const fileIndexMessages = await Promise.all(
		analysis.searchFilesFor.map(async (query) =>
			flow(`Search file index for ${query}`, async () => {
				const fileIndexService =
					registry.requireFirstServiceByType(FileIndexService);
				const results = await fileIndexService.search(query, 10);
				if (results.length > 0) {
					chatService.systemLine(
						`[PromptAnalyzer] Added ${results.length} file search results for ${query} to the chat`,
					);
					return {
						role: "user" as const,
						content: `A file search for ${query} returned the following matches:\n${JSON.stringify(results)}`,
					};
				}
				return null;
			}),
		),
	);

	const wholeFileMessages = await Promise.all(
		analysis.requiresFiles.map(async (file) =>
			flow(`Adding ${file} to chat`, async () => {
				try {
					const content = await filesystem.getFile(file);
					return {
						role: "user" as const,
						content: `// ${file}\n${content}`,
					};
				} catch (err) {
					chatService.errorLine(
						`[PromptAnalyzer] Error reading file ${file}, skipping. Error: `,
						err,
					);
					return null;
				}
			}),
		),
	);

	// Filter out null values and cast to ChatInputMessage
	const validFileIndexMessages: ChatInputMessage[] = fileIndexMessages.filter(Boolean) as ChatInputMessage[];
	const validWholeFileMessages: ChatInputMessage[] = wholeFileMessages.filter(Boolean) as ChatInputMessage[];

	const finalMessages: ChatInputMessage[] = [
		...validFileIndexMessages,
		...validWholeFileMessages,
		{ role: "user", content: prompt },
	];

	return {
		model,
		input: finalMessages,
		temperature: analysis.temperature,
		top_p: analysis.top_p,
		isExceptionallyComplex: analysis.isExceptionallyComplex,
	};
}