import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {flow} from "../../../flow.js";
import {Runnable} from "@token-ring/runnable";
import {Registry} from "@token-ring/registry";

/**
 * Types for task decomposition
 */
interface SubTask {
  description: string;
  rationale: string;
  explanation: string;
  requiresFurtherDecomposition: boolean;
  subtaskType: 'planning' | 'execution' | 'research';
  id: string;
  dependsOn?: string[];
  isCritical?: boolean;
}

interface DecompositionResult {
  subtasks: SubTask[];
  reasoning: string;
}

interface WorkflowContext {
  sharedData: {
    discovery: any;
    [key: string]: any;
  };
  options: {
    breadth?: number;
    [key: string]: any;
  };
}

interface DecomposeContext {
  request: any;
  options?: {
    breadth?: number;
    [key: string]: any;
  };
  plan?: any;
  [key: string]: any;
}

/**
 * JSON Schema for task decomposition response, compatible with OpenAI function calling
 */
const decompositionSchema = {
  type: "object",
  properties: {
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "A clear description of the task starting with a verb",
          },
          rationale: {
            type: "string",
            description:
              "A brief rationale explaining why this subtask is necessary",
          },
          explanation: {
            type: "string",
            description:
              "A detailed explanation defining how this subtask should be accomplished",
          },
          requiresFurtherDecomposition: {
            type: "boolean",
            description:
              "Indicates whether AI should further decompose this subtask, or whether the task is fully defined and executable by AI without needing more information",
          },
          subtaskType: {
            type: "string",
            enum: ["planning", "execution", "research"],
            description:
              "The nature of the subtask (planning, execution, or research). Execution tasks are typically more concrete and tool-oriented.",
          },
          id: {
            type: "string",
            description:
              "Unique identifier for this subtask (e.g., task-1, task-2) within the current decomposition.",
          },
          dependsOn: {
            type: "array",
            items: { type: "string" },
            description:
              "An array of IDs of subtasks from the current decomposition pass that must be completed before this one can start. Optional.",
          },
          isCritical: {
            type: "boolean",
            default: false,
            description:
              "Indicates if the failure of this subtask should be considered critical, potentially halting further non-dependent execution. Default to false.",
          },
        },
        required: [
          "description",
          "rationale",
          "explanation",
          "requiresFurtherDecomposition",
          "subtaskType",
          "id",
        ], // isCritical is optional due to default
        additionalProperties: false,
      },
    },
    reasoning: {
      type: "string",
      description:
        "Explanation of what you are doing, and what you focused on in the decomposition process",
    },
  },
  required: ["subtasks", "reasoning"],
  additionalProperties: false,
};

/**
 * Decomposes a task into logical subtasks based on the input from the discovery layer
 * @param workflowContext - The shared context object for the workflow.
 * @param registry - The package registry
 * @returns - The decomposed task with subtasks
 */
async function decomposeTask(workflowContext: WorkflowContext, registry: Registry) {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const chatService = registry.requireFirstServiceByType(ChatService);

  const request = workflowContext.sharedData.discovery; // Get request from context
  const breadth = workflowContext.options.breadth || 5; // Get breadth from context options

  return await flow("task-decomposition", async () => {
    chatService.systemLine(
      "[TaskDecomposer] Decomposing task into logical subtasks...",
    );

    const prompt = `You are a task decomposer. Your job is to analyze the chat stream above, decompose the task into logical subtasks, and provide a detailed explanation of the decomposition approach and the tasks that you have decomposed the task into.
- Decompose the task into up to ${breadth} **logical subtasks**.
- For each subtask:
    - Assign a unique \`id\` (e.g., "task-1", "task-2", ...).
    - Assign a \`subtaskType\` as one of: 'planning', 'execution', or 'research'.
    - If the subtask depends on other subtasks *in the current list you are generating*, list their \`id\`s in the \`dependsOn\` array. Otherwise, \`dependsOn\` can be an empty array or omitted.
    - Determine if the subtask is \`isCritical\`. A task is critical if its failure would render the overall goal unachievable or significantly hindered, even if other tasks succeed. Most tasks should default to \`false\`. Only mark a task as \`true\` if it's a central point of failure.
- Subtasks should represent **planning or design steps**, not direct execution. Consider if the subtask's primary goal is to strategize, design, or generate plans/documents ('planning'), to perform direct actions or use tools ('execution'), or to gather information ('research').
- Each subtask should cover a distinct aspect of the parent goal.
- Do NOT include vague tasks like "Improve performance" or "Fix bugs" unless scoped.
- Do NOT assign tasks that require direct coding or execution — this happens at the next level, unless the subtaskType is 'execution' and it's a very high-level execution step.
- Do NOT repeat subtasks or include overly broad ones like "Plan everything."
- Subtasks should be **mutually exclusive** and **collectively cover** the parent task.
- Keep each subtask **completable within a few hours of planning or coordination**.
- Maintain clarity. Each description should begin with a **verb** (e.g., "Define", "Outline", "Identify", "Specify", "Determine").
`;

    const client = await modelRegistry.chat.getFirstOnlineClient('auto:reasoning>4');

    const newMessages = [
      ...request.messages,
      { role: "user", content: prompt },
    ];

    // Generate object using schema
    const [decomposition] = await client.generateObject(
      {
        ...request,
        messages: newMessages,
        schema: decompositionSchema,
        temperature: 0.2,
      },
      registry,
    );

    chatService.systemLine(
      `[TaskDecomposer] Task decomposed into ${decomposition.subtasks.length} subtasks`,
    );

    // Add the decomposition to the request
    return {
      request,
      decomposition,
    };
  });
}

export default class DecomposeRunnable extends Runnable {
  async *invoke(context: DecomposeContext, { registry }: { registry: any }) {
    const wfCtx: WorkflowContext = {
      sharedData: { discovery: context.request },
      options: { breadth: context.options?.breadth || 5 },
    };
    const plan = await decomposeTask(wfCtx, registry);
    context.plan = plan;
    yield {
      type: "log",
      level: "info",
      message: "Decomposition complete",
      timestamp: Date.now(),
      runnableName: this.name,
    };
    return context;
  }
}