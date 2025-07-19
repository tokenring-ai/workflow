export class WorkflowExecutionStorage {
	async createExecution(context) {
		throw new Error("Not implemented");
	}

	async appendEvent(executionId, event) {
		throw new Error("Not implemented");
	}

	async updateStatus(executionId, status) {
		throw new Error("Not implemented");
	}

	async storeOutput(executionId, output) {
		throw new Error("Not implemented");
	}

	async loadExecution(executionId) {
		throw new Error("Not implemented");
	}
}

export class EphemeralWorkflowExecutionStorage extends WorkflowExecutionStorage {
	constructor() {
		super();
		this.executions = new Map();
	}

	async createExecution(context) {
		const id =
			context.id ||
			`exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		this.executions.set(id, {
			id,
			context,
			input: context.input,
			events: [],
			status: "created",
			output: undefined,
		});
		return this.executions.get(id);
	}

	async appendEvent(id, event) {
		const exec = this.executions.get(id);
		if (exec) {
			exec.events.push({ ...event, timestamp: event.timestamp || Date.now() });
		}
	}

	async updateStatus(id, status) {
		const exec = this.executions.get(id);
		if (exec) {
			exec.status = status;
		}
	}

	async storeOutput(id, output) {
		const exec = this.executions.get(id);
		if (exec) {
			exec.output = output;
		}
	}

	async loadExecution(id) {
		const exec = this.executions.get(id);
		return exec ? { ...exec, events: [...exec.events] } : null;
	}
}
