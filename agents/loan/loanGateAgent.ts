import { z } from "zod";
import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import { Registry } from "@token-ring/registry";


const loanDecisionSchema = z.object({
  is_client_accepted: z
    .boolean()
    .describe(
      "Whether the client's loan application is accepted for further processing.",
    ),
  denial_reason: z
    .string()
    .optional()
    .describe(
      "If client is rejected (is_client_accepted is false), provide a clear reason for the denial.",
    ),
});

type LoanDecision = z.infer<typeof loanDecisionSchema>;

interface LoanApplicationInput {
  loan_amount: number;
  monthly_income: number;
  loan_time_in_months?: number;
  name?: string;
  [key: string]: any; // Allow for additional properties
}

const systemPrompt =
  "You are a loan specialist. Based on the provided JSON data containing client's loan application details and income, your job is to decide if the client can be further processed. For example, a simple rule might be: if loan_amount / loan_time_in_months > 0.3 * monthly_income, then reject. Be judicious.";

/**
 * Agent to decide if a loan application should proceed.
 * @param input - Expected to be the output of extractApplicationDetailsAgent.
 * @param workflowContext - Shared workflow context.
 * @param registry - Service registry.
 * @param agentConfig - Agent-specific configuration (not used in this agent).
 * @returns The loan decision.
 */
async function process(
  input: LoanApplicationInput, 
  workflowContext: Record<string, any>, 
  registry: Registry, 
  agentConfig: Record<string, any> = {}
): Promise<LoanDecision> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);

  chatService.systemLine("[LoanGateAgent] Starting loan decision process...");

  if (
    !input ||
    typeof input.loan_amount !== "number" ||
    typeof input.monthly_income !== "number"
  ) {
    throw new Error(
      "Input must be an object with loan_amount and monthly_income numbers.",
    );
  }

  const client = await modelRegistry.getFirstOnlineClient({
    tags: ["loan", "decision"],
  }); // Example tags

  try {
    // The input for this agent is the JSON object from the previous agent
    const messages = [{ role: "user", content: JSON.stringify(input) }];

    const generated = await client.generateObject(
      {
        messages,
        schema: loanDecisionSchema,
        prompt: systemPrompt,
        temperature: 0.2,
      },
      registry,
    );

    const decision = generated.object as LoanDecision;

    if (!decision.is_client_accepted && !decision.denial_reason) {
      decision.denial_reason =
        "Client did not meet criteria (reason not explicitly stated by model).";
    }

    chatService.systemLine(
      `[LoanGateAgent] Decision made: ${JSON.stringify(decision)}`,
    );
    return decision;
  } catch (error) {
    const err = error as Error;
    chatService.errorLine(
      `[LoanGateAgent] Error during decision making: ${err.message}`,
    );
    console.error(error);
    throw error; // Re-throw
  }
}

export default process;