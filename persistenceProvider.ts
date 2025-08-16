// core/workflow/persistenceProvider.ts

import type {WorkflowContext} from '../runnable/runnable.js';

/**
 * Record representing the saved state of a workflow
 */
export interface WorkflowStateRecord {
  /** Identifier for the workflow definition (e.g., class name or unique ID) */
  definitionId: string;
  /** Identifier for the next step/Runnable to be executed */
  currentStepId: string;
  /** The output from the previously completed step, to be used as input for currentStepId */
  lastOutput: any;
  /** The state of the workflow context to be restored */
  workflowContext: WorkflowContext;
  /** Timestamp of when the state was last saved */
  updatedAt?: Date;
}

/**
 * Interface for a workflow state persistence provider.
 * Implementations of this interface will handle the actual storage
 * (e.g., in-memory, database, file system).
 */
export abstract class PersistenceProvider {
  /**
   * Saves the current state of a workflow instance.
   * @param workflowInstanceId - Unique ID for the executing workflow instance.
   * @param definitionId - Identifier for the workflow definition.
   * @param nextStepId - Identifier of the next step/Runnable to be executed.
   * @param lastOutput - The output from the successfully completed step.
   * @param currentWorkflowContext - The current workflow context.
   */
  async saveWorkflowState(
    workflowInstanceId: string,
    definitionId: string,
    nextStepId: string,
    lastOutput: any,
    currentWorkflowContext: WorkflowContext,
  ): Promise<void> {
    // Ensure `lastOutput` and `currentWorkflowContext` are serializable (e.g., to JSON).
    // Non-serializable data (like live class instances, functions, complex Maps/Sets with non-primitive keys)
    // may be lost or cause errors with some persistence providers.
    // The `InMemoryPersistenceProvider` below stores references, so it's less affected by this directly,
    // but a database or file-based provider would require serialization.
    throw new Error(
      "PersistenceProvider.saveWorkflowState must be implemented by subclasses.",
    );
  }

  /**
   * Loads the persisted state for a workflow instance.
   * @param workflowInstanceId - Unique ID for the executing workflow instance.
   * @returns The saved state, or null if no state found.
   */
  async loadWorkflowState(workflowInstanceId: string): Promise<WorkflowStateRecord | null> {
    throw new Error(
      "PersistenceProvider.loadWorkflowState must be implemented by subclasses.",
    );
  }

  /**
   * Clears any persisted state for a workflow instance.
   * Typically called upon successful completion or explicit termination of a workflow.
   * @param workflowInstanceId - Unique ID for the executing workflow instance.
   */
  async clearWorkflowState(workflowInstanceId: string): Promise<void> {
    throw new Error(
      "PersistenceProvider.clearWorkflowState must be implemented by subclasses.",
    );
  }
}

/**
 * A basic in-memory implementation of PersistenceProvider for demonstration and testing.
 * WARNING: This is not suitable for production as state will be lost when the process exits.
 */
export class InMemoryPersistenceProvider extends PersistenceProvider {
  private store: Map<string, WorkflowStateRecord>;

  constructor() {
    super();
    this.store = new Map<string, WorkflowStateRecord>();
    console.log("InMemoryPersistenceProvider initialized.");
  }

  async saveWorkflowState(
    workflowInstanceId: string,
    definitionId: string,
    nextStepId: string,
    lastOutput: any,
    currentWorkflowContext: WorkflowContext,
  ): Promise<void> {
    const stateRecord: WorkflowStateRecord = {
      definitionId,
      currentStepId: nextStepId,
      lastOutput,
      workflowContext: currentWorkflowContext, // Note: direct reference, ensure context is serializable if using other providers
      updatedAt: new Date(),
    };
    this.store.set(workflowInstanceId, stateRecord);
    console.log(
      `[InMemoryPersistence] State saved for ${workflowInstanceId}. Next step: ${nextStepId}`,
    );
    // console.log(`[InMemoryPersistence] Saved state detail:`, JSON.stringify(stateRecord, null, 2));
  }

  async loadWorkflowState(workflowInstanceId: string): Promise<WorkflowStateRecord | null> {
    const stateRecord = this.store.get(workflowInstanceId);
    if (stateRecord) {
      console.log(
        `[InMemoryPersistence] State loaded for ${workflowInstanceId}. Current step: ${stateRecord.currentStepId}`,
      );
      // console.log(`[InMemoryPersistence] Loaded state detail:`, JSON.stringify(stateRecord, null, 2));
      return {...stateRecord}; // Return a copy
    }
    console.log(
      `[InMemoryPersistence] No state found for ${workflowInstanceId}.`,
    );
    return null;
  }

  async clearWorkflowState(workflowInstanceId: string): Promise<void> {
    if (this.store.has(workflowInstanceId)) {
      this.store.delete(workflowInstanceId);
      console.log(
        `[InMemoryPersistence] State cleared for ${workflowInstanceId}.`,
      );
    } else {
      console.log(
        `[InMemoryPersistence] No state to clear for ${workflowInstanceId}.`,
      );
    }
  }
}

export default PersistenceProvider;