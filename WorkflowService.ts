import {Agent, AgentManager} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import {z} from "zod";
import {type ParsedWorkflowConfig, WorkflowItemSchema} from "./schema.ts";

export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;

export default class WorkflowService implements TokenRingService {
  name = "WorkflowService";
  description = "Manages multi-step agent workflows";
  workflows: Map<string, WorkflowItem>;

  constructor(private app: TokenRingApp, workflows: ParsedWorkflowConfig) {
    this.app = app;
    this.workflows = new Map(
      Object.entries(workflows).map(([key, workflow]) => [
        key,
        WorkflowItemSchema.parse(workflow)
      ])
    );
  }

  async run(): Promise<void> {
    this.app.serviceOutput(`[WorkflowService] Loaded ${this.workflows.size} workflows`);
  }

  getWorkflow(name: string): WorkflowItem | undefined {
    return this.workflows.get(name);
  }

  listWorkflows(): Array<{ key: string; workflow: WorkflowItem }> {
    return Array.from(this.workflows.entries()).map(([key, workflow]) => ({
      key,
      workflow,
    }));
  }

  async spawnWorkflow(workflowName: string, { headless }: { headless: boolean }): Promise<Agent> {
    const agentManager = this.app.requireService(AgentManager);

    const workflow = this.getWorkflow(workflowName);
    if (!workflow) {
      throw new Error(`Workflow "${workflowName}" not found`);
    }

    const agent = await agentManager.spawnAgent({
      agentType: workflow.agentType,
      headless,
    });
    agent.handleInput({message: `/workflow run ${workflowName}`});

    return agent;
  }
}
