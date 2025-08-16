import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import {z} from "zod";
import {flow} from "../../flow.js";
import WorkflowService from "../../WorkflowService.js";
import * as analyzePromptWorkflow from "../prompt-analyzer/analyze-prompt.js";

export const description =
  "Breaks down a natural language prompt into subtasks and then runs each subtask through the analyze-prompt workflow.";

// Step 2: Define Input Schema
export const inputSchema = z.object({
  prompt: z
    .string()
    .describe("The main user prompt to break down into subtasks"),
});

// Step 2: Define Output Schema
// The output will be an array, where each element is the result of running analyze-prompt on a subtask.
export const outputSchema = z
  .array(analyzePromptWorkflow.outputSchema)
  .describe("An array of analysis results for each subtask");

// Types from the schemas
export type TaskPlannerInput = z.infer<typeof inputSchema>;
export type TaskPlannerOutput = z.infer<typeof outputSchema>;

// Step 3a: Helper function to break down the main prompt into subtask prompts using an AI model
async function breakDownPromptIntoSubtasks(mainPrompt: string, registry: Registry): Promise<string[]> {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  // Using a 'plan' tag, assuming a model suitable for planning/decomposition tasks is available.
  // Adjust tag if necessary (e.g., 'reasoning' or a general-purpose one).
  const client = await modelRegistry.chat.getFirstOnlineClient('auto:reasoning>4');

  const subtaskSchema = z.object({
    subPrompts: z
      .array(z.string())
      .describe(
        "An array of sub-prompts derived from the main prompt, designed to be executed sequentially or in parallel if possible.",
      ),
  });

  const systemPromptForSubtasks = `You are an expert task planning assistant. Your role is to break down a user's complex request into a series of smaller, self-contained, and actionable sub-prompts. Each sub-prompt should be a clear instruction that can be individually processed by another AI model. The sub-prompts, when executed in sequence, should collectively fulfill the original request.

Return these sub-prompts as a JSON object with a single key "subPrompts" containing an array of strings.

Consider the following examples:

Example 1:
User Prompt: "Write a blog post about the benefits of remote work, covering productivity, work-life balance, and cost savings, and then summarize it into three bullet points."
Your Output: { "subPrompts": ["Write a comprehensive blog post discussing the benefits of remote work. Focus on aspects like increased productivity, improved work-life balance, and potential cost savings for both employees and employers.", "Read the provided blog post about remote work and generate a concise summary consisting of three distinct bullet points."] }

Example 2:
User Prompt: "Research the current stock price of AAPL and GOOG, then write a short comparison of these two stocks."
Your Output: { "subPrompts": ["Find the current stock price for Apple Inc. (AAPL).", "Find the current stock price for Alphabet Inc. (GOOG).", "Based on the previously obtained current stock prices for AAPL and GOOG, write a short comparative analysis highlighting key differences or similarities."] }

Example 3:
User Prompt: "Analyze the main themes in 'To Kill a Mockingbird', identify key characters related to these themes, and then draft an essay outline."
Your Output: { "subPrompts": ["Identify and list the main themes present in the novel 'To Kill a Mockingbird'.", "For each identified theme from 'To Kill a Mockingbird', list the key characters who are central to its development.", "Draft a structured essay outline that explores the main themes of 'To Kill a Mockingbird', incorporating the key characters associated with each theme."] }
`;

  const [result] = await client.generateObject(
    {
      messages: [
        {role: "system", content: systemPromptForSubtasks},
        {role: "user", content: mainPrompt},
      ],
      schema: subtaskSchema,
      temperature: 0.1, // Low temperature for more deterministic and structured breakdown
    },
    registry,
  );

  return result.subPrompts;
}

// Step 3: Implement execute Function
export async function execute(
  {prompt}: TaskPlannerInput,
  registry: Registry
): Promise<TaskPlannerOutput> {
  const workflowService = registry.requireFirstServiceByType(WorkflowService);
  const chatService = registry.requireFirstServiceByType(ChatService);

  chatService.systemLine(
    `[TaskPlanner] Starting to break down prompt: "${prompt}"`,
  );

  // Step 3a: Break down the prompt into subtasks
  const subtaskPrompts = await flow(
    "Break down main prompt into subtasks",
    () => breakDownPromptIntoSubtasks(prompt, registry),
  );

  if (!subtaskPrompts || subtaskPrompts.length === 0) {
    chatService.warningLine(
      "[TaskPlanner] No subtasks were generated from the prompt. The prompt might have been too simple or the AI could not determine subtasks.",
    );
    return []; // Return empty array if no subtasks are generated
  }

  chatService.systemLine(
    `[TaskPlanner] Generated ${subtaskPrompts.length} subtasks:`,
  );
  subtaskPrompts.forEach((subtask, index) => {
    chatService.systemLine(`  ${index + 1}. ${subtask}`);
  });

  const allSubtaskAnalysisResults: TaskPlannerOutput = [];

  // Step 3b & 4: Process each subtask using analyze-prompt workflow and collect results
  for (let i = 0; i < subtaskPrompts.length; i++) {
    const subtaskPrompt = subtaskPrompts[i];
    chatService.systemLine(
      `[TaskPlanner] Analyzing subtask ${i + 1}/${subtaskPrompts.length}: "${subtaskPrompt}"`,
    );

    try {
      const analysisResult = await flow(
        `Analyze subtask: ${subtaskPrompt.substring(0, 50)}...`,
        () =>
          workflowService.run(
            analyzePromptWorkflow,
            {prompt: subtaskPrompt},
            registry,
          ),
      ) as analyzePromptWorkflow.PromptAnalyzerOutput;

      allSubtaskAnalysisResults.push(analysisResult);
      chatService.systemLine(
        `[TaskPlanner] Finished analyzing subtask ${i + 1}/${subtaskPrompts.length}.`,
      );
    } catch (error: any) {
      chatService.errorLine(
        `[TaskPlanner] Error analyzing subtask ${i + 1}/${subtaskPrompts.length}: "${subtaskPrompt}". Error: ${error.message}`,
      );
      // Optionally, decide whether to continue with other subtasks or re-throw to stop execution
      // For now, we log the error and continue with other subtasks.
      // To stop, you could re-throw the error: throw error;
      // Or push an error object: allSubtaskAnalysisResults.push({ error: error.message, subtask: subtaskPrompt });
    }
  }

  chatService.systemLine(
    `[TaskPlanner] Finished processing all ${subtaskPrompts.length} subtasks.`,
  );
  // Step 5: Return aggregated results
  return allSubtaskAnalysisResults;
}