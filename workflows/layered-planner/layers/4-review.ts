import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import { flow } from "../../../flow.js";
import { Runnable } from "../../../../runnable/runnable.js";
import { Registry } from "@token-ring/registry";

// Define interfaces for the review layer
interface SubtaskReview {
  subtaskDescription: string;
  status: 'complete' | 'incomplete' | 'partial';
  feedback: string;
}

interface ReviewResponse {
  isComplete: boolean;
  summary: string;
  subtaskReviews: SubtaskReview[];
  nextSteps?: string[];
}

interface Subtask {
  description: string;
  rationale: string;
  [key: string]: any;
}

interface ExecutionResult {
  subtask: Subtask;
  response: any;
  [key: string]: any;
}

interface ReviewParams {
  request: any;
  decomposition: any;
  executionResults: ExecutionResult[];
  registry: Registry;
}

interface ReviewContext {
  request: any;
  plan: {
    decomposition: any;
  };
  executionResults: ExecutionResult[];
  review?: any;
  [key: string]: any;
}

/**
 * JSON Schema for review response, compatible with OpenAI function calling
 */
const reviewResponseSchema = {
  type: "object",
  properties: {
    isComplete: {
      type: "boolean",
      description:
        "Whether the decomposed task is complete based on all subtask results",
    },
    summary: {
      type: "string",
      description: "A summary of the overall task completion and findings",
    },
    subtaskReviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          subtaskDescription: {
            type: "string",
            description: "Description of the subtask being reviewed",
          },
          status: {
            type: "string",
            enum: ["complete", "incomplete", "partial"],
            description: "Status of the subtask completion",
          },
          feedback: {
            type: "string",
            description: "Detailed feedback on the subtask result",
          },
        },
        required: ["subtaskDescription", "status", "feedback"],
      },
      description: "Individual reviews for each subtask",
    },
    nextSteps: {
      type: "array",
      items: {
        type: "string",
      },
      description:
        "Recommended next steps if any subtasks are incomplete or if follow-up work is needed",
    },
  },
  required: ["isComplete", "summary", "subtaskReviews"],
  additionalProperties: false,
};

/**
 * Reviews the results of all subtasks and determines if the decomposed task is complete
 * @param params - The parameters object
 * @param params.request - The original request object
 * @param params.decomposition - The decomposition result from decomposeTask
 * @param params.executionResults - Array of execution results from each subtask
 * @param registry - The package registry
 * @returns - The review result
 */
async function reviewResults({
  request,
  decomposition,
  executionResults,
  registry,
}: ReviewParams) {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const chatService = registry.requireFirstServiceByType(ChatService);

  return await flow("task-review", async () => {
    chatService.systemLine(
      "[TaskReviewer] Reviewing subtask results to determine task completion...",
    );

    // Format the subtask results for review
    const subtaskResultsText = executionResults
      .map((result, index) => {
        return `
SUBTASK ${index + 1}:
Description: ${result.subtask.description}
Rationale: ${result.subtask.rationale}
Response: ${result.response}
      `.trim();
      })
      .join("\n\n");

    const prompt = `You are a task reviewer. Your job is to evaluate the results of executed subtasks and determine if the overall decomposed task is complete.

ORIGINAL TASK DECOMPOSITION:
${JSON.stringify(decomposition, null, 2)}

SUBTASK RESULTS:
${subtaskResultsText}

REVIEW INSTRUCTIONS:
- Carefully review each subtask result against its description and intended purpose
- Determine if each subtask has been completed successfully
- Provide specific feedback for each subtask's result
- Consider dependencies between subtasks
- Determine if the overall task is complete based on all subtask results
- If the task is incomplete, identify what remains to be done
- Provide a comprehensive summary of the review`;

    const client = await modelRegistry.chat.getFirstOnlineClient('auto:reasoning>4');

    const newMessages = [
      ...request.messages,
      { role: "user", content: prompt },
    ];

    // Generate object using schema
    const [review] = await client.generateObject(
      {
        ...request,
        messages: newMessages,
        schema: reviewResponseSchema,
        temperature: 0.2,
      },
      registry,
    );

    chatService.systemLine(
      `[TaskReviewer] Review completed. Task is ${review.isComplete ? "complete" : "incomplete"}.`,
    );

    // Return the review result along with the original request, decomposition, and execution results
    return {
      request,
      decomposition,
      executionResults,
      review,
    };
  });
}

export default class ReviewRunnable extends Runnable {
  async *invoke(context: ReviewContext, { registry }: { registry: any }) {
    const wfCtx = {
      request: context.request,
      decomposition: context.plan.decomposition,
      executionResults: context.executionResults,
    };
    const result = await reviewResults({ ...wfCtx, registry: registry });
    context.review = result;
    yield {
      type: "log",
      level: "info",
      message: "Review complete",
      timestamp: Date.now(),
      runnableName: this.name,
    };
    return context;
  }
}