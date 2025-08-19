import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";

// No Zod schema for the main output, as it uses generateText.

interface InputType {
  customerQuery: string;

  // Allow additional arbitrary data from router output; use unknown for safety.
  [key: string]: unknown;
}

interface OutputType {
  response: string;
}

interface AgentConfig {
  specialistType?: string;
  systemPrompt?: string;
}

/**
 * A generic specialist agent that responds to a customer query based on its configured type.
 *                May also contain other data if router output was passed.
 */
async function process(
  input: InputType,
  workflowContext: Record<string, unknown>,
  registry: Registry,
  agentConfig: AgentConfig = {}
): Promise<OutputType> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  const specialistType = agentConfig.specialistType || "general"; // Default if not provided
  chatService.systemLine(
    `[GenericSpecialistAgent:${specialistType}] Starting response...`,
  );

  if (!input) {
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
    const messages = [
      {role: "system", content: systemPrompt},
      {role: "user", content: input.customerQuery},
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
    return {response: responseText};
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    chatService.errorLine(
      `[GenericSpecialistAgent:${specialistType}] Error during text generation: ${errMsg}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;