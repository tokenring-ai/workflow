import { Service } from '@token-ring/registry';
import EventEmitter from 'eventemitter3';
import { EphemeralWorkflowExecutionStorage } from './WorkflowExecutionStorage.js';
import { Runnable } from '../runnable/runnable.js';

export default class WorkflowService extends Service {
  name = 'WorkflowService';
  description = 'Runs registered workflows based on Runnable';

  constructor(options = {}) {
    super();
    this.registry = null;
    this.workflows = new Map();
    this.executionStorage = options.executionStorage || new EphemeralWorkflowExecutionStorage();
  }

  async start(registry) {
    this.registry = registry;
  }

  registerWorkflow(id, runnable) {
    if (!(runnable instanceof Runnable)) {
      throw new Error('Workflow must be a Runnable');
    }
    this.workflows.set(id, runnable);
  }

  async startWorkflow(workflowId, input, persistence = {}, existingId = undefined) {
    const runnable = this.workflows.get(workflowId);
    if (!runnable) throw new Error(`Workflow ${workflowId} not found`);

    const abortController = new AbortController();
    const context = {
      workflowId,
      serviceRegistry: this.registry,
      persistence,
      abortSignal: abortController.signal,
      input
    };

    const exec = await this.executionStorage.createExecution({ ...context, input, id: existingId });
    const executionId = exec.id;

    const emitter = new EventEmitter();

    const runPromise = (async () => {
      await this.executionStorage.updateStatus(executionId, 'started');
      let finalOutput;
      try {
        const gen = runnable.invoke(input, { ...context, executionId });
        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            finalOutput = value;
            break;
          }
          await this.executionStorage.appendEvent(executionId, value);
          emitter.emit('event', value);
        }
        await this.executionStorage.storeOutput(executionId, finalOutput);
        await this.executionStorage.updateStatus(executionId, 'complete');
        emitter.emit('end', finalOutput);
        return finalOutput;
      } catch (err) {
        if (abortController.signal.aborted) {
          await this.executionStorage.updateStatus(executionId, 'cancelled');
        } else {
          await this.executionStorage.updateStatus(executionId, 'failed');
        }
        emitter.emit('error', err);
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
      resume: () => this.resume(executionId)
    };
  }

  async resume(executionId) {
    const record = await this.executionStorage.loadExecution(executionId);
    if (!record) throw new Error(`Execution ${executionId} not found`);
    const runnable = this.workflows.get(record.workflowId || record.context?.workflowId);
    if (!runnable) throw new Error(`Workflow ${record.workflowId} not registered`);
    return this.startWorkflow(record.workflowId || record.context?.workflowId, record.input, record.context?.persistence, executionId);
  }
}
