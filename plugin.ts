import {AgentCommandService} from "@tokenring-ai/agent";
import TokenRingApp from "@tokenring-ai/app";
import {TokenRingPlugin} from "@tokenring-ai/app";
import chatCommands from "./chatCommands.ts";
import {WorkflowConfigSchema} from "./index.ts";
import WorkflowService from "./WorkflowService.ts";
import packageJSON from './package.json' with {type: 'json'};


export default {
  name: packageJSON.name,
  version: packageJSON.version,
  description: packageJSON.description,
  install(app: TokenRingApp) {
    const config = app.getConfigSlice('workflows', WorkflowConfigSchema);
    app.waitForService(AgentCommandService, agentCommandService =>
      agentCommandService.addAgentCommands(chatCommands)
    );
    app.addServices(new WorkflowService(app, config));
  }
} satisfies TokenRingPlugin;
