export declare class WorkflowExecutionStorage {
	createExecution(context: any): Promise<any>;
	appendEvent(executionId: string, event: any): Promise<void>;
	updateStatus(executionId: string, status: string): Promise<void>;
	storeOutput(executionId: string, output: any): Promise<void>;
	loadExecution(executionId: string): Promise<any>;
}

export declare class EphemeralWorkflowExecutionStorage extends WorkflowExecutionStorage {
	constructor();
}
