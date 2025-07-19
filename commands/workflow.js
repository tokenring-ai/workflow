import ChatService from "@token-ring/chat/ChatService";
import WorkflowService from "../WorkflowService.js";

export const description =
	"/workflow <subcommand> [args] - Run a workflow with optional arguments";

export async function execute(remainder, registry) {
	const chatService = registry.requireFirstServiceByType(ChatService);
	const workflowService = registry.requireFirstServiceByType(WorkflowService);

	if (!remainder) {
		// No arguments provided, show help
		this.help(chatService);
		return;
	}

	const [, subcommand, extra] = remainder.match(/^ *([a-z]*) (.*)/);

	switch (subcommand) {
		case "list":
			await handleListCommand(chatService);
			break;
		case "run":
			await handleRunCommand(extra, chatService, workflowService);
			break;
		case "debug":
			await handleDebugCommand(extra, chatService, workflowService);
			break;
		default:
			chatService.errorLine(`Unknown subcommand: '${subcommand}'`);
			this.help(chatService);
	}
}

export function help() {
	return [
		"/workflow [list|run|debug] [args...]",
		"  - With no arguments: shows command help",
		"  - list: List all available workflows",
		"  - run <name> [args]: Run a workflow with optional arguments",
		"  - debug [on|off]: Toggle workflow debug mode",
	];
}
async function handleListCommand(chatService, workflowService) {
	const workflows = workflowService.listWorkflows();

	if (workflows.length === 0) {
		chatService.systemLine("No workflows registered.");
		return;
	}

	chatService.systemLine("Available workflows:");
	workflows.forEach((workflow) => {
		const description = workflow.description || "No description";
		chatService.systemLine(`- ${workflow.name}: ${description}`);
	});
}

async function handleRunCommand(args, chatService, workflowService) {
	if (!args) {
		chatService.errorLine(
			"Missing workflow name. Usage: /workflow run <name> [args]",
		);
		return;
	}

	// Split args into workflow name and actual arguments
	const parts = args.split(/\s+/);
	const workflowName = parts[0];
	const workflowArgs = parts.slice(1).join(" ");

	try {
		const workflow = workflowService.getWorkflow(workflowName);
		if (!workflow) {
			chatService.errorLine(`Workflow not found: ${workflowName}`);
			return;
		}

		// Parse arguments if needed
		let parsedArgs = workflowArgs;
		if (workflowArgs && workflow.parseArgs) {
			try {
				parsedArgs = workflow.parseArgs(workflowArgs);
			} catch (error) {
				chatService.errorLine(`Error parsing arguments: ${error.message}`);
				return;
			}
		}

		chatService.systemLine(`Running workflow: ${workflowName}`);
		await chatService.run(workflow, parsedArgs);
		chatService.systemLine(`Workflow ${workflowName} completed successfully`);
	} catch (error) {
		chatService.errorLine(`Error running workflow: ${error.message}`);
	}
}

async function handleDebugCommand(args, workflowService) {
	if (!args) {
		// Show current debug state when no arguments are provided
		const currentDebugState = workflowService.getDebug();
		workflowService.systemLine(
			`Workflow debug mode is currently: ${currentDebugState ? "ON" : "OFF"}`,
		);
		workflowService.systemLine("Usage: /workflow debug [on|off]");
		return;
	}

	const param = args.trim().toLowerCase();

	if (param === "on") {
		workflowService.setDebug(true);
		workflowService.systemLine("Workflow debug mode turned ON");
	} else if (param === "off") {
		workflowService.setDebug(false);
		workflowService.systemLine("Workflow debug mode turned OFF");
	} else {
		workflowService.errorLine(`Invalid option: '${param}'. Use 'on' or 'off'`);
		workflowService.systemLine("Usage: /workflow debug [on|off]");
	}
}
