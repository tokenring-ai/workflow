import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import { z } from 'zod';
import { flow } from "../../../flow.js";
import { Runnable } from "../../../../runnable/runnable.js";

/**
 * JSON Schema for execution response, compatible with OpenAI function calling
 */

const executionResponseSchema = z.object({
 result: z.string().describe("The detailed result of executing the subtask."),
 detailedSummary: z.string().describe("A detailed summary of the execution steps and findings."),
 success: z.boolean().describe("Whether the execution was successful."),
 error: z.string().optional().describe("Any error message if the execution failed. Null if successful."),
 nextSteps: z.array(z.string()).optional().describe("Recommended next steps, if any."),
 artifacts: z.array(z.object({
  name: z.string().describe("Name of the artifact."),
  type: z.string().describe("Type of the artifact (e.g., 'code', 'document', 'diagram')."),
  content: z.string().describe("Content of the artifact.")
 })).optional().describe("Any artifacts produced during execution."),
 toolInvocations: z.array(z.object({
  toolName: z.string().describe("Name of the tool invoked."),
  arguments: z.record(z.any()).describe("Arguments passed to the tool."),
  result: z.string().optional().describe("Result from the tool invocation."),
  error: z.string().optional().describe("Error from the tool invocation, if any.")
 })).optional().describe("Details of any tools invoked during execution.")
}).strict();

/**
 * Executes a subtask from the decomposition layer
 * @param {Object} params - The parameters object.
 * @param {Object} params.workflowContext - The shared context object for the workflow.
 * @param {Object} params.subtask - The subtask to execute.
 * @param {TokenRingRegistry} registry - The package registry.
 * @returns {Promise<Object>} - The execution result.
 */
async function executeSubtask({ workflowContext, subtask, registry }) {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const chatService = registry.requireFirstServiceByType(ChatService);

  const request = workflowContext.sharedData.discovery; // Get request from context

  return await flow('subtask-execution', async () => {
    chatService.systemLine(`[TaskExecutor] Executing subtask: ${subtask.description}...`);

    let typeSpecificGuidance = "";
    if (subtask.subtaskType === 'planning') {
      typeSpecificGuidance = "Given this is a 'planning' task, your primary output should be a well-structured document, plan, or detailed analysis in the 'result' field or as an artifact. Focus on strategy, design, and generating comprehensive plans.";
    } else if (subtask.subtaskType === 'research') {
      typeSpecificGuidance = "Given this is a 'research' task, your primary output should be a summary of findings, data, or analysis in the 'result' field or as an artifact. Focus on information gathering and synthesizing data.";
    } else if (subtask.subtaskType === 'execution') {
      typeSpecificGuidance = "Given this is an 'execution' task, direct tool usage, concrete actions, and tangible outcomes are expected. Ensure your 'result' field reflects the outcome of these actions.";
    }

    const prompt = `You are a task executor. Your job is to execute the following subtask based on the chat context.

You are about to execute a subtask of type: **${subtask.subtaskType || 'not specified'}**.
${typeSpecificGuidance}

SUBTASK TO EXECUTE:
Description: ${subtask.description}
Rationale: ${subtask.rationale}
Explanation: ${subtask.explanation}

TOOL USAGE PROTOCOL:
1. Analyze the subtask and determine if any tools are necessary to fulfill the request.
2. If a tool is needed: Respond *only* with a JSON object matching the following tool_call schema:
   \`\`\`json
   {"tool_name": "your_tool_name", "tool_args": {"arg1": "value1", ...}, "reasoning": "why you need this tool and what you'll do with the result"}
   \`\`\`
   IMPORTANT: After outputting a tool_call JSON, STOP and wait for the tool result. Do NOT generate the final response schema yet. The environment will execute the tool and provide you with its output in a subsequent message.
3. If no tools are needed, OR if you have received all necessary tool results (which will be provided to you):
   Then, and only then, provide your final response as a JSON object strictly adhering to the executionResponseSchema provided below.
   Ensure the \`toolInvocations\` array in your final response accurately summarizes any tools you requested and their outcomes, based on the information provided to you.

EXECUTION INSTRUCTIONS:
- Analyze the subtask carefully to understand what needs to be done, keeping its type and the TOOL USAGE PROTOCOL in mind.
- If you determine tool usage is necessary, follow the TOOL USAGE PROTOCOL step 2.
- If no tools are needed, or after receiving tool results, proceed to generate the final response following TOOL USAGE PROTOCOL step 3.
- Provide a detailed result explaining what you did and what you found.
- Indicate whether the execution was successful and suggest any next steps if applicable.
- Populate the \`toolInvocations\` field in your final JSON response with a record of tools used, their arguments, and a summary of their results.

FINAL RESPONSE SCHEMA:
\`\`\`json
${JSON.stringify(executionResponseSchema, null, 2)}
\`\`\`
`;

  const client = await modelRegistry.getFirstOnlineClient('gpt-4.1-mini');

  const newMessages = [...request.messages, { role: 'user', content: prompt }];

  // Generate object using schema
  const [response] = await client.streamChat({
   ...request,
   messages: newMessages,
   schema: executionResponseSchema, /* tool calls + schema doesn't work */
   temperature: 0.2
  }, registry);

  chatService.systemLine(`[TaskExecutor] Subtask completed`);

  // Assuming response.content contains the structured data when schema is used
  const structuredResult = typeof response.content === 'string' ? JSON.parse(response.content) : response.content;

  // Validate the structuredResult against the schema if possible (optional, depends on Zod usage)
  // For now, we'll assume the model returns data compliant with the schema.

  // Return the execution result along with the original request (from context) and subtask
  return {
   request: workflowContext.sharedData.discovery, // Pass along the discovery context
   response: structuredResult, // Replace original response with the structured result
   subtask,
  };
 });
}

export default class ExecuteRunnable extends Runnable {
  async *invoke(context, { serviceRegistry }) {
    const results = [];
    for (const subtask of context.plan.decomposition.subtasks) {
      const wfCtx = { sharedData: { discovery: context.request } };
      const res = await executeSubtask({ workflowContext: wfCtx, subtask, registry: serviceRegistry });
      results.push(res);
    }
    context.executionResults = results;
    yield { type: 'log', level: 'info', message: 'Execution complete', timestamp: Date.now(), runnableName: this.name };
    return context;
  }
}