import type { PluginAppDefinition } from "@tokenring-ai/one-frontend/plugins/types.ts";
import manifest from "./manifest.ts";
import WorkflowsApp from "./WorkflowsApp.tsx";

/**
 * The workflows app contributed to the TokenRing One frontend by this
 * plugin. Discovered by `frontend/src/plugins/registry.ts`.
 */
export default {
  ...manifest,
  // The marketplace path must precede the param route so browsing it is not
  // mistaken for a workflow named "marketplace".
  routePath: "/workflows/:workflowName?",
  extraRoutePaths: ["/workflows/marketplace/:category?/:name?"],
  component: WorkflowsApp,
} satisfies PluginAppDefinition;
