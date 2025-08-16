export class WorkflowExecutionStorage {
  async createExecution(context: any): Promise<any> {
    throw new Error("Not implemented");
  }

  async appendEvent(executionId: string, event: any): Promise<void> {
    throw new Error("Not implemented");
  }

  async updateStatus(executionId: string, status: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async storeOutput(executionId: string, output: any): Promise<void> {
    throw new Error("Not implemented");
  }

  async loadExecution(executionId: string): Promise<any> {
    throw new Error("Not implemented");
  }
}

export class EphemeralWorkflowExecutionStorage extends WorkflowExecutionStorage {
  private executions: Map<string, any>;

  constructor() {
    super();
    this.executions = new Map();
  }

  async createExecution(context: any): Promise<any> {
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

  async appendEvent(id: string, event: any): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.events.push({...event, timestamp: event.timestamp || Date.now()});
    }
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.status = status;
    }
  }

  async storeOutput(id: string, output: any): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.output = output;
    }
  }

  async loadExecution(id: string): Promise<any> {
    const exec = this.executions.get(id);
    return exec ? {...exec, events: [...exec.events]} : null;
  }
}