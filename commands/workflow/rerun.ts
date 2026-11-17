import { CommandFailedError } from "@tokenring-ai/agent/AgentError";
import type { AgentCommandInputSchema, AgentCommandInputType, TokenRingAgentCommand } from "@tokenring-ai/agent/types";
import { isRunFinished } from "../../state/workflowState.ts";
import WorkflowService from "../../WorkflowService.ts";

const inputSchema = {
  args: {},
  positionals: [{ name: "runId", description: "Id of a finished (e.g. interrupted) run", required: true }],
} as const satisfies AgentCommandInputSchema;

async function execute({ args: { runId }, agent }: AgentCommandInputType<typeof inputSchema>): Promise<string> {
  const workflowService = agent.requireService(WorkflowService);
  const run = workflowService.getRuns().find(candidate => candidate.id === runId);
  if (!run) throw new CommandFailedError(`No workflow run has id "${runId}".`);
  if (!isRunFinished(run.status)) throw new CommandFailedError(`Run ${run.id} is still ${run.status}.`);

  const started = await workflowService.rerunRun(run.id, { startedBy: agent });
  return `Started workflow ${run.displayName || run.workflowName} again as run ${started.runId} on agent ${started.agent.id}.`;
}

export default {
  name: "workflow rerun",
  description: "Run a finished or interrupted workflow run again",
  help: `Run a finished workflow run's workflow again, as a new run linked to the old one.

Runs interrupted by an application restart are never re-run automatically; use this (or Run again in
the Workflows app) to start them again. The workflow runs as it is defined now.

## Example

/workflow rerun 6f1c2e18-1e11-4b57-9e01-3f0b0b6c9f21`,
  inputSchema,
  execute,
} satisfies TokenRingAgentCommand<typeof inputSchema>;
