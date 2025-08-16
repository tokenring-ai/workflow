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
  input?: any;
};

export type WorkflowStepEndEvent = BaseWorkflowEvent & {
  type: "step_end";
  output?: any;
  durationMs?: number;
  error?: { name: string; message: string; stack?: string; details?: any };
};

export type WorkflowLogEvent = BaseWorkflowEvent & {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
  details?: any;
};

export type WorkflowOutputChunkEvent = BaseWorkflowEvent & {
  type: "output_chunk";
  data: any;
};

export type WorkflowFinalOutputEvent = BaseWorkflowEvent & {
  type: "final_output";
  data: any;
};

export type WorkflowSchemaEvent = BaseWorkflowEvent & {
  type: "schema_definition";
  schema: any;
};

export type WorkflowErrorEvent = BaseWorkflowEvent & {
  type: "workflow_error";
  error: { name: string; message: string; stack?: string; details?: any };
};

export type WorkflowHumanApprovalRequiredEvent = BaseWorkflowEvent & {
  type: "human_approval_required";
  taskId: string;
  dataForApproval: any;
  message?: string;
  choices?: string[];
};

export type WorkflowHumanApprovalCompletedEvent = BaseWorkflowEvent & {
  type: "human_approval_completed";
  taskId: string;
  status: "approved" | "rejected" | "modified" | string;
  responseData?: any;
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

export type WorkflowResponseType<TReturn = any> = AsyncGenerator<
  WorkflowEvent,
  TReturn,
  void
>;