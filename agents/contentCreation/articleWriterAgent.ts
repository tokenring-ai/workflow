import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry"; // Adjust if your path is different // Adjust if your path is different

// No Zod schema for output as it's a simple object with a string.

interface OriginalTask {
  topic?: string;
  constraint?: string;
}

interface PreviousWork {
  articleText: string;
}

// No Zod schema for output as it's a simple object with a string.

interface OriginalTask {
  topic?: string;
  constraint?: string;
}

interface PreviousWork {
  articleText: string;
}

interface InputType {
  originalTask?: OriginalTask;
  topic?: string;
  constraint?: string;
  previousWork?: PreviousWork;
  feedback?: string;

  [key: string]: unknown;
}

interface OutputType {
  articleText: string;
}

const systemPrompt =
  "You are a writer. Your task is to write an article. Adhere to any specified constraints and incorporate any feedback provided on previous versions. Be clear and concise.";

/**
 * Agent to write or revise an article based on input and feedback.
 */
async function process(
  input: InputType,
  workflowContext: Record<string, unknown>,
  registry: Registry,
  agentConfig: Record<string, unknown> = {}
): Promise<OutputType> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine(
    "[ArticleWriterAgent] Starting article generation/revision...",
  );

  let userMessageContent: string;
  const topic = input.originalTask?.topic || input.topic || "a general topic";
  const constraint =
    input.originalTask?.constraint ||
    input.constraint ||
    "no specific constraint";

  if (input.previousWork && input.feedback) {
    chatService.systemLine(
      `[ArticleWriterAgent] Revising article based on feedback. Topic: ${topic}`,
    );
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
    chatService.systemLine(
      `[ArticleWriterAgent] Writing new article. Topic: ${topic}`,
    );
    userMessageContent = `Please write an article on the topic: \"${topic}\".
Constraint: ${constraint}`;
  }

  if (!userMessageContent) {
    throw new Error(
      "Could not determine content for article generation (missing topic/constraint or feedback).",
    );
  }

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["writing", "content-creation"],
  });

  try {
    const messages = [{role: "user", content: userMessageContent}];

    const generated = await client.generateText(
      {
        messages,
        prompt: systemPrompt, // System prompt providing overall instruction
        temperature: 0.6, // Slightly higher for creative writing
      },
      registry,
    );

    const articleText = generated.text;

    chatService.systemLine(
      `[ArticleWriterAgent] Article processing completed. Text length: ${articleText.length}`,
    );
    return {articleText};
  } catch (error: unknown) {
    const errMsg = (error as Error).message ?? "Unknown error";
    chatService.errorLine(
      `[ArticleWriterAgent] Error during article generation/revision: ${errMsg}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;