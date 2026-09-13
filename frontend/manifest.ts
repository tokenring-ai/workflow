import type { PluginAppManifest } from "@tokenring-ai/one-frontend/plugins/types.ts";
import { GitBranch } from "lucide-react";

/**
 * Metadata for the workflows app shipped by this plugin. The frontend merges
 * this into its app registry and derives the SPA server routes from it.
 */
export default {
  id: "workflows",
  path: "/workflows",
  label: "Workflows",
  shortLabel: "WF",
  description: "Launch and monitor automated workflows",
  group: "Build",
  icon: GitBranch,
  iconClass: "text-cyan-500",
  gradient: "from-cyan-500 to-teal-600",
  defaultPinned: true,
} satisfies PluginAppManifest;
