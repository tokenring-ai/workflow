import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getPanelBadge } from "@tokenring-ai/one-frontend/dock/panelBadges.ts";
import type { ViewDefinition, ViewParams } from "@tokenring-ai/one-frontend/dock/types.ts";
import { createFakeDashboardApi, createFakePanelHandle, type FakeDashboardApi, renderView } from "@tokenring-ai/one-frontend/test/dock.tsx";
import type React from "react";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

void mock.module("@monaco-editor/react", () => ({
  default: ({ value, onChange }: { value: string; onChange?: (v: string | undefined) => void }) => (
    <textarea aria-label="Workflow YAML editor" value={value} onChange={e => onChange?.(e.target.value)} />
  ),
}));

const bugHunter = {
  name: "bugHunter",
  displayName: "All-Package Bug Hunter",
  category: "Code Review",
  description: "Finds and fixes bugs",
  agentType: "leader",
  steps: ["List all packages in the monorepo", { command: "agent run", arguments: { type: "code-quality-engineer" }, remainder: "fix bugs" }],
  subAgent: {
    forwardChatOutput: false,
    forwardStatusMessages: true,
    forwardSystemOutput: false,
    forwardHumanRequests: true,
    forwardReasoning: false,
    forwardInputCommands: true,
    timeout: 0,
    maxResponseLength: 10000,
    minContextLength: 1000,
  },
  updatedAt: "2026-07-01T12:00:00.000Z",
};

type SaveArgs = { name: string; workflow: Omit<typeof bugHunter, "name" | "updatedAt"> };

const createWorkflow = mock(async (_args: SaveArgs) => ({ workflow: bugHunter }));
const updateWorkflow = mock(async (_args: SaveArgs) => ({ workflow: bugHunter }));
const deleteWorkflow = mock(async (_args: { name: string }) => ({ success: true }));
const spawnWorkflow = mock(async (_args: { name: string; headless: boolean }) => ({ id: "agent-1", displayName: "Leader", description: "" }));
const cancelRun = mock(async (_args: { runId: string }) => ({ success: true }));
const getWorkflow = mock(async (_args: { name: string }) => ({ workflow: bugHunter }));
const mutateWorkflows = mock(async () => undefined);
const exportWorkflow = mock(async (_args: { name: string }) => ({ fileName: "bugHunter.yaml", yaml: "name: bugHunter\n" }));
const importWorkflow = mock(async (args: { yaml: string; name?: string }) => ({ workflow: { ...bugHunter, name: args.name ?? "imported" } }));
const duplicateWorkflow = mock(async (_args: { name: string; newName?: string }) => ({ workflow: { ...bugHunter, name: "bugHunter-copy" } }));
const downloadTextFile = mock((_fileName: string, _content: string, _mimeType: string) => {});

const realTranscriptExport = await import("@tokenring-ai/one-frontend/lib/transcriptExport.ts");
void mock.module("@tokenring-ai/one-frontend/lib/transcriptExport.ts", () => ({ ...realTranscriptExport, downloadTextFile }));

const activeRun: { agentId: string | null; status: string; [key: string]: unknown } = {
  id: "run-1",
  workflowName: "bugHunter",
  displayName: "All-Package Bug Hunter",
  agentType: "leader",
  agentId: "agent-1",
  steps: bugHunter.steps,
  currentStep: 1,
  status: "running",
  message: "",
  startedAt: 1_700_000_000_000,
  finishedAt: null,
};

let workflowRuns: (typeof activeRun)[] = [];
let workflowList: (typeof bugHunter)[] = [bugHunter];

const sampleCommands = [
  { name: "chat", description: "Send a chat message", inputSchema: { remainder: { name: "message", description: "Message to send", required: true } } },
  {
    name: "agent run",
    description: "Run an agent with a message",
    inputSchema: {
      args: { type: { type: "string", description: "Agent type", required: true }, bg: { type: "flag", description: "Background" } },
      remainder: { name: "message", description: "Message", required: true },
    },
  },
];

const marketplaceEntry = {
  kind: "workflow" as const,
  id: "workflow/testing/coverage-sweep",
  installAs: "coverageSweep",
  displayName: "Coverage Sweep",
  description: "Finds untested code and adds tests",
  category: "Testing",
  author: "TokenRing Core",
  tags: ["testing", "coverage"],
  version: "1.0.0",
  updatedAt: "2026-08-17",
  icon: "🧪",
  requiresPlugins: [],
};

const installMarketplaceItem = mock(async (args: { id: string; installAs?: string }) => ({
  kind: "workflow" as const,
  name: args.installAs ?? "coverageSweep",
}));
const marketplaceListData: Record<string, unknown> = {
  status: "success",
  registryName: "tokenring-ai/community",
  fetchedAt: 0,
  items: [marketplaceEntry],
  installed: {},
};
const marketplaceItemData: Record<string, unknown> = {
  entry: marketplaceEntry,
  marketplace: { version: "1.0.0", author: "TokenRing Core", readme: "Adds the tests you are missing." },
  kind: "workflow",
  item: {
    displayName: "Coverage Sweep",
    description: "Finds untested code and adds tests",
    category: "Testing",
    agentType: "test-engineer",
    steps: ["Find untested code", { command: "agent run", arguments: { type: "test-engineer" }, remainder: "add tests" }],
  },
  installedAs: null,
  existingNames: [],
};

void mock.module("@tokenring-ai/one-frontend/rpc.ts", () => ({
  useWorkflows: () => ({ data: workflowList, isLoading: false, mutate: mutateWorkflows }),
  useMarketplaceItems: (enabled: boolean) => ({
    data: enabled ? marketplaceListData : undefined,
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  useMarketplaceItem: (id: string | null | undefined) => ({
    data: id ? marketplaceItemData : undefined,
    isLoading: false,
    error: undefined,
    mutate: mock(async () => undefined),
  }),
  marketplaceRPCClient: { installMarketplaceItem, listMarketplaceItems: mock(async () => marketplaceListData) },
  useWorkflowRuns: () => ({ data: { status: "success", runs: workflowRuns }, isLoading: false }),
  useAgentList: () => ({ data: [], isLoading: false, mutate: mock() }),
  useAgentTypes: () => ({ data: [{ type: "leader", displayName: "Leader", description: "", category: "General", enabledTools: [] }], isLoading: false }),
  useAvailableCommands: () => ({ data: sampleCommands, isLoading: false }),
  useTypedSWR: () => ({ data: { directory: "/project/.tokenring/workflows" }, isLoading: false }),
  workflowRPCClient: {
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    spawnWorkflow,
    cancelRun,
    getWorkflow,
    exportWorkflow,
    importWorkflow,
    duplicateWorkflow,
  },
}));

const { default: contribution } = await import("../app.tsx");
const { setNewWorkflowName } = await import("../lib/workflowsShared.tsx");
const { resetMarketplacePath } = await import("../lib/paths.ts");
const { workflowNameError } = await import("../lib/drafts.ts");

const ROUTES = ["/workflows/marketplace/:category?/:name?", "/workflows/runs/:runId", "/workflows/:workflowName?"];
const viewById = (id: string) => contribution.views.find(view => view.id === id) as ViewDefinition<any>;
const getView = (id: string) => contribution.views.find(view => view.id === id);
const dashboard = contribution.dashboards[0]!;

function fakeApi(): FakeDashboardApi {
  return createFakeDashboardApi({ dashboardId: "workflows", getView });
}

function renderWorkflowsView(viewId: string, params: ViewParams = {}, path = "/workflows", api = fakeApi()) {
  const panel = createFakePanelHandle({ viewId, dashboardId: "workflows", panelId: viewId, params });
  return renderView(viewById(viewId), params, { api, panel, path, routes: ROUTES });
}

const pathname = () => screen.getByTestId("pathname").textContent;

describe("Workflows dashboard views", () => {
  beforeEach(() => {
    localStorage.clear();
    setNewWorkflowName("");
    resetMarketplacePath();
    for (const fn of [
      createWorkflow,
      updateWorkflow,
      deleteWorkflow,
      spawnWorkflow,
      cancelRun,
      installMarketplaceItem,
      exportWorkflow,
      importWorkflow,
      duplicateWorkflow,
      downloadTextFile,
    ])
      fn.mockClear();
    workflowRuns = [];
    workflowList = [bugHunter];
  });

  describe("library", () => {
    it("groups workflows by category and opens one when clicked", async () => {
      const user = userEvent.setup();
      const { api } = renderWorkflowsView("workflow-library");

      expect(await screen.findByText("Code Review")).toBeInTheDocument();
      expect(screen.getByText("No active workflows")).toBeInTheDocument();

      await user.click(screen.getByText("All-Package Bug Hunter"));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "workflow-editor", params: { name: "bugHunter" } })]);
      expect(pathname()).toBe("/workflows/bugHunter");
    });

    it("runs a workflow from the sidebar without selecting it first", async () => {
      const user = userEvent.setup();
      const { api } = renderWorkflowsView("workflow-library");

      await user.click(await screen.findByRole("button", { name: "Run All-Package Bug Hunter" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
      // The workflow opens so the new run shows up in its editor.
      await waitFor(() => expect(api.opened.at(-1)).toMatchObject({ viewId: "workflow-editor", params: { name: "bugHunter" } }));
    });

    it("watches a running workflow: opens its run panel and docks its agent chat", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      const { api } = renderWorkflowsView("workflow-library");

      await user.click(await screen.findByRole("button", { name: "Watch All-Package Bug Hunter run" }));
      expect(api.opened.map(open => [open.viewId, open.params])).toEqual([
        ["workflow-run-detail", { runId: "run-1" }],
        ["chat", { agentId: "agent-1" }],
      ]);
      expect(pathname()).toBe("/workflows/runs/run-1");
    });

    it("duplicates a workflow from its row and opens the copy", async () => {
      const user = userEvent.setup();
      const { api } = renderWorkflowsView("workflow-library");

      await user.click(await screen.findByRole("button", { name: "Duplicate All-Package Bug Hunter" }));
      await waitFor(() => expect(duplicateWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      await waitFor(() => expect(api.opened.at(-1)).toMatchObject({ viewId: "workflow-editor", params: { name: "bugHunter-copy" } }));
    });

    it("imports a YAML file, blocking a name that is already taken", async () => {
      const user = userEvent.setup();
      const { api } = renderWorkflowsView("workflow-library");

      const yaml = "name: bugHunter\ndisplayName: Imported\nagentType: leader\nsteps:\n  - hello\n";
      await user.upload(await screen.findByTestId("workflow-import-input"), new File([yaml], "bugHunter.yaml", { type: "application/yaml" }));

      const nameField = await screen.findByLabelText("Workflow name");
      expect(nameField).toHaveValue("bugHunter");
      expect(screen.getByText('A workflow named "bugHunter" already exists.')).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

      await user.clear(nameField);
      await user.type(nameField, "bugHunter2");
      await user.click(screen.getByRole("button", { name: "Import" }));

      await waitFor(() => expect(importWorkflow).toHaveBeenCalledWith({ yaml, name: "bugHunter2" }));
      await waitFor(() => expect(api.opened.at(-1)).toMatchObject({ viewId: "workflow-editor", params: { name: "bugHunter2" } }));
      expect(screen.queryByLabelText("Workflow name")).toBeNull();
    });

    it("shows the server's validation error in the import dialog", async () => {
      const user = userEvent.setup();
      importWorkflow.mockImplementationOnce(async () => {
        throw new Error("Invalid workflow file: agentType: Invalid input");
      });
      renderWorkflowsView("workflow-library");

      await user.upload(await screen.findByTestId("workflow-import-input"), new File(["displayName: X\n"], "fresh.yml"));
      expect(await screen.findByLabelText("Workflow name")).toHaveValue("fresh");
      await user.click(screen.getByRole("button", { name: "Import" }));
      expect(await screen.findByText(/Invalid workflow file: agentType/)).toBeInTheDocument();
    });

    it("marks workflows with unsaved drafts", async () => {
      localStorage.setItem("workflows:drafts", JSON.stringify({ bugHunter: { ...bugHunter, description: "changed", steps: [] } }));
      renderWorkflowsView("workflow-library");
      expect(await screen.findByTitle("Unsaved changes")).toBeInTheDocument();
    });
  });

  describe("overview", () => {
    it("shows running workflows and launches from the grid", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      const { api } = renderWorkflowsView("workflows-overview");

      expect(await screen.findByText("Running workflows")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Watch All-Package Bug Hunter run" })).toBeInTheDocument();
      expect(screen.getByText(/Step 2 of 2: \/agent run --type code-quality-engineer fix bugs/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Launch All-Package Bug Hunter" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));

      await user.click(screen.getByRole("button", { name: "Watch All-Package Bug Hunter run" }));
      expect(api.opened.some(open => open.viewId === "workflow-run-detail")).toBe(true);
    });

    it("shows an empty state pointing at the workflow directory when nothing is installed", async () => {
      workflowList = [];
      renderWorkflowsView("workflows-overview");
      expect(await screen.findByText("No workflows yet")).toBeInTheDocument();
      expect(screen.getByText("/project/.tokenring/workflows")).toBeInTheDocument();
      expect(screen.getByText(/Launching one starts a new agent/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Browse the marketplace/ })).toBeInTheDocument();
    });
  });

  describe("editor", () => {
    it("shows a workflow's steps and settings", async () => {
      const { panel } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      expect((await screen.findAllByText("bugHunter.yaml")).length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("Finds and fixes bugs")).toBeInTheDocument();
      expect(screen.getByLabelText("Step 1 chat message")).toHaveValue("List all packages in the monorepo");
      expect(screen.getByLabelText("Step 2 command")).toHaveValue("agent run");
      await waitFor(() => expect(panel.title).toBe("All-Package Bug Hunter"));
    });

    it("downloads the workflow as YAML", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      await user.click(await screen.findByRole("button", { name: "Download workflow YAML" }));
      await waitFor(() => expect(exportWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      expect(downloadTextFile).toHaveBeenCalledWith("bugHunter.yaml", "name: bugHunter\n", "application/yaml");
    });

    it("edits a command step's failure handling and retries", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      await user.selectOptions(await screen.findByLabelText("Step 2 on failure"), "continue");
      const retries = screen.getByLabelText("Step 2 retries");
      await user.clear(retries);
      await user.type(retries, "3");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      expect(updateWorkflow.mock.calls[0]![0].workflow.steps[1] as unknown).toEqual({
        command: "agent run",
        arguments: { type: "code-quality-engineer" },
        remainder: "fix bugs",
        onError: "continue",
        retries: 3,
      });
    });

    it("saves edits to an existing workflow", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      await user.clear(description);
      await user.type(description, "Hunts bugs everywhere");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      expect(updateWorkflow.mock.calls[0]![0].name).toBe("bugHunter");
      expect(updateWorkflow.mock.calls[0]![0].workflow).toMatchObject({ description: "Hunts bugs everywhere" });
    });

    it("badges the tab while there are unsaved edits and clears it on save", async () => {
      const user = userEvent.setup();
      const { panel } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      expect(getPanelBadge(panel.panelId)).toBeNull();
      await user.type(description, "!");
      await waitFor(() => expect(getPanelBadge(panel.panelId)).toMatchObject({ title: "Unsaved changes", tone: "warning" }));

      // The mocked list never changes, so model the saved version coming back from disk.
      workflowList = [{ ...bugHunter, description: "Finds and fixes bugs!" }];
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      await waitFor(() => expect(JSON.parse(localStorage.getItem("workflows:drafts") ?? "{}").bugHunter).toBeUndefined());
      await waitFor(() => expect(getPanelBadge(panel.panelId)).toBeNull());
    });

    it("keeps edits typed while a save is in flight", async () => {
      const user = userEvent.setup();
      let finishSave!: () => void;
      updateWorkflow.mockImplementationOnce(() => new Promise(resolve => (finishSave = () => resolve({ workflow: bugHunter }))));
      const { panel } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      await user.type(description, " one");
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      expect(updateWorkflow.mock.calls[0]![0].workflow).toMatchObject({ description: "Finds and fixes bugs one" });

      await user.type(description, " two");
      finishSave();

      await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
      expect(JSON.parse(localStorage.getItem("workflows:drafts") ?? "{}").bugHunter).toMatchObject({ description: "Finds and fixes bugs one two" });
      expect(description).toHaveValue("Finds and fixes bugs one two");
      expect(getPanelBadge(panel.panelId)).toMatchObject({ tone: "warning" });
    });

    it("deletes a workflow after confirmation and closes its panel", async () => {
      const user = userEvent.setup();
      const { api, panel } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      await user.click(await screen.findByRole("button", { name: "Delete workflow" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      await waitFor(() => expect(panel.closed).toBe(true));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "workflows-overview" })]);
    });

    it("clones the workflow into the create form", async () => {
      const user = userEvent.setup();
      const { api } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      await user.click(await screen.findByRole("button", { name: /Clone/ }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "workflow-create" })]);
      expect(pathname()).toBe("/workflows/new");
      expect(JSON.parse(localStorage.getItem("workflows:drafts") ?? "{}").__new__).toMatchObject({ displayName: "All-Package Bug Hunter (copy)" });
    });

    it("shows the step an active run is on, opens its agent chat and cancels it", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      const { api } = renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      expect(await screen.findByText(/running step 2 of 2/)).toBeInTheDocument();
      await user.click(screen.getAllByRole("button", { name: "Open agent" })[0]!);
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "chat", params: { agentId: "agent-1" } })]);

      await user.click(screen.getByRole("button", { name: /Cancel/ }));
      expect(cancelRun).not.toHaveBeenCalled();
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel run" }));
      await waitFor(() => expect(cancelRun).toHaveBeenCalledWith({ runId: "run-1" }));
    });

    it("runs the workflow attended or headless", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" }, "/workflows/bugHunter");

      await user.click(await screen.findByRole("button", { name: "Run headless" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: true }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled());
      await user.click(screen.getByRole("button", { name: "Run" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenLastCalledWith({ name: "bugHunter", headless: false }));
    });

    it("shows a not-found state for a workflow that no longer exists", async () => {
      const user = userEvent.setup();
      const { panel } = renderWorkflowsView("workflow-editor", { name: "ghost" }, "/workflows/ghost");
      expect(await screen.findByText("Workflow not found")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close panel" }));
      expect(panel.closed).toBe(true);
    });
  });

  describe("create", () => {
    it("creates a new workflow with a chat step and opens it", async () => {
      const user = userEvent.setup();
      const { api, panel } = renderWorkflowsView("workflow-create", {}, "/workflows/new");

      await user.type(await screen.findByLabelText(/^Name/), "greeter");
      await user.type(screen.getByLabelText(/Display name/), "Greeter");
      await user.selectOptions(screen.getByLabelText("Agent type"), "leader");
      await user.type(screen.getByLabelText("Step 1 chat message"), "Say hello");
      await user.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => expect(createWorkflow).toHaveBeenCalled());
      expect(createWorkflow.mock.calls[0]![0].name).toBe("greeter");
      await waitFor(() => expect(panel.closed).toBe(true));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "workflow-editor", params: { name: "greeter" } })]);
      expect(pathname()).toBe("/workflows/greeter");
    });
  });

  describe("create form guidance", () => {
    it("lists everything that still blocks Create", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-create", {}, "/workflows/new");

      const checklist = await screen.findByRole("status");
      for (const item of ["A name", "A display name", "An agent type", "At least one step"]) expect(within(checklist).getByText(item)).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Name/), "greeter");
      await user.type(screen.getByLabelText(/Display name/), "Greeter");
      expect(within(checklist).queryByText("A display name")).toBeNull();
      expect(within(checklist).getByText("An agent type")).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Agent type"), "leader");
      await user.type(screen.getByLabelText("Step 1 chat message"), "Say hello");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled();
    });

    it("closes an untouched form at once but confirms before discarding a filled one", async () => {
      const user = userEvent.setup();
      const first = renderWorkflowsView("workflow-create", {}, "/workflows/new");
      await user.click(await screen.findByRole("button", { name: "Cancel" }));
      expect(first.panel.closed).toBe(true);
      first.unmount();

      const second = renderWorkflowsView("workflow-create", {}, "/workflows/new");
      await user.type(await screen.findByLabelText(/Display name/), "Greeter");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(second.panel.closed).toBe(false);
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep editing" }));
      expect(screen.getByLabelText(/Display name/)).toHaveValue("Greeter");

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
      expect(second.panel.closed).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects names that collide with dashboard routes", () => {
      expect(workflowNameError("new")).toMatch(/reserved/);
      expect(workflowNameError("Marketplace")).toMatch(/reserved/);
      expect(workflowNameError("newsletter")).toBeNull();
      expect(workflowNameError("-bad")).toMatch(/letters, numbers/);
      expect(workflowNameError("")).toBeNull();
    });

    it("blocks creating a workflow with a reserved name", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-create", {}, "/workflows/new");

      await user.type(await screen.findByLabelText(/^Name/), "marketplace");
      await user.type(screen.getByLabelText(/Display name/), "Shop");
      await user.selectOptions(screen.getByLabelText("Agent type"), "leader");
      await user.type(screen.getByLabelText("Step 1 chat message"), "Say hello");

      expect(screen.getByText(/"marketplace" is reserved/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
      await user.keyboard("{Control>}s{/Control}");
      expect(createWorkflow).not.toHaveBeenCalled();
    });
  });

  describe("runs widget", () => {
    it("opens a finished run's detail panel even when the URL already names its workflow", async () => {
      const user = userEvent.setup();
      workflowRuns = [{ ...activeRun, status: "completed", agentId: null, finishedAt: 1_700_000_100_000 }];
      const { api } = renderWorkflowsView("workflow-runs", {}, "/workflows/bugHunter");

      await user.click(await screen.findByRole("button", { name: "Open workflow run All-Package Bug Hunter" }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "workflow-run-detail", params: { runId: "run-1" } })]);
      expect(pathname()).toBe("/workflows/runs/run-1");
    });
  });

  describe("run detail", () => {
    it("shows the run's progress, opens its chat and cancels it", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      const { api, panel } = renderWorkflowsView("workflow-run-detail", { runId: "run-1" }, "/workflows/runs/run-1");

      expect(await screen.findByText(/Step 2 of 2/)).toBeInTheDocument();
      await waitFor(() => expect(panel.title).toBe("All-Package Bug Hunter"));

      await user.click(screen.getByRole("button", { name: "Chat" }));
      expect(api.opened).toEqual([expect.objectContaining({ viewId: "chat", params: { agentId: "agent-1" } })]);

      await user.click(screen.getByRole("button", { name: /Cancel/ }));
      expect(cancelRun).not.toHaveBeenCalled();
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel run" }));
      await waitFor(() => expect(cancelRun).toHaveBeenCalledWith({ runId: "run-1" }));
    });

    it("re-runs a finished run and shows how long each step took", async () => {
      const user = userEvent.setup();
      workflowRuns = [
        {
          ...activeRun,
          status: "failed",
          message: "Step 2 failed",
          finishedAt: 1_700_000_100_000,
          stepRecords: [
            { label: "one", status: "done", startedAt: 1_700_000_000_000, finishedAt: 1_700_000_042_000, output: "" },
            { label: "two", status: "failed", startedAt: 1_700_000_042_000, finishedAt: 1_700_000_045_000, output: "boom" },
          ],
        },
      ];
      renderWorkflowsView("workflow-run-detail", { runId: "run-1" }, "/workflows/runs/run-1");

      const steps = within(await screen.findByRole("region", { name: "Workflow run progress" })).getAllByRole("listitem");
      expect(within(steps[0]!).getByText(/^Took 42/)).toBeInTheDocument();
      expect(within(steps[1]!).getByText(/^Took 3/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Cancel/ })).toBeNull();

      await user.click(screen.getByRole("button", { name: /Re-run/ }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
    });

    it("does not offer a re-run while the run is still going", async () => {
      workflowRuns = [activeRun];
      renderWorkflowsView("workflow-run-detail", { runId: "run-1" }, "/workflows/runs/run-1");
      expect(await screen.findByText(/Step 2 of 2/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Re-run/ })).toBeNull();
    });

    it("shows a not-found state for an unknown run", async () => {
      renderWorkflowsView("workflow-run-detail", { runId: "nope" }, "/workflows/runs/nope");
      expect(await screen.findByText("Run not found")).toBeInTheDocument();
    });
  });

  describe("marketplace", () => {
    it("lists registry workflows and installs one from a card", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-marketplace", {}, "/workflows/marketplace");

      expect(await screen.findByText("Coverage Sweep")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Install Coverage Sweep" }));
      await waitFor(() => expect(installMarketplaceItem).toHaveBeenCalledWith({ id: "workflow/testing/coverage-sweep" }));
    });

    it("previews a workflow's agent and steps on its detail page", async () => {
      renderWorkflowsView("workflow-marketplace", {}, "/workflows/marketplace/testing/coverage-sweep");
      expect(await screen.findByText("Adds the tests you are missing.")).toBeInTheDocument();
      expect(screen.getByText("test-engineer")).toBeInTheDocument();
    });

    it("restores the selected item when the marketplace tab is re-activated", async () => {
      renderWorkflowsView("workflow-marketplace", {}, "/workflows/marketplace/testing/coverage-sweep");
      expect(await screen.findByText("Adds the tests you are missing.")).toBeInTheDocument();

      // Another tab took the URL; switching back must not drop the item.
      const elsewhere = { pathname: "/workflows/bugHunter", params: { workflowName: "bugHunter" }, searchParams: new URLSearchParams() };
      const panel = { panelId: "workflow-marketplace", viewId: "workflow-marketplace", params: {} };
      expect(dashboard.pathForActivePanel?.(panel, elsewhere)).toBe("/workflows/marketplace/testing/coverage-sweep");
    });
  });

  describe("dashboard definition", () => {
    it("opens the panel named by the route in the main area", () => {
      const api = fakeApi();
      api.panels.push({ panelId: "workflow-library", viewId: "workflow-library", params: {}, title: "Workflows" });
      const match = (pathname: string, params: Record<string, string | undefined>) => ({ pathname, params, searchParams: new URLSearchParams() });

      dashboard.onNavigate?.(match("/workflows", {}), api);
      dashboard.onNavigate?.(match("/workflows/bugHunter", { workflowName: "bugHunter" }), api);
      dashboard.onNavigate?.(match("/workflows/new", { workflowName: "new" }), api);
      dashboard.onNavigate?.(match("/workflows/runs/run-1", { runId: "run-1" }), api);
      dashboard.onNavigate?.(match("/workflows/marketplace", {}), api);

      expect(api.opened.map(open => [open.viewId, open.params])).toEqual([
        ["workflows-overview", {}],
        ["workflow-editor", { name: "bugHunter" }],
        ["workflow-create", {}],
        ["workflow-run-detail", { runId: "run-1" }],
        ["workflow-marketplace", {}],
      ]);
      expect(api.opened[0]!.options).toMatchObject({ position: "right", referencePanelId: "workflow-library" });
      expect(api.opened[1]!.options).toMatchObject({ position: "tab", referencePanelId: "workflows-overview" });
    });

    it("maps the active panel back to a URL", () => {
      const match = { pathname: "/workflows", params: {}, searchParams: new URLSearchParams() };
      const path = (viewId: string, params: ViewParams = {}) => dashboard.pathForActivePanel?.({ panelId: viewId, viewId, params }, match);
      expect(path("workflow-editor", { name: "bugHunter" })).toBe("/workflows/bugHunter");
      expect(path("workflow-create")).toBe("/workflows/new");
      expect(path("workflow-run-detail", { runId: "run-1" })).toBe("/workflows/runs/run-1");
      expect(path("workflow-marketplace")).toBe("/workflows/marketplace");
      expect(path("workflows-overview")).toBe("/workflows");
      expect(path("workflow-library")).toBeNull();
      expect(path("workflow-runs")).toBeNull();
    });
  });
});
