import { useLocalStorageState } from "@tokenring-ai/one-frontend/hooks/useLocalStorageState.ts";
import { useCallback, useSyncExternalStore } from "react";
import { isSameDraft, type WorkflowDraft } from "./drafts.ts";

/**
 * Dock-free state shared by the Workflows views (old and new hosts): persisted
 * drafts, the create form's name store and the Installed / Marketplace switch.
 */

/** Draft key for the not-yet-created workflow; can never collide with a real name. */
export const NEW_DRAFT_KEY = "__new__";

/** Drafts persist across reloads (and are shared between panels); entries are dropped on save/revert/delete. */
export function useWorkflowDrafts() {
  const [drafts, setDrafts] = useLocalStorageState<Record<string, WorkflowDraft>>(
    "workflows:drafts",
    {},
    {
      deserialize: raw => {
        try {
          const parsed: unknown = JSON.parse(raw);
          return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, WorkflowDraft>) : {};
        } catch {
          return {};
        }
      },
    },
  );

  const setDraft = useCallback((key: string, next: WorkflowDraft) => setDrafts(prev => ({ ...prev, [key]: next })), [setDrafts]);
  const clearDraft = useCallback(
    (key: string) =>
      setDrafts(prev => {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }),
    [setDrafts],
  );

  /**
   * Drops the draft only if it still matches what was just saved: edits typed
   * while the save was in flight stay as the new draft.
   */
  const clearDraftIfUnchanged = useCallback(
    (key: string, saved: WorkflowDraft) =>
      setDrafts(prev => {
        const current = prev[key];
        if (!current || !isSameDraft(current, saved)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }),
    [setDrafts],
  );

  return { drafts, setDraft, clearDraft, clearDraftIfUnchanged };
}

// ─── Name typed into the create form (seeded by "clone") ───────────────────────

let newWorkflowName = "";
const nameListeners = new Set<() => void>();

export function setNewWorkflowName(name: string): void {
  if (name === newWorkflowName) return;
  newWorkflowName = name;
  for (const listener of nameListeners) listener();
}

export function useNewWorkflowName(): string {
  return useSyncExternalStore(
    listener => {
      nameListeners.add(listener);
      return () => {
        nameListeners.delete(listener);
      };
    },
    () => newWorkflowName,
    () => newWorkflowName,
  );
}
