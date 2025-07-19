import { z } from 'zod';
import ModelRegistry from '@token-ring/ai-client/ModelRegistry';
import ChatService from '@token-ring/chat/ChatService';         // Adjust if your path is different

const evaluationSchema = z.object({
  feedback: z.string().describe("Constructive feedback for the writer. If satisfied, this can be a brief positive comment. If not, it should clearly state what needs improvement."),
  satisfied: z.boolean().describe("True if the article meets all requirements and is of good quality, false otherwise."),
  score: z.number().min(0).max(10).optional().describe("An optional score from 0-10 indicating quality."),
});

/**
 * Agent to evaluate an article and provide feedback.
 * @param {object} input - Expected to be the output of ArticleWriterAgent,
 *                         e.g., { articleText: "..." }.
 * @param {object} workflowContext - Shared workflow context. (Potentially contains originalTask for reference)
 * @param {TokenRingRegistry} registry - Service registry.
 * @param {object} agentConfig - Agent-specific configuration.
 * @param {string} [agentConfig.constraint] - The constraint the article should adhere to.
 * @param {string} [agentConfig.topic] - The original topic of the article.
 * @returns {Promise<z.infer<typeof evaluationSchema>>} - The evaluation object.
 */
async function process(input, workflowContext, registry, agentConfig = {}) {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine('[ArticleSupervisorAgent] Starting article evaluation...');

  if (!input || typeof input.articleText !== 'string') {
    throw new Error('Input must be an object with an "articleText" string property.');
  }

  const constraint = agentConfig.constraint || workflowContext.originalTask?.constraint || "general quality standards"; // Access from context if available
  const topic = agentConfig.topic || workflowContext.originalTask?.topic || "the assigned topic";


  const systemPrompt = `You are a writer's supervisor. You will be given an article. Your task is to evaluate if it meets the requirements (e.g., length, topic adherence, quality) and provide constructive feedback for improvements if it doesn't. If it's good, mark it as satisfied. The specific constraint for this article is: "${constraint}". The article should be about: "${topic}".`;

  const client = await modelRegistry.getFirstOnlineClient({ tags: ['evaluation', 'editing'] });

  try {
    const userMessageContent = `Please evaluate the following article based on the requirements.\nConstraint: ${constraint}\nTopic: ${topic}\n\nArticle Text:\n---\n${input.articleText}\n---`;
    const messages = [{ role: 'user', content: userMessageContent }];

    const generated = await client.generateObject({
      messages,
      schema: evaluationSchema,
      prompt: systemPrompt,
      temperature: 0.2,
    }, registry);

    const evaluation = generated.object;

    // Ensure feedback is provided even if satisfied
    if (evaluation.satisfied && !evaluation.feedback) {
        evaluation.feedback = "The article meets the requirements and is of good quality.";
    }


    chatService.systemLine(`[ArticleSupervisorAgent] Evaluation completed. Satisfied: ${evaluation.satisfied}. Feedback: ${evaluation.feedback.substring(0,100)}...`);
    return evaluation;

  } catch (error) {
    chatService.errorLine(`[ArticleSupervisorAgent] Error during article evaluation: ${error.message}`);
    console.error(error);
    throw error;
  }
}

export default process;
