import TokenRingApp from "@tokenring-ai/app";
import {TokenRingService} from "@tokenring-ai/app/types";
import {z} from "zod";

export const WorkflowItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  agentType: z.string(),
  steps: z.array(z.string()),
});

export type WorkflowItem = z.infer<typeof WorkflowItemSchema>;

export default class WorkflowService implements TokenRingService {
  name = "WorkflowService";
  description = "Manages multi-step agent workflows";
  
  private app: TokenRingApp;
  private workflows: Map<string, WorkflowItem>;

  constructor(app: TokenRingApp, workflows: Record<string, WorkflowItem>) {
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
}
