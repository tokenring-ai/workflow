import {execute as runChat} from "@token-ring/ai-client/runChat";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import * as analyzePromptWorkflow from "../workflows/prompt-analyzer/analyze-prompt.js";
import * as planTasksWorkflow from "../workflows/task-planner/plan-tasks.js";
import WorkflowService from "../WorkflowService.js";

/**
 * /analyze <option1=val1 option2=val2 ...> -- <prompt> - Analyze and execute prompts
 *
 * Analyzes prompts for complexity and either executes them directly or breaks them
 * into subtasks for complex requests.
 */

export const description: string =
  "/analyze <option1=val1 option2=val2 ...> -- <prompt> - Analyze and execute prompts";

interface AnalysisResult {
  isExceptionallyComplex: boolean;
  input: Array<{ role: string; content?: string }>;
  temperature?: number;
  top_p?: number;
  model?: string;
  error?: string;
}

interface SubTaskAnalysis {
  input: Array<{ role: string; content?: string }>;
  temperature?: number;
  top_p?: number;
  model?: string;
  error?: string;
}

interface Options {
  [key: string]: string;
}

/**
 * Returns help information for the analyze command
 */
export function help(): Array<string> {
  return [
    "/analyze <option1=val1 option2=val2 ...> -- <prompt> - Analyze and execute prompts",
    "  Options:",
    "    model=<name>       - The model to use for analysis",
    "    rewrite=<bool>     - Whether to rewrite input (true/false)",
    "    plan=<bool>        - Whether to generate task plan (true/false)",
    "    fewshot=<bool>     - Whether to use few-shot prompting (true/false)",
    "",
    "  Examples:",
    "    /analyze -- Create a React component",
    "    /analyze model=gpt-4 -- Build a complex application",
    "    /analyze plan=true -- Design and implement a system",
  ];
}

export async function execute(remainder: string, registry: Registry): Promise<any> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const workFlowService = registry.requireFirstServiceByType(WorkflowService);

  if (!remainder || !remainder.trim()) {
    const helpLines = help();
    helpLines.forEach(line => chatService.systemLine(line));
    return;
  }

  // Split options and prompt
  const [optionsPart, ...promptParts] = remainder.split("--");
  const prompt = promptParts.join("--").trim();
  const optionsString = optionsPart.trim();

  if (!prompt) {
    const helpLines = help();
    helpLines.forEach(line => chatService.systemLine(line));
    return;
  }

  // Parse options
  const options: Options = {};
  if (optionsString) {
    for (const opt of optionsString.split(" ")) {
      if (opt.includes("=")) {
        const [key, value] = opt.split("=");
        options[key.trim()] = value.trim();
      }
    }
  }

  const analysisResult = await workFlowService.run(
    analyzePromptWorkflow,
    {prompt},
    registry,
  ) as AnalysisResult;

  if (analysisResult.isExceptionallyComplex) {
    chatService.systemLine(
      "[AnalyzeCommand] Task is exceptionally complex. Running task planner...",
    );
    const subTaskAnalyses = await workFlowService.run(
      planTasksWorkflow,
      {prompt},
      registry,
    ) as SubTaskAnalysis[];

    if (!subTaskAnalyses || subTaskAnalyses.length === 0) {
      chatService.warningLine(
        "[AnalyzeCommand] Task planner did not return any subtasks. Nothing to execute.",
      );
      return;
    }

    chatService.systemLine(
      `[AnalyzeCommand] Task planner generated ${subTaskAnalyses.length} subtasks. Executing them sequentially...`,
    );
    let lastSubTaskResult;
    for (let i = 0; i < subTaskAnalyses.length; i++) {
      const subTask = subTaskAnalyses[i];
      // Check if subTask itself might indicate an error from the planning/analysis stage for that subtask
      if (subTask.error) {
        chatService.errorLine(
          `[AnalyzeCommand] Skipping subtask ${i + 1} due to error during its planning/analysis: ${subTask.error}`,
        );
        continue;
      }

      const userMessage = subTask.input.find((m) => m.role === "user");
      const userContent = userMessage?.content;
      const summaryContent = userContent ? userContent.substring(0, 100) : "User prompt not found";

      chatService.systemLine(
        `[AnalyzeCommand] Executing subtask ${i + 1}/${subTaskAnalyses.length}: ${summaryContent}...`,
      );
      lastSubTaskResult = await runChat(
        {
          input: subTask.input.map(m => ({role: m.role, content: m.content ?? ""})) as any,
          systemPrompt: chatService.getInstructions(),
          model: subTask.model!,
        },
        registry,
      );
    }
    chatService.systemLine("[AnalyzeCommand] Finished executing all subtasks.");
    return lastSubTaskResult; // Return the result of the last subtask execution
  } else {
    chatService.systemLine(
      "[AnalyzeCommand] Task is not exceptionally complex. Running directly...",
    );
    return runChat(
      {
        input: analysisResult.input.map(m => ({role: m.role, content: m.content ?? ""})) as any,
        systemPrompt: chatService.getInstructions(),
        model: analysisResult.model!,
      },
      registry,
    );
  }
}