import { AgentCommandService } from "@tokenring-ai/agent";
import type { TokenRingPlugin } from "@tokenring-ai/app";
import { RpcService } from "@tokenring-ai/rpc";
import { z } from "zod";
import agentCommands from "./commands.ts";
import packageJSON from "./package.json" with { type: "json" };
import workflowRPC from "./rpc/workflow";
import { WorkflowServiceConfigSchema } from "./schema.ts";
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
    app.waitForService(AgentCommandService, agentCommandService => agentCommandService.addAgentCommands(agentCommands));
    app.addService(new WorkflowService(app));

    app.waitForService(RpcService, rpcService => {
      rpcService.registerEndpoint(workflowRPC);
    });
  },

  reconfigure(app, config) {
    app.requireService(WorkflowService).reconfigure(config.workflows);
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
