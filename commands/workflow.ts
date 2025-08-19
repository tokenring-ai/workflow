import ChatService from "@token-ring/chat/ChatService";
import {Registry} from "@token-ring/registry";
import WorkflowService from "../WorkflowService.js";

/**
 * /workflow [action] [args...] - Run and manage workflows
 *
 * Actions:
 * - list: List all available workflows
 * - run <name> [args]: Run a workflow with optional arguments
 * - debug [on|off]: Toggle workflow debug mode
 */

export const description: string =
  "/workflow [action] [args...] - Run and manage workflows (list, run, debug).";

/**
 * Returns help information for the workflow command
 */
// noinspection JSUnusedGlobalSymbols
export function help(): Array<string> {
  return [
    "/workflow [action] [args...] - Run and manage workflows",
    "  Actions:",
    "    list                    - List all available workflows",
    "    run <name> [args...]    - Run a workflow with optional arguments",
    "    debug [on|off]          - Toggle or show workflow debug mode",
    "",
    "  Examples:",
    "    /workflow list                    - Show available workflows",
    "    /workflow run myWorkflow arg1     - Run workflow with arguments",
    "    /workflow debug on                - Enable debug mode",
    "    /workflow debug                   - Show current debug status",
  ];
}

export async function execute(remainder: string, registry: Registry): Promise<void> {
  const chatService = registry.requireFirstServiceByType(ChatService);
  const workflowService = registry.requireFirstServiceByType(WorkflowService);

  const args = remainder ? remainder.trim().split(/\s+/) : [];
  const action = args[0];
  const actionArgs = args.slice(1);

  switch (action) {
    case "list":
      await handleListCommand(chatService, workflowService);
      break;

    case "run":
      await handleRunCommand(actionArgs, chatService, workflowService, registry);
      break;

    case "debug":
      await handleDebugCommand(actionArgs, chatService, workflowService);
      break;

    default:
      const helpLines = help();
      helpLines.forEach(line => chatService.systemLine(line));
      break;
  }
}

async function handleListCommand(
  chatService: ChatService,
  workflowService: WorkflowService
): Promise<void> {
  const workflows = workflowService.listWorkflows();

  if (workflows.length === 0) {
    chatService.systemLine("No workflows registered.");
    return;
  }

  chatService.systemLine("Available workflows:");
  workflows.forEach((workflow) => {
    const description = workflow.description || "No description";
    chatService.systemLine(`  - ${workflow.name}: ${description}`);
  });
}

async function handleRunCommand(
  args: string[],
  chatService: ChatService,
  workflowService: WorkflowService,
  registry: Registry
): Promise<void> {
  if (args.length === 0) {
    chatService.errorLine("Missing workflow name. Usage: /workflow run <name> [args...]");
    return;
  }

  const workflowName = args[0];
  const workflowArgs = args.slice(1).join(" ");

  try {
    const workflow = workflowService.getWorkflow(workflowName);
    if (!workflow) {
      chatService.errorLine(`Workflow not found: ${workflowName}`);
      return;
    }

    // Parse arguments if needed
    let parsedArgs: any = workflowArgs;
    if (workflowArgs && (workflow as any).parseArgs) {
      try {
        parsedArgs = (workflow as any).parseArgs(workflowArgs);
      } catch (error: any) {
        chatService.errorLine(`Error parsing arguments: ${error.message}`);
        return;
      }
    }

    chatService.systemLine(`Running workflow: ${workflowName}`);
    await workflowService.run(workflow, parsedArgs, registry);
    chatService.systemLine(`Workflow ${workflowName} completed successfully`);
  } catch (error: any) {
    chatService.errorLine(`Error running workflow: ${error.message}`);
  }
}

async function handleDebugCommand(
  args: string[],
  chatService: ChatService,
  workflowService: WorkflowService
): Promise<void> {
  if (args.length === 0) {
    // Show current debug state when no arguments are provided
    const currentDebugState = workflowService.getDebug();
    chatService.systemLine(
      `Workflow debug mode is currently: ${currentDebugState ? "ON" : "OFF"}`,
    );
    chatService.systemLine("Usage: /workflow debug [on|off]");
    return;
  }

  const param = args[0].toLowerCase();

  if (param === "on") {
    workflowService.setDebug(true);
    chatService.systemLine("Workflow debug mode turned ON");
  } else if (param === "off") {
    workflowService.setDebug(false);
    chatService.systemLine("Workflow debug mode turned OFF");
  } else {
    chatService.errorLine(`Invalid option: '${param}'. Use 'on' or 'off'`);
    chatService.systemLine("Usage: /workflow debug [on|off]");
  }
}