import { type Agent, AgentManager } from "@tokenring-ai/agent";
import type TokenRingApp from "@tokenring-ai/app";
import type { TokenRingService } from "@tokenring-ai/app/types";
import KeyedRegistry from "@tokenring-ai/utility/registry/KeyedRegistry";
import type { z } from "zod";
import type { ParsedWorkflowConfig, WorkflowItemSchema } from "./schema.ts";

export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;

export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows";

  readonly workflows = new KeyedRegistry<WorkflowItem>();
  getWorkflow = this.workflows.get;
  listWorkflowEntries = this.workflows.entriesArray;

  constructor(
    private app: TokenRingApp,
    private config: ParsedWorkflowConfig,
  ) {
    this.workflows.setAll(config);
  }

  reconfigure(newConfig: ParsedWorkflowConfig): void {
    this.config = newConfig;
  }

  spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Agent {
    const agentManager = this.app.requireService(AgentManager);

    const workflow = this.getWorkflow(workflowName);
    if (!workflow) {
      throw new Error(`Workflow "${workflowName}" not found.`);
    }

    const agent = agentManager.spawnAgent({
      agentType: workflow.agentType,
      headless,
    });
    agent.handleInput({
      from: `Workflow ${workflowName}`,
      message: `/workflow run ${workflowName}`,
    });

    return agent;
  }
}
