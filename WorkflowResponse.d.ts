import type {
	WorkflowEvent,
	WorkflowFinalOutputEvent,
	WorkflowSchemaEvent,
	WorkflowResponseType,
} from "./workflowEvents.js";

export declare class WorkflowResponse {
	private _asyncGenerator: WorkflowResponseType<any>;
	private _initialMetadata: any;
	private _responsePromise: Promise<any> | null;
	private _schemaPromise: Promise<any> | null;
	private _eventBuffer: WorkflowEvent[];
	private _generatorFullyConsumed: boolean;
	private _consumptionError: Error | null;
	private _generatorReturnValue: any;

	constructor(asyncGenerator: WorkflowResponseType<any>, initialMetadata?: any);

	get metadata(): any;
	get workflowInstanceId(): string | undefined;
	get workflowDefinitionId(): string | undefined;

	stream(): WorkflowResponseType<any>;

	response(): Promise<any>;

	outputSchema(): Promise<any | undefined>;

	allEvents(): Promise<WorkflowEvent[]>;
}

export default WorkflowResponse;
