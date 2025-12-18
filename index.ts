import {z} from "zod";
import {WorkflowItemSchema} from "./WorkflowService.ts";

export const WorkflowConfigSchema = z.record(z.string(), WorkflowItemSchema).default({});


export {default as WorkflowService} from "./WorkflowService.ts";
export type {WorkflowItem} from "./WorkflowService.ts";
