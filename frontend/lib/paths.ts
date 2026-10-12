/** React-free route helpers shared by the dashboard definition and the views. */

export const WORKFLOWS_ROOT = "/workflows";
export const NEW_WORKFLOW_PATH = `${WORKFLOWS_ROOT}/new`;
export const RUNS_PATH = `${WORKFLOWS_ROOT}/runs`;
/** Route of the embedded marketplace pane; `/<category>/<name>` below it selects an item. */
export const MARKETPLACE_PATH = `${WORKFLOWS_ROOT}/marketplace`;

export function workflowPath(name: string): string {
  return `/workflows/${encodeURIComponent(name)}`;
}

export function runPath(runId: string): string {
  return `${RUNS_PATH}/${encodeURIComponent(runId)}`;
}

export function isWorkflowMarketplacePath(pathname: string): boolean {
  return pathname === MARKETPLACE_PATH || pathname.startsWith(`${MARKETPLACE_PATH}/`);
}

/**
 * The marketplace item lives only in the URL, so the last marketplace URL is
 * remembered here: re-activating the marketplace tab restores the selected
 * item instead of dropping back to the storefront.
 */
let lastMarketplacePath = MARKETPLACE_PATH;

export function rememberMarketplacePath(pathname: string): void {
  if (isWorkflowMarketplacePath(pathname)) lastMarketplacePath = pathname;
}

export function getLastMarketplacePath(): string {
  return lastMarketplacePath;
}

/** Test helper. */
export function resetMarketplacePath(): void {
  lastMarketplacePath = MARKETPLACE_PATH;
}
