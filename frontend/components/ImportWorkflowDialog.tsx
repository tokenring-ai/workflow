import { Dialog, TextField } from "@tokenring-ai/one-frontend/ui";
import { Upload } from "lucide-react";
import { useState } from "react";
import { importNameError } from "../lib/drafts.ts";

/**
 * Names the workflow being imported from a YAML file. The name is pre-filled from the file;
 * a name that is invalid, reserved or already taken blocks the import until it is changed.
 */
export default function ImportWorkflowDialog({
  fileName,
  initialName,
  existingNames,
  busy,
  error,
  onImport,
  onClose,
}: {
  fileName: string;
  initialName: string;
  existingNames: string[];
  busy: boolean;
  error: string | null;
  onImport: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const nameError = importNameError(name, existingNames);

  return (
    <Dialog
      title="Import workflow"
      description={
        <>
          From <code className="font-mono">{fileName}</code>
        </>
      }
      width="w-96"
      onClose={onClose}
      busy={busy}
      error={error}
      confirmLabel="Import"
      confirmIcon={Upload}
      confirmDisabled={nameError !== null}
      onConfirm={() => onImport(name.trim())}
    >
      <TextField
        label="Workflow name"
        value={name}
        onChange={setName}
        mono
        autoFocus
        error={name.trim() === "" ? undefined : nameError}
        hint="The file name the workflow is saved as"
        onKeyDown={event => {
          if (event.key === "Enter" && nameError === null && !busy) onImport(name.trim());
        }}
      />
    </Dialog>
  );
}
