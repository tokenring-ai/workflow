import { z } from "zod";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";


const individualEstimationSchema = z.object({
  role: z
    .string()
    .describe(
      "Role of the team member who provided the estimate (e.g., 'developer', 'qa').",
    ),
  taskId: z.string().describe("The ID of the task that was estimated."),
  task: z.string().describe("The description of the task."),
  estimate: z.number().describe("The estimated man-days for the task."),
  reasoning: z.string().describe("The reasoning behind the estimate."),
  status: z
    .string()
    .optional()
    .describe(
      "Status of the estimation (e.g., 'fulfilled', 'rejected'). Default to 'fulfilled' if successful.",
    ),
  error: z
    .string()
    .optional()
    .describe("Error message if this specific estimation failed."),
});

const scrumMasterReportSchema = z.object({
  summary_report: z
    .string()
    .describe(
      "A concise summary of all estimations, highlighting key points for the PM.",
    ),
  total_estimated_man_days: z
    .number()
    .describe("The sum total of all man-day estimates."),
  issues_highlighted: z
    .string()
    .optional()
    .describe(
      "Any potential issues, risks, or important notes compiled from the team's reasoning or the aggregation process.",
    ),
  individual_estimations: z
    .array(individualEstimationSchema)
    .describe("A list of all individual estimations received."),
});

type IndividualEstimation = z.infer<typeof individualEstimationSchema>;
type ScrumMasterReport = z.infer<typeof scrumMasterReportSchema>;

interface TaskDetail {
  taskId: string;
  role: string;
  taskDescription?: string;
  status: string;
  output?: {
    man_days_estimate?: number;
    reasoning?: string;
  };
  error?: string;
  reason?: string;
}

interface TechLeadTask {
  taskId: string;
  role: string;
  taskDescription: string;
}

interface AgentInput {
  originalRequest: {
    featureRequest: string;
  };
  orchestratorTasks: TechLeadTask[];
  workerExecutionDetails: TaskDetail[];
}

const systemPrompt =
  "You are a Scrum Master. You have received a feature request and effort estimations from the Developer, QA, and DevOps specialists (and potentially others). Your task is to summarize these estimations, calculate a total sum of man_days_estimate, highlight any potential issues or important reasoning points from the team, and prepare a concise report for the PM. Ensure all provided estimations are included in the 'individual_estimations' array of your report.";

/**
 * Scrum Master agent to aggregate task estimations and prepare a report.
 * @param input - Expected to be { originalRequest: { featureRequest: "..." },
 *                                orchestratorTasks: [/...tech lead output.../],
 *                                workerExecutionDetails: [/...results from estimation agents.../] }.
 * @param workflowContext - Shared workflow context.
 * @param registry - Service registry.
 * @param agentConfig - Agent-specific configuration (not used in this agent).
 * @returns The scrum master's report.
 */
async function process(
  input: AgentInput, 
  workflowContext: Record<string, any>, 
  registry: Registry, 
  agentConfig: Record<string, any> = {}
): Promise<ScrumMasterReport> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine(
    "[ScrumMasterAgent] Starting aggregation of estimations...",
  );

  if (
    !input ||
    !input.originalRequest ||
    !input.workerExecutionDetails ||
    !input.orchestratorTasks
  ) {
    throw new Error(
      "Input must be an object with originalRequest, orchestratorTasks, and workerExecutionDetails.",
    );
  }

  let totalManDays = 0;
  const formattedEstimations: IndividualEstimation[] = input.workerExecutionDetails.map((detail) => {
    const originalTask = input.orchestratorTasks.find(
      (t) => t.taskId === detail.taskId,
    );
    let estimate = 0;
    let reasoning: string;
    let taskDescription =
      originalTask?.taskDescription || detail.taskDescription || "Unknown task";

    if (detail.status === "fulfilled" && detail.output) {
      estimate = detail.output.man_days_estimate || 0;
      reasoning = detail.output.reasoning || "No reasoning provided.";
      totalManDays += estimate;
    } else {
      reasoning = `Estimation failed or not provided. Error: ${detail.error || detail.reason || "Unknown error"}`;
    }
    return {
      role: detail.role,
      taskId: detail.taskId,
      task: taskDescription,
      estimate: estimate,
      reasoning: reasoning,
      status: detail.status,
      error: detail.error || detail.reason,
    };
  });

  const userMessageContent = `
Original Feature Request:
${input.originalRequest.featureRequest}

Task Breakdown (from Tech Lead):
${input.orchestratorTasks.map((task) => `- ${task.role} (ID: ${task.taskId}): ${task.taskDescription}`).join("\n")}

Individual Estimations from Team:
${formattedEstimations
  .map(
    (est) =>
      `- Role: ${est.role}, Task ID: ${est.taskId}\n  Task: ${est.task}\n  Status: ${est.status}\n  Estimate: ${est.estimate} man-days\n  Reasoning: ${est.reasoning}${est.error ? `\n  Error: ${est.error}` : ""}`,
  )
  .join("\n---\n")}

Please generate the summary report based on these details. Calculate the total_estimated_man_days by summing valid estimates.
The 'individual_estimations' field in your JSON output should be an array of objects, each containing: role, taskId, task, estimate, reasoning, status, and error (if any).
`;

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["reporting", "summary"],
  });

  try {
    const messages = [{ role: "user", content: userMessageContent }];

    const generated = await client.generateObject(
      {
        messages,
        schema: scrumMasterReportSchema,
        prompt: systemPrompt,
        temperature: 0.1,
      },
      registry,
    );

    let report = generated.object as ScrumMasterReport;

    // Ensure total_estimated_man_days is correctly summed if AI didn't do it or did it incorrectly.
    // The AI should ideally do this, but as a fallback:
    if (report.total_estimated_man_days !== totalManDays) {
      chatService.systemLine(
        `[ScrumMasterAgent] Adjusting total_estimated_man_days from ${report.total_estimated_man_days} to calculated ${totalManDays}.`,
      );
      report.total_estimated_man_days = totalManDays;
    }
    // Ensure all estimations are included, even if AI missed some
    if (report.individual_estimations?.length !== formattedEstimations.length) {
      chatService.systemLine(
        `[ScrumMasterAgent] AI missed some individual estimations in its report. Re-populating from source.`,
      );
      report.individual_estimations = formattedEstimations;
    }

    chatService.systemLine(
      `[ScrumMasterAgent] Successfully generated estimation report.`,
    );
    return report;
  } catch (error) {
    const err = error as Error;
    chatService.errorLine(
      `[ScrumMasterAgent] Error during report generation: ${err.message}`,
    );
    console.error(error);
    throw error;
  }
}

export default process;