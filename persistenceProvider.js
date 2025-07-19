// core/workflow/persistenceProvider.js

/**
 * @typedef {Object} WorkflowStateRecord
 * @property {string} definitionId - Identifier for the workflow definition (e.g., class name or unique ID).
 * @property {string} currentStepId - Identifier for the next step/Runnable to be executed.
 * @property {any} lastOutput - The output from the previously completed step, to be used as input for currentStepId.
 * @property {import('../runnable2/runnable.js').WorkflowContext} workflowContext - The state of the workflow context to be restored.
 * @property {Date} [updatedAt] - Timestamp of when the state was last saved.
 */

/**
 * Interface for a workflow state persistence provider.
 * Implementations of this interface will handle the actual storage
 * (e.g., in-memory, database, file system).
 * @interface
 */
export class PersistenceProvider {
	/**
	 * Saves the current state of a workflow instance.
	 * @param {string} workflowInstanceId - Unique ID for the executing workflow instance.
	 * @param {string} definitionId - Identifier for the workflow definition.
	 * @param {string} nextStepId - Identifier of the next step/Runnable to be executed.
	 * @param {any} lastOutput - The output from the successfully completed step.
	 * @param {import('../runnable2/runnable.js').WorkflowContext} currentWorkflowContext - The current workflow context.
	 * @returns {Promise<void>}
	 * @abstract
	 */
	async saveWorkflowState(
		workflowInstanceId,
		definitionId,
		nextStepId,
		lastOutput,
		currentWorkflowContext,
	) {
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
	 * @param {string} workflowInstanceId - Unique ID for the executing workflow instance.
	 * @returns {Promise<WorkflowStateRecord | null>} The saved state, or null if no state found.
	 * @abstract
	 */
	async loadWorkflowState(workflowInstanceId) {
		throw new Error(
			"PersistenceProvider.loadWorkflowState must be implemented by subclasses.",
		);
	}

	/**
	 * Clears any persisted state for a workflow instance.
	 * Typically called upon successful completion or explicit termination of a workflow.
	 * @param {string} workflowInstanceId - Unique ID for the executing workflow instance.
	 * @returns {Promise<void>}
	 * @abstract
	 */
	async clearWorkflowState(workflowInstanceId) {
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
	constructor() {
		super();
		/** @type {Map<string, WorkflowStateRecord>} */
		this.store = new Map();
		console.log("InMemoryPersistenceProvider initialized.");
	}

	async saveWorkflowState(
		workflowInstanceId,
		definitionId,
		nextStepId,
		lastOutput,
		currentWorkflowContext,
	) {
		const stateRecord = {
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

	async loadWorkflowState(workflowInstanceId) {
		const stateRecord = this.store.get(workflowInstanceId);
		if (stateRecord) {
			console.log(
				`[InMemoryPersistence] State loaded for ${workflowInstanceId}. Current step: ${stateRecord.currentStepId}`,
			);
			// console.log(`[InMemoryPersistence] Loaded state detail:`, JSON.stringify(stateRecord, null, 2));
			return { ...stateRecord }; // Return a copy
		}
		console.log(
			`[InMemoryPersistence] No state found for ${workflowInstanceId}.`,
		);
		return null;
	}

	async clearWorkflowState(workflowInstanceId) {
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
