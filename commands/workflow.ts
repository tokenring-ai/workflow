import type {TokenRingAgentCommand} from "@tokenring-ai/agent/types";
import createSubcommandRouter from "@tokenring-ai/agent/util/subcommandRouter";
import list from "./workflow/list.js";
import run from "./workflow/run.js";
import spawn from "./workflow/spawn.js";

const description = "/workflow - Manage and run workflows" as const;

const execute = createSubcommandRouter({
  list,
  run,
  spawn
});

const help: string = `# /workflow

## Description
Run multi-step workflows on the current agent.

## Usage
/workflow list             - List available workflows
/workflow run <name>       - Run a workflow by name on current agent
/workflow spawn <name>     - Spawn new agent and run workflow

## Example
/workflow run myWorkflow
/workflow spawn myWorkflow`;

export default {
  description,
  execute,
  help,
} satisfies TokenRingAgentCommand;
