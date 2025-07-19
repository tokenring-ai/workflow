import ModelRegistry from '@token-ring/ai-client/ModelRegistry';
import ChatService from '@token-ring/chat/ChatService';         // Adjust if your path is different

// No Zod schema for output as it's a simple object with a string.

const systemPrompt = "You are a writer. Your task is to write an article. Adhere to any specified constraints and incorporate any feedback provided on previous versions. Be clear and concise.";

/**
 * Agent to write or revise an article based on input and feedback.
 * @param {object} input - Input object.
 * @param {object} [input.originalTask] - The initial task details, e.g., { topic: "...", constraint: "..." }.
 * @param {string} [input.topic] - Topic for the article (used if originalTask is not present on first call).
 * @param {string} [input.constraint] - Constraint for the article (used if originalTask is not present on first call).
 * @param {object} [input.previousWork] - Object containing previous work, e.g., { articleText: "..." }.
 * @param {string} [input.feedback] - Feedback on the previous work.
 * @param {object} workflowContext - Shared workflow context.
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration (not heavily used here, but could be for style guides etc.).
 * @returns {Promise<{articleText: string}>} - An object containing the generated or revised article text.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine('[ArticleWriterAgent] Starting article generation/revision...');

  let userMessageContent;
  const topic = input.originalTask?.topic || input.topic || "a general topic";
  const constraint = input.originalTask?.constraint || input.constraint || "no specific constraint";

  if (input.previousWork && input.feedback) {
    chatService.systemLine(`[ArticleWriterAgent] Revising article based on feedback. Topic: ${topic}`);
    userMessageContent = `Please revise the article based on the following feedback.
Original Topic: ${topic}
Constraint: ${constraint}

Previous Article:
---
${input.previousWork.articleText}
---

Feedback:
---
${input.feedback}
---
Please provide the new, complete article.`;
  } else {
    chatService.systemLine(`[ArticleWriterAgent] Writing new article. Topic: ${topic}`);
    userMessageContent = `Please write an article on the topic: "${topic}".
Constraint: ${constraint}`;
  }

  if (!userMessageContent) {
      throw new Error("Could not determine content for article generation (missing topic/constraint or feedback).");
  }

  const client = await modelRegistry.getFirstOnlineClient({ tags: ['writing', 'content-creation'] });

  try {
    const messages = [{ role: 'user', content: userMessageContent }];

    const generated = await client.generateText({
      messages,
      prompt: systemPrompt, // System prompt providing overall instruction
      temperature: 0.6, // Slightly higher for creative writing
    }, registry);

    const articleText = generated.text;

    chatService.systemLine(`[ArticleWriterAgent] Article processing completed. Text length: ${articleText.length}`);
    return { articleText };

  } catch (error) {
    chatService.errorLine(`[ArticleWriterAgent] Error during article generation/revision: ${error.message}`);
    console.error(error);
    throw error;
  }
}

export default process;
