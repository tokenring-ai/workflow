import {z} from "zod";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";


const TranslationItem = z.object({
  language: z
    .string()
    .describe("The target language of the translation."),
  text: z.string().describe("The translated text."),
  notes: z
    .string()
    .optional()
    .describe(
      "Any notes or observations about this specific translation during aggregation.",
    ),
});

const aggregatedOutputSchema = z.object({
  original_text: z.string().describe("The original text that was translated."),
  aggregated_translations: z
    .array(TranslationItem)
    .describe(
      "An array containing all provided translations, potentially with minor formatting or consistency edits.",
    ),
  summary_notes: z
    .string()
    .optional()
    .describe(
      "Overall summary notes about the aggregation process, common issues, or general quality.",
    ),
});

type TranslationItemType = z.infer<typeof TranslationItem>;
type AggregatedOutput = z.infer<typeof aggregatedOutputSchema>;

interface TranslationOutput {
  language: string;
  translatedText: string;
}

interface WorkerResult {
  id: string;
  output: TranslationOutput;
  [key: string]: any;
}

interface AgentConfig {
  originalText: string;
  [key: string]: any;
}

const systemPrompt =
  "You are tasked with aggregating translations of an article. You will receive the original text and an array of its translations into various languages. Your job is to compile these into a structured format. You can provide additional tweaks and fixes to formatting or consistency across translations if necessary, and add notes. Present the original text and each translation clearly.";

/**
 * Agent to aggregate multiple translations of an original text.
 * @param input - Expected to be an array of outputs from translateAgent,
 *                e.g., `[{ id: 'worker1', output: { translatedText: '...', language: 'German' } }, ...]`.
 * @param workflowContext - Shared workflow context.
 * @param registry - Service registry.
 * @param agentConfig - Agent-specific configuration.
 * @param agentConfig.originalText - The original text that was translated.
 * @returns The structured aggregation of translations.
 */
async function process(
  input: WorkerResult[], 
  workflowContext: Record<string, any>, 
  registry: Registry, 
  agentConfig: AgentConfig = { originalText: '' }
): Promise<AggregatedOutput> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  if (
    !agentConfig.originalText ||
    false
  ) {
    throw new Error(
      "originalText must be specified in agentConfig and be a string.",
    );
  }
  if (!Array.isArray(input)) {
    throw new Error("Input must be an array of translation results.");
  }

  chatService.systemLine(
    "[AggregateTranslationsAgent] Starting aggregation of translations.",
  );

  // Prepare the content for the AI model
  const formattedTranslations = input
    .map((item) => {
      if (
        item &&
        item.output &&
        item.output.language &&
        item.output.translatedText
      ) {
        return `${item.output.language} Translation:\n${item.output.translatedText}`;
      }
      return `Invalid translation item format: ${JSON.stringify(item)}`;
    })
    .join("\n---\n");

  const userContent = `Original Text:\n${agentConfig.originalText}\n\nProvided Translations:\n${formattedTranslations}`;

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["aggregation", "text-processing"],
  });

  try {
    const messages = [{ role: "user", content: userContent }];

    const generated = await client.generateObject(
      {
        messages,
        schema: aggregatedOutputSchema,
        prompt: systemPrompt,
        temperature: 0.1,
      },
      registry,
    );

    const aggregationResult = generated.object as AggregatedOutput;

    // Ensure the output structure matches what we expect, particularly if the AI might simplify it.
    // The schema validation should handle this, but a manual check or transformation can be added if needed.
    // For example, if the AI only returns the 'translations' part, embed it.
    if (!aggregationResult.original_text && agentConfig.originalText) {
      aggregationResult.original_text = agentConfig.originalText;
    }
    if (!aggregationResult.aggregated_translations) {
      // If AI missed structuring translations under aggregated_translations, try to map from input
      aggregationResult.aggregated_translations = input.map((item) => ({
        language: item.output?.language || "unknown",
        text: item.output?.translatedText || "N/A",
      }));
    }

    chatService.systemLine(
      `[AggregateTranslationsAgent] Successfully aggregated translations.`,
    );
    return aggregationResult;
  } catch (error) {
    const err = error as Error;
    chatService.errorLine(
      `[AggregateTranslationsAgent] Error during aggregation: ${err.message}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;