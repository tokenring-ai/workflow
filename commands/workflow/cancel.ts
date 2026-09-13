import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { isRunFinished } from "../../state/workflowState.ts";
import WorkflowService from "../../WorkflowService.ts";

const inputSchema = {
  args: {},
  positionals: [{ name: "runIdOrWorkflowName", description: "Run id, or the name of a running workflow", required: true }],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { runIdOrWorkflowName }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const workflowService = agent.requireService(WorkflowService);

  // A run id matches exactly; otherwise treat the argument as a workflow name and
  // cancel its most recent in-flight run.
  const run =
    workflowService.getRuns().find(candidate => candidate.id === runIdOrWorkflowName) ??
    workflowService
      .getRuns()
      .filter(candidate => candidate.workflowName === runIdOrWorkflowName && !isRunFinished(candidate.status))
      .sort((a, b) => b.startedAt - a.startedAt)[0];

  if (!run) throw new CommandFailedError(`No in-flight run matches "${runIdOrWorkflowName}".`);
  if (isRunFinished(run.status)) throw new CommandFailedError(`Run ${run.id} already ${run.status}.`);
  if (!workflowService.cancelRun(run.id)) throw new CommandFailedError(`Run ${run.id} could not be cancelled.`);

  return `Cancelled workflow run ${run.id} (${run.displayName || run.workflowName}).`;
}

export default {
  name: "workflow cancel",
  description: "Cancel an in-flight workflow run by run id or workflow name",
  help: `Cancel an in-flight workflow run.

The run's agent is terminated and the run is recorded as cancelled.

## Examples

/workflow cancel 6f1c2e18-1e11-4b57-9e01-3f0b0b6c9f21
/workflow cancel bugHunter`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
