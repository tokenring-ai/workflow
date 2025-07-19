import { z } from 'zod';
import ModelRegistry from '@token-ring/ai-client/ModelRegistry';
import ChatService from '@token-ring/chat/ChatService';

const applicationDetailsSchema = z.object({
  name: z.string().describe("Full name of the client."),
  loan_amount: z.number().describe("The amount of money the client is requesting."),
  loan_time_in_months: z.number().int().positive().describe("The duration for which the loan is requested, in months."),
  monthly_income: z.number().positive().describe("The client's declared monthly income."),
});

const systemPrompt = "You are a first point of contact for a loan company. Your job is to turn client conversation into a structured loan application based on the provided details. Extract all necessary fields accurately.";

/**
 * Agent to extract loan application details from a conversation.
 * @param {object} input - Expected to have a `conversation` string.
 * @param {object} workflowContext - Shared workflow context.
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration (not used in this agent).
 * @returns {Promise<z.infer<typeof applicationDetailsSchema>>} - The structured loan application details.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine('[ExtractApplicationDetailsAgent] Starting extraction...');

  if (!input || typeof input.conversation !== 'string') {
    throw new Error('Input must be an object with a "conversation" string property.');
  }

  const client = await modelRegistry.getFirstOnlineClient({ tags: ['loan', 'extraction'] }); // Example tags

  try {
    const messages = [{ role: 'user', content: input.conversation }];

    // Using generateObject to get structured output
    const generated = await client.generateObject({
      messages,
      schema: applicationDetailsSchema,
      prompt: systemPrompt, // Some clients might prefer prompt here instead of a system message
      temperature: 0.1,
    }, registry);

    // The Vercel AI SDK's generateObject often returns { object, ... }.
    // Adjust if your client returns the object directly.
    const extractedDetails = generated.object;

    chatService.systemLine(`[ExtractApplicationDetailsAgent] Successfully extracted details: ${JSON.stringify(extractedDetails)}`);
    return extractedDetails;

  } catch (error) {
    chatService.errorLine(`[ExtractApplicationDetailsAgent] Error during extraction: ${error.message}`);
    console.error(error);
    throw error; // Re-throw to be caught by workflow orchestrator
  }
}

export default process;
