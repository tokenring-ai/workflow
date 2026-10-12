import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { ChatService } from "@tokenring-ai/chat";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with { type: "json" };
import workflowRPC from "./rpc/workflow";
import { WorkflowServiceConfigSchema } from "./schema.ts";
import tools from "./tools.ts";
import WorkflowService from "./WorkflowService";

const packageConfigSchema = z.object({
  workflows: WorkflowServiceConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Workflow Orchestration",
  version: packageJSON.version,
  description: packageJSON.description,
  install(app) {
    const workflowService = new WorkflowService(app);
    app.addService(WorkflowService, workflowService);
    // Restore persisted run history in the background; the UI streams whatever is in state.
    void workflowService.loadRunHistory();

    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));

    app.waitForService(ChatService, chatService => chatService.addTools(tools));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(workflowRPC);
    });
  },

  reconfigure(app, config) {
    app.requireService(WorkflowService).reconfigure(config.workflows);
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
