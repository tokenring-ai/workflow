// core/workflow/workflowEvents.ts

export interface BaseWorkflowEvent {
  type: string;
  runnableName?: string;
  workflowInstanceId?: string;
  traceId?: string;
  timestamp: number;
}

export type WorkflowStepStartEvent = BaseWorkflowEvent & {
  type: "step_start";
  input?: unknown;
};

export type WorkflowStepEndEvent = BaseWorkflowEvent & {
  type: "step_end";
  output?: unknown;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string; details?: unknown };
};

export type WorkflowLogEvent = BaseWorkflowEvent & {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  details?: unknown;
};

export type WorkflowOutputChunkEvent = BaseWorkflowEvent & {
  type: "output_chunk";
  data: unknown;
};

export type WorkflowFinalOutputEvent = BaseWorkflowEvent & {
  type: "final_output";
  data: unknown;
};

export type WorkflowSchemaEvent = BaseWorkflowEvent & {
  type: "schema_definition";
  schema: unknown;
};

export type WorkflowErrorEvent = BaseWorkflowEvent & {
  type: "workflow_error";
  error: { name: string; message: string; stack?: string; details?: unknown };
};

export type WorkflowHumanApprovalRequiredEvent = BaseWorkflowEvent & {
  type: "human_approval_required";
  taskId: string;
  dataForApproval: unknown;
  message?: string;
  choices?: string[];
};

export type WorkflowHumanApprovalCompletedEvent = BaseWorkflowEvent & {
  type: "human_approval_completed";
  taskId: string;
  status: "approved" | "rejected" | "modified" | string;
  responseData?: unknown;
  feedback?: string;
};

export type WorkflowEvent =
  | WorkflowStepStartEvent
  | WorkflowStepEndEvent
  | WorkflowLogEvent
  | WorkflowOutputChunkEvent
  | WorkflowFinalOutputEvent
  | WorkflowSchemaEvent
  | WorkflowErrorEvent
  | WorkflowHumanApprovalRequiredEvent
  | WorkflowHumanApprovalCompletedEvent;

export type WorkflowResponseType<TReturn = unknown> = AsyncGenerator<
  WorkflowEvent,
  TReturn,
  void
>;