import ModelRegistry from "@token-ring/chat-router/services/ModelRegistry"; // Adjust path as needed
import ChatService from "@token-ring/chat/ChatService"; // Adjust path as needed
import { Runnable } from "../../../runnable2/runnable.js"; // Assuming runnable.js is two levels up

/**
 * @typedef {Object} TranslateAgentInput
 * @property {string} textToTranslate - The text to be translated.
 */

/**
 * @typedef {Object} TranslateAgentOutput
 * @property {string} translatedText - The translated text.
 * @property {string} language - The target language.
 */

/**
 * @typedef {Object} TranslateAgentConfig
 * @property {string} targetLanguage - The language to translate the text into (e.g., "German", "Spanish").
 * @property {string} [sourceLanguage="English"] - The source language of the text. Defaults to "English".
 */

/**
 * Agent to translate text to a target language, implemented as a Runnable.
 */
export class TranslateAgent extends Runnable {
	/**
	 * @param {TranslateAgentConfig} agentConfig - Configuration for the agent.
	 * @param {import('../../../runnable2/runnable.js').RunnableOptions} [runnableOpts] - Options for Runnable base class.
	 */
	constructor(agentConfig, runnableOpts) {
		super(runnableOpts);
		this.agentConfig = {
			sourceLanguage: "English", // Default source language
			...agentConfig,
		};

		if (!this.agentConfig.targetLanguage) {
			throw new Error(
				"TranslateAgent: targetLanguage must be specified in agentConfig.",
			);
		}
		this.name = `TranslateAgent (to ${this.agentConfig.targetLanguage})`;
	}

	/**
	 * Executes the translation.
	 * @param {TranslateAgentInput} input - The input object containing textToTranslate.
	 * @param {import('../../../runnable2/runnable.js').WorkflowContext} [workflowContext] - The workflow context.
	 * @returns {Promise<TranslateAgentOutput>} - An object containing the translated text and target language.
	 */
	async invoke(input, workflowContext) {
		if (!input || typeof input.textToTranslate !== "string") {
			this.error(
				'TranslateAgent: Input must be an object with a "textToTranslate" string property.',
			);
			throw new Error(
				'TranslateAgent: Input must be an object with a "textToTranslate" string property.',
			);
		}

		const { serviceRegistry } = workflowContext || {};
		if (!serviceRegistry) {
			this.error(
				"TranslateAgent: serviceRegistry not found in workflowContext.",
			);
			throw new Error(
				"TranslateAgent: serviceRegistry not found in workflowContext.",
			);
		}

		const chatService = serviceRegistry.requireFirstServiceByType(ChatService);
		const modelRegistry =
			serviceRegistry.requireFirstServiceByType(ModelRegistry);

		const { targetLanguage, sourceLanguage } = this.agentConfig;

		// Using this.log for logging via Runnable's event system
		this.log(
			`Starting translation of text from ${sourceLanguage} to ${targetLanguage}. Text: "${input.textToTranslate.substring(0, 50)}..."`,
		);

		const systemPrompt = `You are an expert translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Respond ONLY with the translated text. Do not include any preambles, apologies, or explanations.`;

		// The getFirstOnlineClient might need the registry directly, or it might be part of ModelRegistry's methods
		// Assuming ModelRegistry methods are self-contained or use a registry provided at their construction.
		// If client.generateText needs registry, it should be passed if available in its signature.
		// The original code passed `registry` to `generateText`, so we continue this if `client.generateText` supports it.
		const client = await modelRegistry.getFirstOnlineClient({
			tags: ["translation", `to-${targetLanguage.toLowerCase()}`],
		});

		try {
			const messages = [{ role: "user", content: input.textToTranslate }];

			// Check if client.generateText expects a registry/context as its second argument
			// For now, assuming it might, as per original code. Adjust if generateText's API is different.
			const generateTextOptions = workflowContext?.serviceRegistry
				? workflowContext.serviceRegistry
				: undefined;

			const generated = await client.generateText(
				{
					messages,
					prompt: systemPrompt,
					temperature: 0.3,
				},
				generateTextOptions, // Pass registry or context if the method supports/needs it
			);

			const translatedText = generated.text;

			this.log(`Successfully translated text to ${targetLanguage}.`);
			return { translatedText, language: targetLanguage };
		} catch (err) {
			this.error(
				`Error during translation to ${targetLanguage}: ${err.message}`,
				err,
			);
			// Re-throw the error to be handled by Runnable's retry/fallback mechanisms or calling workflow
			throw err;
		}
	}
}

// Default export can be the class itself
export default TranslateAgent;
