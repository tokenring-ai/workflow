import { toastManager } from "@tokenring-ai/one-frontend/components/ui/toast.tsx";
import { downloadTextFile } from "@tokenring-ai/one-frontend/lib/transcriptExport.ts";
import { workflowRPCClient } from "@tokenring-ai/one-frontend/rpc.ts";
import formatError from "@tokenring-ai/utility/error/formatError";
import { useCallback, useState } from "react";
import { suggestedImportName } from "./drafts.ts";

/** Downloads a saved workflow as YAML (the server's export, which carries a `name` hint for re-import). */
export async function downloadWorkflowYaml(name: string): Promise<void> {
  try {
    const { fileName, yaml } = await workflowRPCClient.exportWorkflow({ name });
    downloadTextFile(fileName, yaml, "application/yaml");
  } catch (error) {
    toastManager.error(`Could not export "${name}": ${formatError(error)}`, { duration: 5000 });
  }
}

/** Copies a saved workflow server-side under the next free `<name>-copy` name; resolves to the new name or null. */
export async function duplicateWorkflow(name: string): Promise<string | null> {
  try {
    const { workflow } = await workflowRPCClient.duplicateWorkflow({ name });
    toastManager.success(`Duplicated as "${workflow.name}"`, { duration: 3000 });
    return workflow.name;
  } catch (error) {
    toastManager.error(`Could not duplicate "${name}": ${formatError(error)}`, { duration: 5000 });
    return null;
  }
}

export interface PendingImport {
  fileName: string;
  yaml: string;
  suggestedName: string;
}

/**
 * Import flow state: pick a file → name it in a dialog → create the workflow. The server validates
 * the YAML against the workflow schema and refuses existing names; its error shows in the dialog.
 */
export function useWorkflowImport(onImported: (name: string) => void) {
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFile = useCallback(async (file: File) => {
    try {
      const yaml = await file.text();
      setError(null);
      setPending({ fileName: file.name, yaml, suggestedName: suggestedImportName(yaml, file.name) });
    } catch (readError) {
      toastManager.error(`Could not read ${file.name}: ${formatError(readError)}`, { duration: 5000 });
    }
  }, []);

  const confirm = useCallback(
    async (name: string) => {
      if (!pending) return;
      setBusy(true);
      setError(null);
      try {
        const { workflow } = await workflowRPCClient.importWorkflow({ yaml: pending.yaml, name });
        setPending(null);
        toastManager.success(`Imported "${workflow.name}"`, { duration: 3000 });
        onImported(workflow.name);
      } catch (importError) {
        setError(formatError(importError));
      } finally {
        setBusy(false);
      }
    },
    [onImported, pending],
  );

  const cancel = useCallback(() => {
    setPending(null);
    setError(null);
  }, []);

  return { pending, busy, error, chooseFile, confirm, cancel };
}
