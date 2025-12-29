import {AgentCommandService} from "@tokenring-ai/agent";
import {TokenRingPlugin} from "@tokenring-ai/app";
import {WebHostService} from "@tokenring-ai/web-host";
import JsonRpcResource from "@tokenring-ai/web-host/JsonRpcResource";
import {z} from "zod";
import chatCommands from "./chatCommands.ts";
import {WorkflowConfigSchema} from "./index.ts";
import packageJSON from "./package.json" with {type: "json"};
import workflowRPC from "./rpc/workflow";
import WorkflowService from "./WorkflowService";

const packageConfigSchema = z.object({
  workflows: WorkflowConfigSchema
});

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app, config) {
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    const workflowService = new WorkflowService(app, config.workflows);
    app.addServices(workflowService);

    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Workflow RPC endpoint", new JsonRpcResource(app, workflowRPC));
    });
  },
  config: packageConfigSchema
} satisfies TokenRingPlugin<typeof packageConfigSchema>;