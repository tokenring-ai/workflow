// core/workflow/workflowEvents.js

/**
 * @typedef {Object} BaseWorkflowEvent
 * @property {string} type - The type of the workflow event.
 * @property {string} [runnableName] - The name of the Runnable that emitted this event.
 * @property {string} [workflowInstanceId] - The ID of the workflow instance, if available.
 * @property {string} [traceId] - The trace ID, if available.
 * @property {number} timestamp - Unix timestamp (milliseconds) of when the event occurred.
 */

/**
 * Event indicating a Runnable/step has started.
 * @typedef {BaseWorkflowEvent & { type: 'step_start', input?: any }} WorkflowStepStartEvent
 */

/**
 * Event indicating a Runnable/step has ended.
 * Can include either output or error, but not both.
 * @typedef {BaseWorkflowEvent & {
 *   type: 'step_end',
 *   output?: any,
 *   durationMs?: number,
 *   error?: { name: string, message: string, stack?: string, details?: any }
 * }} WorkflowStepEndEvent
 */

/**
 * Event for logging messages from within a workflow.
 * @typedef {BaseWorkflowEvent & {
 *   type: 'log',
 *   level: 'debug' | 'info' | 'warn' | 'error',
 *   message: string,
 *   details?: any
 * }} WorkflowLogEvent
 */

/**
 * Event for streaming partial output from a Runnable.
 * @typedef {BaseWorkflowEvent & { type: 'output_chunk', data: any }} WorkflowOutputChunkEvent
 */

/**
 * Event signaling the final, consolidated output of a Runnable.
 * This is the primary event that `RunnableSequence` will use to pass data between steps
 * and what `WorkflowResponse.response()` will await.
 * @typedef {BaseWorkflowEvent & { type: 'final_output', data: any }} WorkflowFinalOutputEvent
 */

/**
 * Event indicating the output schema for a Runnable.
 * @typedef {BaseWorkflowEvent & { type: 'schema_definition', schema: any }} WorkflowSchemaEvent
 * // 'schema' might be a Zod schema object, a JSON schema, or other schema representation.
 */

/**
 * Event for unrecoverable errors at the workflow level (e.g., from WorkflowService or top-level orchestrator).
 * Individual step errors are typically part of WorkflowStepEndEvent.
 * @typedef {BaseWorkflowEvent & {
 *  type: 'workflow_error',
 *  error: { name: string, message: string, stack?: string, details?: any }
 * }} WorkflowErrorEvent
 */

/**
 * Event specific to HumanApprovalRunnable: task created and waiting for human.
 * @typedef {BaseWorkflowEvent & {
 *   type: 'human_approval_required',
 *   taskId: string,
 *   dataForApproval: any,
 *   message?: string,
 *   choices?: string[]
 * }} WorkflowHumanApprovalRequiredEvent
 */

/**
 * Event specific to HumanApprovalRunnable: human has responded.
 * @typedef {BaseWorkflowEvent & {
 *   type: 'human_approval_completed',
 *   taskId: string,
 *   status: 'approved' | 'rejected' | 'modified' | string,
 *   responseData?: any,
 *   feedback?: string
 * }} WorkflowHumanApprovalCompletedEvent
 */

// Union type for all possible workflow events
/**
 * @typedef {
 *   WorkflowStepStartEvent |
 *   WorkflowStepEndEvent |
 *   WorkflowLogEvent |
 *   WorkflowOutputChunkEvent |
 *   WorkflowFinalOutputEvent |
 *   WorkflowSchemaEvent |
 *   WorkflowErrorEvent |
 *   WorkflowHumanApprovalRequiredEvent |
 *   WorkflowHumanApprovalCompletedEvent
 * } WorkflowEvent
 */

// Define WorkflowResponseType (the return type of Runnable.invoke)
/**
 * The return type of a Runnable's invoke method when using the async generator pattern.
 * It yields WorkflowEvent objects and its final `return` statement's value is considered the TReturn.
 * It's recommended that the primary result is yielded as a `WorkflowFinalOutputEvent`, and TReturn can be void or this same data.
 * @template TReturn The type of the generator's explicit return value.
 * @typedef {AsyncGenerator<WorkflowEvent, TReturn, void>} WorkflowResponseType
 */

// This file primarily defines types using JSDoc for use in other JavaScript files.
// No actual runtime code here, but it centralizes the event definitions.

// To allow this file to be imported and its JSDoc types recognized.
export {};
