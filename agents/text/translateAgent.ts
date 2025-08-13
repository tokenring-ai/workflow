import ModelRegistry from "@token-ring/ai-client/ModelRegistry"; // Adjusted import path
import ChatService from "@token-ring/chat/ChatService";
import {Runnable} from "@token-ring/runnable"; // Fixed import path


/**
 * Input for the translate agent
 */
export interface TranslateAgentInput {
  textToTranslate: string;
}

/**
 * Output from the translate agent
 */
export interface TranslateAgentOutput {
  translatedText: string;
  language: string;
}

/**
 * Configuration for the translate agent
 */
export interface TranslateAgentConfig {
  targetLanguage: string;
  sourceLanguage?: string;
}

/**
 * Agent to translate text to a target language, implemented as a Runnable.
 */
export class TranslateAgent extends Runnable<TranslateAgentInput, TranslateAgentOutput> {
  agentConfig: Required<TranslateAgentConfig>;

  /**
   * @param agentConfig - Configuration for the agent.
   * @param runnableOpts - Options for Runnable base class.
   */
  constructor(agentConfig: TranslateAgentConfig, runnableOpts?: any) {
    super({
      name: `TranslateAgent (to ${agentConfig.targetLanguage || 'unknown'})`,
      ...runnableOpts
    });
    
    this.agentConfig = {
      sourceLanguage: "English", // Default source language
      ...agentConfig,
    };

    if (!this.agentConfig.targetLanguage) {
      throw new Error(
        "TranslateAgent: targetLanguage must be specified in agentConfig.",
      );
    }
  }

  /**
   * Executes the translation.
   * @param input - The input object containing textToTranslate.
   * @param context - The context containing registry.
   * @returns An object containing the translated text and target language.
   */
  async *invoke(input: TranslateAgentInput, context?: any): AsyncGenerator<any, TranslateAgentOutput, void> {
    if (!input || false) {
      yield { 
        type: 'log', 
        level: 'error', 
        message: 'TranslateAgent: Input must be an object with a "textToTranslate" string property.',
        timestamp: Date.now(),
        runnableName: this.name
      };
      
      throw new Error(
        'TranslateAgent: Input must be an object with a "textToTranslate" string property.',
      );
    }

    const registry = context?.registry;
    if (!registry) {
      yield { 
        type: 'log', 
        level: 'error', 
        message: 'TranslateAgent: registry not found in context.',
        timestamp: Date.now(),
        runnableName: this.name
      };
      
      throw new Error(
        "TranslateAgent: registry not found in context.",
      );
    }

    const chatService = registry.requireFirstServiceByType(ChatService);
    const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

    const { targetLanguage, sourceLanguage } = this.agentConfig;

    // Yield log event instead of using this.log
    yield { 
      type: 'log', 
      level: 'info', 
      message: `Starting translation of text from ${sourceLanguage} to ${targetLanguage}. Text: "${input.textToTranslate.substring(0, 50)}..."`,
      timestamp: Date.now(),
      runnableName: this.name
    };

    const systemPrompt = `You are an expert translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Respond ONLY with the translated text. Do not include any preambles, apologies, or explanations.`;

    try {
      // Get a model client with appropriate tags
      const client = await modelRegistry.chat.getFirstOnlineClient('auto');

      const messages = [{ role: "user", content: input.textToTranslate }];

      const generated = await client.generateText(
        {
          messages,
          prompt: systemPrompt,
          temperature: 0.3,
        },
        registry,
      );

      const translatedText = generated.text;

      yield { 
        type: 'log', 
        level: 'info', 
        message: `Successfully translated text to ${targetLanguage}.`,
        timestamp: Date.now(),
        runnableName: this.name
      };
      
      return { translatedText, language: targetLanguage };
    } catch (err) {
      const error = err as Error;
      
      yield { 
        type: 'log', 
        level: 'error', 
        message: `Error during translation to ${targetLanguage}: ${error.message}`,
        timestamp: Date.now(),
        runnableName: this.name,
        error
      };
      
      // Re-throw the error to be handled by Runnable's retry/fallback mechanisms or calling workflow
      throw err;
    }
  }
}

// Default export can be the class itself
export default TranslateAgent;