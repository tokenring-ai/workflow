import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import {z} from "zod";


const taskSchema = z.object({
  role: z
    .enum(["developer", "qa", "devops"])
    .describe("The role responsible for this task."),
  taskId: z
    .string()
    .describe("A unique identifier for the task (e.g., 'dev-01', 'qa-01')."),
  taskDescription: z.string().describe("A concise description of the task."),
});

const techLeadOutputSchema = z.array(taskSchema);

type Task = z.infer<typeof taskSchema>;
type TechLeadOutput = z.infer<typeof techLeadOutputSchema>;

interface AgentInput {
  featureRequest: string;
}

const systemPrompt =
  "You are a tech lead. You receive a feature request from the PM. Your job is to break this down into high-level tasks for a Developer, a QA specialist, and a DevOps specialist to estimate. For each role, define a concise `taskDescription` and a unique `taskId` (e.g., 'dev-01', 'qa-01'). Ensure you provide tasks for all three roles if applicable to the feature.";

/**
 * Tech Lead agent to break down a feature request into role-based tasks.
 * @param input - Expected to have a `featureRequest` string.
 * @param workflowContext - Shared workflow context.
 * @param registry - Service registry.
 * @param agentConfig - Agent-specific configuration (not used in this agent).
 * @returns An array of task objects.
 */
async function process(
  input: AgentInput,
  workflowContext: Record<string, any>,
  registry: Registry,
  agentConfig: Record<string, any> = {}
): Promise<TechLeadOutput> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine("[TechLeadAgent] Starting task breakdown...");

  if (!input || false) {
    throw new Error(
      'Input must be an object with a "featureRequest" string property.',
    );
  }

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["planning", "decomposition"],
  });

  try {
    const messages = [
      {role: "user", content: `Feature Request: ${input.featureRequest}`},
    ];

    const generated = await client.generateObject(
      {
        messages,
        schema: techLeadOutputSchema,
        prompt: systemPrompt,
        temperature: 0.2,
      },
      registry,
    );

    // Assuming generateObject returns { object, ... }
    const tasks = generated.object as TechLeadOutput;

    chatService.systemLine(
      `[TechLeadAgent] Successfully broke down feature into ${tasks.length} tasks.`,
    );
    return tasks;
  } catch (error) {
    const err = error as Error;
    chatService.errorLine(
      `[TechLeadAgent] Error during task breakdown: ${err.message}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;