import {Agent, AgentManager} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import {z} from "zod";
import {type ParsedWorkflowConfig, WorkflowItemSchema} from "./schema.ts";

export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;

export default class WorkflowService implements TokenRingService {
  readonly name = "WorkflowService";
  description = "Manages multi-step agent workflows";

  constructor(private app: TokenRingApp, private config: ParsedWorkflowConfig) {
    this.app = app;
  }

  async reconfigure(newConfig: ParsedWorkflowConfig): Promise<void> {
    this.config = newConfig;
  }

  getWorkflow(name: string): WorkflowItem | undefined {
    if (Object.hasOwn(this.config, name)) {
      return this.config[name];
    }
  }

  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }> {
    return Object.entries(this.config).map(([key, workflow]) => ({
      key,
      workflow,
    }));
  }

  async spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Promise<Agent> {
    const agentManager = this.app.requireService(AgentManager);

    const workflow = this.getWorkflow(workflowName);
    if (!workflow) {
      throw new Error(`Workflow "${workflowName}" not found.`);
    }

    const agent = await agentManager.spawnAgent({
      agentType: workflow.agentType,
      headless,
    });
    agent.handleInput({
      from: `Workflow ${workflowName}`,
      message: `/workflow run ${workflowName}`
    });

    return agent;
  }
}
