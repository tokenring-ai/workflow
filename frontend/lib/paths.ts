/** React-free route helpers shared by the dashboard definition and the views. */

export const WORKFLOWS_ROOT = "/workflows";
export const NEW_WORKFLOW_PATH = `${WORKFLOWS_ROOT}/new`;
export const RUNS_PATH = `${WORKFLOWS_ROOT}/runs`;
/** Community workflows live in the Marketplace app. */
export const MARKETPLACE_PATH = "/marketplace/workflow";

export function workflowPath(name: string): string {
  return `/workflows/${encodeURIComponent(name)}`;
}

export function runPath(runId: string): string {
  return `${RUNS_PATH}/${encodeURIComponent(runId)}`;
}
