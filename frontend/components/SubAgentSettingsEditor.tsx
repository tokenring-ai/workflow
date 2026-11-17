import { ChevronDown, ChevronRight, Settings2 } from "lucide-react";
import { useId, useState } from "react";
import type { SubAgentSettings } from "../lib/drafts.ts";

const BOOLEAN_SUB_AGENT_FIELDS = [
  { key: "forwardChatOutput", label: "Forward chat output", hint: "Show the sub-agent's chat output in the parent agent" },
  { key: "forwardStatusMessages", label: "Forward status messages", hint: "Show status updates from the sub-agent" },
  { key: "forwardSystemOutput", label: "Forward system output", hint: "Show system messages from the sub-agent" },
  { key: "forwardHumanRequests", label: "Forward human requests", hint: "Relay questions the sub-agent asks a human" },
  { key: "forwardReasoning", label: "Forward reasoning", hint: "Show the sub-agent's reasoning output" },
  { key: "forwardInputCommands", label: "Forward input commands", hint: "Echo the commands sent to the sub-agent" },
] as const satisfies ReadonlyArray<{ key: keyof SubAgentSettings; label: string; hint: string }>;

const NUMBER_SUB_AGENT_FIELDS = [
  { key: "timeout", label: "Timeout", unit: "seconds", hint: "0 disables the timeout" },
  { key: "maxResponseLength", label: "Max response length", unit: "characters", hint: "Longest response forwarded to the parent" },
  { key: "minContextLength", label: "Min context length", unit: "characters", hint: "Context kept when trimming the sub-agent's history" },
] as const satisfies ReadonlyArray<{ key: keyof SubAgentSettings; label: string; unit: string; hint: string }>;

export default function SubAgentSettingsEditor({ value, onChange }: { value: SubAgentSettings; onChange: (value: SubAgentSettings) => void }) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  return (
    <div className="border border-primary rounded-xl bg-secondary/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={detailsId}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-hover transition-colors cursor-pointer focus-ring"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />}
        <Settings2 className="w-3.5 h-3.5 text-muted shrink-0" />
        <span className="flex-1 text-xs font-medium text-primary">Sub-agent settings</span>
        <span className="text-xs text-muted">Used when this workflow is spawned from another agent</span>
      </button>

      {open && (
        <div id={detailsId} className="px-3 pb-3 pt-1 space-y-3 border-t border-primary/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 pt-2">
            {BOOLEAN_SUB_AGENT_FIELDS.map(field => {
              const hintId = `sub-agent-hint-${field.key}`;
              return (
                <div key={field.key} className="flex items-start gap-2 py-1">
                  <input
                    id={`sub-agent-${field.key}`}
                    type="checkbox"
                    checked={value[field.key] as boolean}
                    onChange={e => onChange({ ...value, [field.key]: e.target.checked })}
                    aria-describedby={hintId}
                    className="mt-0.5 accent-accent cursor-pointer"
                  />
                  <label htmlFor={`sub-agent-${field.key}`} className="text-xs text-secondary cursor-pointer">
                    {field.label}
                    <span id={hintId} className="block text-muted">
                      {field.hint}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {NUMBER_SUB_AGENT_FIELDS.map(field => {
              const hintId = `sub-agent-hint-${field.key}`;
              return (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted" htmlFor={`sub-agent-${field.key}`}>
                    {field.label} <span className="font-normal">({field.unit})</span>
                  </label>
                  <input
                    id={`sub-agent-${field.key}`}
                    type="number"
                    min={0}
                    value={value[field.key] as number}
                    onChange={e => {
                      // Keep the previous value while the field is transiently empty/invalid.
                      const parsed = Number(e.target.value);
                      if (e.target.value === "" || !Number.isFinite(parsed)) return;
                      onChange({ ...value, [field.key]: Math.max(0, parsed) });
                    }}
                    aria-describedby={hintId}
                    className="w-full bg-input border border-primary rounded-lg px-3 py-2 text-sm text-primary focus-accent"
                  />
                  <span id={hintId} className="block text-xs text-muted">
                    {field.hint}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
