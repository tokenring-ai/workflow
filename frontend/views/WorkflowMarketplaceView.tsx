import MarketplaceItemDetail from "@tokenring-ai/one-frontend/components/marketplace/MarketplaceItemDetail.tsx";
import MarketplaceStorefront from "@tokenring-ai/one-frontend/components/marketplace/MarketplaceStorefront.tsx";
import { useEmbeddedMarketplace } from "@tokenring-ai/one-frontend/components/marketplace/useEmbeddedMarketplace.ts";
import ViewShell from "@tokenring-ai/one-frontend/components/ui/ViewShell.tsx";
import type { ViewProps } from "@tokenring-ai/one-frontend/dock/types.ts";
import { useWorkflows } from "@tokenring-ai/one-frontend/rpc.ts";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { isWorkflowMarketplacePath, MARKETPLACE_PATH, rememberMarketplacePath } from "../lib/paths.ts";
import { useWorkflowsNavigation, WorkflowTabs } from "../lib/workflowsShared.tsx";

/**
 * Community workflows from the marketplace registry. The selected item comes
 * from `/workflows/marketplace/:category/:name`; the storefront shows otherwise.
 */
export default function WorkflowMarketplaceView({ panel }: ViewProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { category, name } = useParams<{ category?: string; name?: string }>();
  const onRoute = isWorkflowMarketplacePath(pathname);
  const workflows = useWorkflows();
  const { openOverview } = useWorkflowsNavigation();

  // Kept off the network until the panel is on screen; the embedded storefront is pinned to workflows,
  // so the item id is the two route segments with the `workflow` kind reattached.
  const marketplace = useEmbeddedMarketplace({
    kind: "workflow",
    basePath: MARKETPLACE_PATH,
    active: panel.isVisible,
    routeCategory: onRoute ? category : undefined,
    routeName: onRoute ? name : undefined,
    onInstalled: () => void workflows.mutate(),
  });

  useEffect(() => {
    panel.setTitle("Workflow marketplace");
  }, [panel]);

  // Remember the selected item so re-activating this tab restores it (see pathForActivePanel).
  useEffect(() => {
    if (onRoute) rememberMarketplacePath(pathname);
  }, [onRoute, pathname]);

  if (marketplace.id) {
    const id = marketplace.id;
    return (
      <MarketplaceItemDetail
        id={marketplace.id}
        data={marketplace.detail}
        isLoading={marketplace.detailLoading}
        error={marketplace.detailError}
        registryName={marketplace.registryName}
        installing={marketplace.installingId === marketplace.id}
        onRetry={marketplace.retryDetail}
        onInstall={marketplace.onInstallAs}
        onBack={() => void navigate(MARKETPLACE_PATH)}
        onOpenInstalled={marketplace.openInstalled}
        updating={marketplace.updatingId === marketplace.id}
        uninstalling={marketplace.uninstallingId === marketplace.id}
        onUpdate={() => marketplace.onUpdate(id)}
        onUninstall={() => marketplace.onUninstall(id)}
      />
    );
  }

  return (
    <ViewShell scroll={false}>
      <MarketplaceStorefront
        header={
          <div className="shrink-0 px-3 py-2 border-b border-primary">
            <WorkflowTabs
              active="marketplace"
              installedCount={(workflows.data ?? []).length}
              marketplaceCount={marketplace.count}
              onChange={tab => {
                if (tab === "installed") openOverview();
              }}
            />
          </div>
        }
        kinds={["workflow"]}
        items={marketplace.entries}
        registryName={marketplace.registryName}
        unavailableMessage={marketplace.unavailableMessage}
        isLoading={marketplace.isLoading}
        error={marketplace.error}
        refreshing={marketplace.refreshing}
        installedById={marketplace.installedById}
        installingId={marketplace.installingId}
        onRefresh={marketplace.onRefresh}
        onView={marketplace.onView}
        onInstall={marketplace.onInstall}
        fetchedAt={marketplace.fetchedAt}
        updatingId={marketplace.updatingId}
        uninstallingId={marketplace.uninstallingId}
        onUpdate={marketplace.onUpdate}
        onUninstall={marketplace.onUninstall}
      />
    </ViewShell>
  );
}
