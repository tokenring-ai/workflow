import {Registry, Service} from "@token-ring/registry";
import {EventEmitter} from "eventemitter3";
import {Runnable} from "../runnable/runnable.js";
import {EphemeralWorkflowExecutionStorage} from "./WorkflowExecutionStorage.js";

export type WorkflowExecutionHandle = {
  id: string;
  stream: () => EventEmitter;
  result: () => Promise<any>;
  cancel: () => void;
  resume: () => Promise<WorkflowExecutionHandle>;
};

export interface WorkflowInfo {
  name: string;
  description?: string;
  parseArgs?: (args: string) => any;
}

export default class WorkflowService extends Service {
  name = "WorkflowService";
  description = "Runs registered workflows based on Runnable";
  // Properties for plan command
  currentPlan: any[] = [];
  planPrompt: string = "";
  private registry: Registry | null;
  private workflows: Map<string, Runnable>;
  private executionStorage: any;
  private debugMode: boolean = false;

  constructor(options: { executionStorage?: any } = {}) {
    super();
    this.registry = null;
    this.workflows = new Map();
    this.executionStorage =
      options.executionStorage || new EphemeralWorkflowExecutionStorage();
  }

  async start(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  registerWorkflow(id: string, runnable: any): void {
    if (!(runnable instanceof Runnable)) {
      throw new Error("Workflow must be a Runnable");
    }
    this.workflows.set(id, runnable);
  }

  async startWorkflow(
    workflowId: string,
    input: any,
    persistence: any = {},
    existingId: string | undefined = undefined,
  ): Promise<WorkflowExecutionHandle> {
    const runnable = this.workflows.get(workflowId);
    if (!runnable) throw new Error(`Workflow ${workflowId} not found`);

    const abortController = new AbortController();
    const context = {
      workflowId,
      registry: this.registry,
      persistence,
      abortSignal: abortController.signal,
      input,
    };

    const exec = await this.executionStorage.createExecution({
      ...context,
      input,
      id: existingId,
    });
    const executionId = exec.id;

    const emitter = new EventEmitter();

    const runPromise = (async () => {
      await this.executionStorage.updateStatus(executionId, "started");
      let finalOutput;
      try {
        const gen = runnable.invoke(input, {...context, executionId});
        while (true) {
          const {value, done} = await gen.next();
          if (done) {
            finalOutput = value;
            break;
          }
          await this.executionStorage.appendEvent(executionId, value);
          emitter.emit("event", value);
        }
        await this.executionStorage.storeOutput(executionId, finalOutput);
        await this.executionStorage.updateStatus(executionId, "complete");
        emitter.emit("end", finalOutput);
        return finalOutput;
      } catch (err) {
        if (abortController.signal.aborted) {
          await this.executionStorage.updateStatus(executionId, "cancelled");
        } else {
          await this.executionStorage.updateStatus(executionId, "failed");
        }
        emitter.emit("error", err);
        throw err;
      }
    })();

    return {
      id: executionId,
      stream: () => emitter,
      result: () => runPromise,
      cancel: () => {
        abortController.abort();
      },
      resume: () => this.resume(executionId),
    };
  }

  async resume(executionId: string): Promise<WorkflowExecutionHandle> {
    const record = await this.executionStorage.loadExecution(executionId);
    if (!record) throw new Error(`Execution ${executionId} not found`);
    const runnable = this.workflows.get(
      record.workflowId || record.context?.workflowId,
    );
    if (!runnable)
      throw new Error(`Workflow ${record.workflowId} not registered`);
    return this.startWorkflow(
      record.workflowId || record.context?.workflowId,
      record.input,
      record.context?.persistence,
      executionId,
    );
  }

  /**
   * Run a workflow module with the given input
   */
  async run(workflowModule: any, input: any, registry: Registry): Promise<any> {
    if (!workflowModule || typeof workflowModule.execute !== 'function') {
      throw new Error('Invalid workflow module: missing execute function');
    }

    try {
      // Validate input if schema is provided
      if (workflowModule.inputSchema && input) {
        input = workflowModule.inputSchema.parse(input);
      }

      // Execute the workflow
      const result = await workflowModule.execute(input, registry);

      // Validate output if schema is provided
      if (workflowModule.outputSchema && result) {
        return workflowModule.outputSchema.parse(result);
      }

      return result;
    } catch (error: any) {
      if (this.debugMode) {
        console.error(`[WorkflowService] Error running workflow: ${error.message}`);
        console.error(error.stack);
      }
      throw error;
    }
  }

  /**
   * List all registered workflows
   */
  listWorkflows(): WorkflowInfo[] {
    const workflows: WorkflowInfo[] = [];
    this.workflows.forEach((runnable, id) => {
      workflows.push({
        name: id,
        description: runnable.description,
      });
    });
    return workflows;
  }

  /**
   * Get a specific workflow by name
   */
  getWorkflow(name: string): Runnable | undefined {
    return this.workflows.get(name);
  }

  /**
   * Get the current debug mode state
   */
  getDebug(): boolean {
    return this.debugMode;
  }

  /**
   * Set the debug mode state
   */
  setDebug(value: boolean): void {
    this.debugMode = value;
  }
}