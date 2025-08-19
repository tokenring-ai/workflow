import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry"; // Adjust if your path is different
import {z} from "zod";

const evaluationSchema = z.object({
  feedback: z
    .string()
    .describe(
      "Constructive feedback for the writer. If satisfied, this can be a brief positive comment. If not, it should clearly state what needs improvement.",
    ),
  satisfied: z
    .boolean()
    .describe(
      "True if the article meets all requirements and is of good quality, false otherwise.",
    ),
  score: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("An optional score from 0-10 indicating quality."),
});

// Type inferred from the Zod schema
type Evaluation = z.infer<typeof evaluationSchema>;

interface InputType {
  articleText: string;

  // Allow additional properties of unknown type
  [key: string]: unknown;
}

interface WorkflowContext {
  originalTask?: {
    constraint?: string;
    topic?: string;
  };

  // Allow additional properties of unknown type
  [key: string]: unknown;
}

interface AgentConfig {
  constraint?: string;
  topic?: string;

  // Allow additional properties of unknown type
  [key: string]: unknown;
}

/**
 * Agent to evaluate an article and provide feedback.
 *                e.g., { articleText: "..." }.
 */
async function process(
  input: InputType,
  workflowContext: WorkflowContext,
  registry: Registry,
  agentConfig: AgentConfig = {}
): Promise<Evaluation> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine(
    "[ArticleSupervisorAgent] Starting article evaluation...",
  );

  if (!input) {
    throw new Error(
      'Input must be an object with an "articleText" string property.',
    );
  }

  const constraint =
    agentConfig.constraint ||
    workflowContext.originalTask?.constraint ||
    "general quality standards"; // Access from context if available
  const topic =
    agentConfig.topic ||
    workflowContext.originalTask?.topic ||
    "the assigned topic";

  const systemPrompt = `You are a writer's supervisor. You will be given an article. Your task is to evaluate if it meets the requirements (e.g., length, topic adherence, quality) and provide constructive feedback for improvements if it doesn't. If it's good, mark it as satisfied. The specific constraint for this article is: "${constraint}". The article should be about: "${topic}".`;

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["evaluation", "editing"],
  });

  try {
    const userMessageContent = `Please evaluate the following article based on the requirements.\nConstraint: ${constraint}\nTopic: ${topic}\n\nArticle Text:\n---\n${input.articleText}\n---`;
    const messages = [{role: "user", content: userMessageContent}];

    const generated = await client.generateObject(
      {
        messages,
        schema: evaluationSchema,
        prompt: systemPrompt,
        temperature: 0.2,
      },
      registry,
    );

    const evaluation = generated.object;

    // Ensure feedback is provided even if satisfied
    if (evaluation.satisfied && !evaluation.feedback) {
      evaluation.feedback =
        "The article meets the requirements and is of good quality.";
    }

    chatService.systemLine(
      `[ArticleSupervisorAgent] Evaluation completed. Satisfied: ${evaluation.satisfied}. Feedback: ${evaluation.feedback.substring(0, 100)}...`,
    );
    return evaluation;
  } catch (error: unknown) {
    let message = "Unknown error";
    if (error instanceof Error) {
      message = error.message;
    }
    chatService.errorLine(
      `[ArticleSupervisorAgent] Error during article evaluation: ${message}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;