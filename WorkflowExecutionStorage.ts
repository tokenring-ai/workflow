import {WorkflowEvent} from "./workflowEvents.js";

/**
 * Context information passed when creating a workflow execution.
 */
export interface ExecutionContext {
  /** Identifier of the workflow being executed */
  workflowId: string;
  /** Optional registry instance for the execution */
  registry?: any;
  /** Optional persistence bag that can be used by the workflow */
  persistence?: any;
  /** AbortSignal to allow cancellation */
  abortSignal: AbortSignal;
  /** Input provided to the workflow */
  input: any;
  /** Optional explicit execution id */
  id?: string;
}

/**
 * Record stored for a workflow execution.
 */
export interface ExecutionRecord {
  id: string;
  context: ExecutionContext;
  input: any;
  events: WorkflowEvent[];
  status: string;
  output?: unknown;
}

/**
 * Abstract storage class – concrete implementations must provide the methods.
 */
export class WorkflowExecutionStorage {
  async createExecution(context: ExecutionContext): Promise<ExecutionRecord> {
    throw new Error("Not implemented");
  }

  async appendEvent(executionId: string, event: WorkflowEvent): Promise<void> {
    throw new Error("Not implemented");
  }

  async updateStatus(executionId: string, status: string): Promise<void> {
    throw new Error("Not implemented");
  }

  async storeOutput(executionId: string, output: unknown): Promise<void> {
    throw new Error("Not implemented");
  }

  async loadExecution(executionId: string): Promise<ExecutionRecord | null> {
    throw new Error("Not implemented");
  }
}

/**
 * In‑memory implementation used by default. Stores executions in a Map.
 */
export class EphemeralWorkflowExecutionStorage extends WorkflowExecutionStorage {
  private executions: Map<string, ExecutionRecord>;

  constructor() {
    super();
    this.executions = new Map();
  }

  async createExecution(context: ExecutionContext): Promise<ExecutionRecord> {
    const id =
      context.id ||
      `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record: ExecutionRecord = {
      id,
      context,
      input: context.input,
      events: [],
      status: "created",
      output: undefined,
    };
    this.executions.set(id, record);
    return record;
  }

  async appendEvent(id: string, event: WorkflowEvent): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.events.push({...event, timestamp: event.timestamp ?? Date.now()});
    }
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.status = status;
    }
  }

  async storeOutput(id: string, output: unknown): Promise<void> {
    const exec = this.executions.get(id);
    if (exec) {
      exec.output = output;
    }
  }

  async loadExecution(id: string): Promise<ExecutionRecord | null> {
    const exec = this.executions.get(id);
    return exec ? {...exec, events: [...exec.events]} : null;
  }
}
