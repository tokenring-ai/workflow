import packageJSON from './package.json' with { type: 'json' };
export const name = packageJSON.name;
export const version = packageJSON.version;
export const description = packageJSON.description;

export { default as WorkflowService } from "./WorkflowService.js";
export * as chatCommands from "./chatCommands.ts";

// Re-export common types for convenience
export * from "./workflowEvents.js";
export { WorkflowResponse } from "./WorkflowResponse.js";
export {
	WorkflowExecutionStorage,
	EphemeralWorkflowExecutionStorage,
} from "./WorkflowExecutionStorage.js";
export {
	flow,
	parallel,
	all,
	queue,
	deferred,
	recursiveProcessor,
} from "./flow.js";