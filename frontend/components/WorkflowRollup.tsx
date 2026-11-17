import { type RollupDays, RollupWindowSelect } from "@tokenring-ai/one-frontend/apps/agents/JobRollup.tsx";
import RollupList from "@tokenring-ai/one-frontend/apps/agents/RollupList.tsx";
import { useJobRollup } from "@tokenring-ai/one-frontend/rpc.ts";
import { useState } from "react";

/** Per-workflow runs, outcomes and spend for a window, with a total row. Picking a workflow opens it. */
export default function WorkflowRollup({ onSelectWorkflow }: { onSelectWorkflow: (name: string) => void }) {
  const [days, setDays] = useState<RollupDays>(7);
  const query = useJobRollup({ days, groupBy: "workflow" });
  const data = query.data;
  return (
    <section aria-label="Workflow spend and outcomes" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="px-1 text-sm font-semibold text-fg">Spend and outcomes</h2>
        <RollupWindowSelect days={days} onChange={setDays} />
      </div>
      {!data ? (
        <p className="px-1 text-xs text-muted">{query.error ? "Could not load the summary." : "Loading summary…"}</p>
      ) : data.rows.length === 0 ? (
        <p className="px-1 text-xs text-muted">No workflow has run in this window.</p>
      ) : (
        <>
          <RollupList rows={data.rows} totals={data.totals} label="Workflows" owner="workflow" itemAttribute="data-workflow" onSelect={onSelectWorkflow} />
          {data.truncated && <p className="px-1 text-xs text-muted">Only the newest 1000 jobs are kept, so older runs in this window are not counted.</p>}
        </>
      )}
    </section>
  );
}
