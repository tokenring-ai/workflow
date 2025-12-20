import {AgentCommandService} from "@tokenring-ai/agent";
import { z } from "zod";
import TokenRingApp from "@tokenring-ai/app";
import chatCommands from "./chatCommands.ts";
import {WorkflowConfigSchema} from "./index.ts";
import WorkflowService from "./WorkflowService";
import workflowRPC from "./rpc/workflow";
import { WorkflowItemSchema } from "./WorkflowService";
import { WebHostService } from "@tokenring-ai/web-host";
import JsonRpcResource from "@tokenring-ai/web-host/JsonRpcResource";
import { TokenRingPlugin } from "@tokenring-ai/app";
import packageJSON from "./package.json" with {type: "json"};

interface WorkflowConfig {
  workflows: Record<string, z.infer<typeof WorkflowItemSchema>>;
}

export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    const config = app.getConfigSlice('workflows', WorkflowConfigSchema);
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    const workflowService = new WorkflowService(app, config);
    app.addServices(workflowService);

    app.waitForService(WebHostService, webHostService => {
      webHostService.registerResource("Workflow RPC endpoint", new JsonRpcResource(app, workflowRPC));
    });
  }
} satisfies TokenRingPlugin;