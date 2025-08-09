export type WorkflowExecutionHandle = {
	id: string;
	stream: () => import("eventemitter3").EventEmitter;
	result: () => Promise<any>;
	cancel: () => void;
	resume: () => Promise<WorkflowExecutionHandle>;
};

export default class WorkflowService {
	name: string;
	description: string;
	constructor(options?: { executionStorage?: any });
	start(registry: any): Promise<void>;
	registerWorkflow(id: string, runnable: any): void;
	startWorkflow(
		workflowId: string,
		input: any,
		persistence?: any,
		existingId?: string | undefined,
	): Promise<WorkflowExecutionHandle>;
	resume(executionId: string): Promise<WorkflowExecutionHandle>;
}
