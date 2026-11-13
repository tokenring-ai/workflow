import { beforeEach, describe, expect, it, mock } from "bun:test";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { defineView } from "@tokenring-ai/one-frontend/layout/define.ts";
import type { ViewParams } from "@tokenring-ai/one-frontend/layout/types.ts";
import { MessageSquare } from "lucide-react";
import type React from "react";
import { SWRConfig } from "swr";

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

const { default: layout } = await import("../layout.ts");
const { default: viewsModule } = await import("../views.tsx");
const { CORE_KINDS } = await import("@tokenring-ai/one-frontend/apps/kinds.ts");
const { createLayoutRegistry } = await import("@tokenring-ai/one-frontend/layout/registry.ts");
const { renderLayoutApp, renderLayoutView } = await import("@tokenring-ai/one-frontend/test/layout.tsx");
const { setNewWorkflowName } = await import("../lib/workflowState.tsx");
const { workflowNameError } = await import("../lib/drafts.ts");

function ChatStub() {
  return <p>chat stub</p>;
}

const chatView = defineView({
  id: "chat",
  kind: "agent",
  title: params => params.agentId ?? "Chat",
  icon: MessageSquare,
  route: "agent/:agentId",
  instanceKey: params => params.agentId ?? "",
  component: ChatStub,
});

const registry = createLayoutRegistry({ apps: layout.apps, views: [...viewsModule.views, chatView], kinds: [...CORE_KINDS, ...layout.kinds] });
const viewById = (id: string) => viewsModule.views.find(view => view.id === id)!;

function FreshSwr({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{children}</SWRConfig>;
}

let current: ReturnType<typeof renderLayoutApp> | null = null;

/** The whole Workflows app at a URL. */
function renderWorkflowsApp(url = "/workflows") {
  current = renderLayoutApp({ registry, url, wrapper: FreshSwr });
  return current;
}

/** One view alone in a throwaway app (the other workflow views and chat can still be opened). */
function renderWorkflowsView(viewId: string, params: ViewParams = {}) {
  current = renderLayoutView(viewById(viewId), {
    params,
    views: [viewById("workflow-editor"), viewById("workflow-create"), viewById("workflow-run-detail"), chatView],
  });
  return current;
}

const pathname = () => current?.location().pathname;
const panelOpen = (key: string) => document.querySelector(`[data-panel="${key}"]`) !== null;
/** Queries scoped to one open panel (the app also shows other panels' content). */
const inPanel = (key: string) => within(document.querySelector(`[data-panel="${key}"]`) as HTMLElement);
const hasUnsavedBadge = () => screen.queryAllByRole("img", { name: "Unsaved changes" }).length > 0;

/** Picks an editor action from its ⋯ menu. */
async function chooseAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: "More workflow actions" }));
  await user.click(await screen.findByRole("menuitem", { name }));
}

describe("Workflows app", () => {
  beforeEach(() => {
    localStorage.clear();
    setNewWorkflowName("");
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
      renderWorkflowsApp();

      const library = inPanel("workflow-library:_");
      expect(await library.findByText("Code Review")).toBeInTheDocument();
      expect(panelOpen("workflows-overview:_")).toBe(true);

      await user.click(library.getByText("All-Package Bug Hunter"));
      await waitFor(() => expect(pathname()).toBe("/workflows/bugHunter"));
      expect(panelOpen("workflow-editor:bugHunter")).toBe(true);
      // The Runs page has done its job once something is open in its place.
      expect(panelOpen("workflows-overview:_")).toBe(false);
    });

    it("runs a workflow from the sidebar without selecting it first", async () => {
      const user = userEvent.setup();
      renderWorkflowsApp();

      await user.click(await screen.findByRole("button", { name: "Run All-Package Bug Hunter" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
      // The workflow opens so the new run shows up in its editor.
      await waitFor(() => expect(pathname()).toBe("/workflows/bugHunter"));
    });

    it("watches a running workflow from the Runs page: opens its run with its agent chat beside it", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      renderWorkflowsApp();

      await user.click(await inPanel("workflows-overview:_").findByRole("button", { name: "Watch All-Package Bug Hunter run" }));
      await waitFor(() => expect(pathname()).toBe("/workflows/runs/run-1"));
      expect(panelOpen("workflow-run-detail:run-1")).toBe(true);
      await waitFor(() => expect(panelOpen("chat:agent-1")).toBe(true));
    });

    it("duplicates a workflow from its row and opens the copy", async () => {
      const user = userEvent.setup();
      renderWorkflowsApp();

      await user.click(await screen.findByRole("button", { name: "Duplicate All-Package Bug Hunter" }));
      await waitFor(() => expect(duplicateWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      await waitFor(() => expect(pathname()).toBe("/workflows/bugHunter-copy"));
    });

    it("imports a YAML file, blocking a name that is already taken", async () => {
      const user = userEvent.setup();
      renderWorkflowsApp();

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
      await waitFor(() => expect(pathname()).toBe("/workflows/bugHunter2"));
      expect(screen.queryByLabelText("Workflow name")).toBeNull();
    });

    it("shows the server's validation error in the import dialog", async () => {
      const user = userEvent.setup();
      importWorkflow.mockImplementationOnce(async () => {
        throw new Error("Invalid workflow file: agentType: Invalid input");
      });
      renderWorkflowsApp();

      await user.upload(await screen.findByTestId("workflow-import-input"), new File(["displayName: X\n"], "fresh.yml"));
      expect(await screen.findByLabelText("Workflow name")).toHaveValue("fresh");
      await user.click(screen.getByRole("button", { name: "Import" }));
      expect(await screen.findByText(/Invalid workflow file: agentType/)).toBeInTheDocument();
    });

    it("marks workflows with unsaved drafts", async () => {
      localStorage.setItem("workflows:drafts", JSON.stringify({ bugHunter: { ...bugHunter, description: "changed", steps: [] } }));
      renderWorkflowsApp();
      expect(await screen.findByTitle("Unsaved changes")).toBeInTheDocument();
    });
  });

  describe("overview", () => {
    it("shows running runs with their step, and nothing that repeats the library", async () => {
      workflowRuns = [activeRun];
      renderWorkflowsApp();

      const overview = inPanel("workflows-overview:_");
      expect(await overview.findByRole("button", { name: "Watch All-Package Bug Hunter run" })).toBeInTheDocument();
      expect(overview.getByText(/Step 2 of 2: \/agent run --type code-quality-engineer fix bugs/)).toBeInTheDocument();
      // Workflows are launched from the library, not a second grid here.
      expect(overview.queryByRole("button", { name: /^Launch / })).toBeNull();
    });

    it("opens a run from the overview", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      renderWorkflowsView("workflows-overview");
      await user.click(await screen.findByRole("button", { name: "Watch All-Package Bug Hunter run" }));
      await waitFor(() => expect(pathname()).toBe("/test/runs/run-1"));
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
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      expect((await screen.findAllByText("bugHunter.yaml")).length).toBeGreaterThan(0);
      expect(screen.getByDisplayValue("Finds and fixes bugs")).toBeInTheDocument();
      expect(screen.getByLabelText("Step 1 chat message")).toHaveValue("List all packages in the monorepo");
      expect(screen.getByLabelText("Step 2 command")).toHaveValue("agent run");
      await waitFor(() => expect(document.title).toContain("All-Package Bug Hunter"));
    });

    it("downloads the workflow as YAML", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      await chooseAction(user, "Download YAML");
      await waitFor(() => expect(exportWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      expect(downloadTextFile).toHaveBeenCalledWith("bugHunter.yaml", "name: bugHunter\n", "application/yaml");
    });

    it("edits a command step's failure handling and retries", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

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
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      await user.clear(description);
      await user.type(description, "Hunts bugs everywhere");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      expect(updateWorkflow.mock.calls[0]![0].name).toBe("bugHunter");
      expect(updateWorkflow.mock.calls[0]![0].workflow).toMatchObject({ description: "Hunts bugs everywhere" });
      expect(updateWorkflow.mock.calls[0]![0].workflow).not.toHaveProperty("installedFrom");
    });

    it("round-trips marketplace provenance when saving an installed workflow", async () => {
      const user = userEvent.setup();
      const installedFrom = {
        registry: "tokenring-ai/community",
        id: "workflow/testing/bug-hunter",
        version: "1.0.0",
        author: "TokenRing Core",
        installedAt: "2026-01-01T00:00:00.000Z",
      };
      workflowList = [{ ...bugHunter, installedFrom } as typeof bugHunter];
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      await user.type(description, "!");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      expect(updateWorkflow.mock.calls[0]![0].workflow).toMatchObject({ description: "Finds and fixes bugs!", installedFrom });
    });

    it("badges the tab while there are unsaved edits and clears it on save", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      const description = await screen.findByDisplayValue("Finds and fixes bugs");
      expect(hasUnsavedBadge()).toBe(false);
      await user.type(description, "!");
      await waitFor(() => expect(hasUnsavedBadge()).toBe(true));

      // The mocked list never changes, so model the saved version coming back from disk.
      workflowList = [{ ...bugHunter, description: "Finds and fixes bugs!" }];
      await user.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(updateWorkflow).toHaveBeenCalled());
      await waitFor(() => expect(JSON.parse(localStorage.getItem("workflows:drafts") ?? "{}").bugHunter).toBeUndefined());
      await waitFor(() => expect(hasUnsavedBadge()).toBe(false));
    });

    it("keeps edits typed while a save is in flight", async () => {
      const user = userEvent.setup();
      let finishSave!: () => void;
      updateWorkflow.mockImplementationOnce(() => new Promise(resolve => (finishSave = () => resolve({ workflow: bugHunter }))));
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

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
      expect(hasUnsavedBadge()).toBe(true);
    });

    it("deletes a workflow after confirmation and closes its panel", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      await chooseAction(user, "Delete workflow…");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
      await waitFor(() => expect(panelOpen("workflow-editor:bugHunter")).toBe(false));
    });

    it("clones the workflow into the create form", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      await chooseAction(user, "Clone");
      await waitFor(() => expect(pathname()).toBe("/test/new"));
      expect(panelOpen("workflow-create:_")).toBe(true);
      expect(JSON.parse(localStorage.getItem("workflows:drafts") ?? "{}").__new__).toMatchObject({ displayName: "All-Package Bug Hunter (copy)" });
    });

    it("shows the step an active run is on, opens its agent chat and cancels it", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      expect(await screen.findByText(/running step 2 of 2/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Cancel/ }));
      expect(cancelRun).not.toHaveBeenCalled();
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel run" }));
      await waitFor(() => expect(cancelRun).toHaveBeenCalledWith({ runId: "run-1" }));

      await user.click(screen.getAllByRole("button", { name: "Open agent" })[0]!);
      await waitFor(() => expect(panelOpen("chat:agent-1")).toBe(true));
    });

    it("runs the workflow attended or headless", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "bugHunter" });

      await chooseAction(user, "Run headless (never asks you)");
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: true }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled());
      await user.click(screen.getByRole("button", { name: "Run" }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenLastCalledWith({ name: "bugHunter", headless: false }));
    });

    it("shows a not-found state for a workflow that no longer exists", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-editor", { name: "ghost" });
      expect(await screen.findByText("Workflow not found")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Close panel" }));
      await waitFor(() => expect(panelOpen("workflow-editor:ghost")).toBe(false));
    });
  });

  describe("create", () => {
    it("creates a new workflow with a chat step and opens it", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-create");

      await user.type(await screen.findByLabelText(/^Name/), "greeter");
      await user.type(screen.getByLabelText(/Display name/), "Greeter");
      await user.selectOptions(screen.getByLabelText("Agent type"), "leader");
      await user.type(screen.getByLabelText("Step 1 chat message"), "Say hello");
      await user.click(screen.getByRole("button", { name: "Create" }));

      await waitFor(() => expect(createWorkflow).toHaveBeenCalled());
      expect(createWorkflow.mock.calls[0]![0].name).toBe("greeter");
      await waitFor(() => expect(panelOpen("workflow-create:_")).toBe(false));
      expect(panelOpen("workflow-editor:greeter")).toBe(true);
      expect(pathname()).toBe("/test/greeter");
    });
  });

  describe("create form guidance", () => {
    it("lists everything that still blocks Create", async () => {
      const user = userEvent.setup();
      renderWorkflowsView("workflow-create");

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
      const first = renderWorkflowsView("workflow-create");
      await user.click(await screen.findByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(panelOpen("workflow-create:_")).toBe(false));
      first.unmount();

      renderWorkflowsView("workflow-create");
      await user.type(await screen.findByLabelText(/Display name/), "Greeter");
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(panelOpen("workflow-create:_")).toBe(true);
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep editing" }));
      expect(screen.getByLabelText(/Display name/)).toHaveValue("Greeter");

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard" }));
      await waitFor(() => expect(panelOpen("workflow-create:_")).toBe(false));
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
      renderWorkflowsView("workflow-create");

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
    it("opens a finished run's detail panel", async () => {
      const user = userEvent.setup();
      workflowRuns = [{ ...activeRun, status: "completed", agentId: null, finishedAt: 1_700_000_100_000 }];
      renderWorkflowsView("workflow-runs");

      await user.click(await screen.findByRole("button", { name: "Open workflow run All-Package Bug Hunter" }));
      await waitFor(() => expect(pathname()).toBe("/test/runs/run-1"));
      expect(panelOpen("workflow-run-detail:run-1")).toBe(true);
    });

    it("opens an active run's agent chat instead", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      renderWorkflowsView("workflow-runs");
      await user.click(await screen.findByRole("button", { name: "Open workflow run All-Package Bug Hunter" }));
      await waitFor(() => expect(panelOpen("chat:agent-1")).toBe(true));
    });
  });

  describe("run detail", () => {
    it("shows the run's progress, opens its chat and cancels it", async () => {
      const user = userEvent.setup();
      workflowRuns = [activeRun];
      renderWorkflowsApp("/workflows/runs/run-1");

      const detail = inPanel("workflow-run-detail:run-1");
      expect(await detail.findByText(/Step 2 of 2/)).toBeInTheDocument();
      await waitFor(() => expect(document.title).toContain("All-Package Bug Hunter"));
      // The run's agent chat is attached beside the run.
      await waitFor(() => expect(panelOpen("chat:agent-1")).toBe(true));

      await user.click(detail.getByRole("button", { name: /Cancel/ }));
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
      renderWorkflowsApp("/workflows/runs/run-1");

      const steps = within(await inPanel("workflow-run-detail:run-1").findByRole("region", { name: "Workflow run progress" })).getAllByRole("listitem");
      expect(within(steps[0]!).getByText(/^Took 42/)).toBeInTheDocument();
      expect(within(steps[1]!).getByText(/^Took 3/)).toBeInTheDocument();
      expect(inPanel("workflow-run-detail:run-1").queryByRole("button", { name: /Cancel/ })).toBeNull();

      await user.click(inPanel("workflow-run-detail:run-1").getByRole("button", { name: /Re-run/ }));
      await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
    });

    it("does not offer a re-run while the run is still going", async () => {
      workflowRuns = [activeRun];
      renderWorkflowsApp("/workflows/runs/run-1");
      const detail = inPanel("workflow-run-detail:run-1");
      expect(await detail.findByText(/Step 2 of 2/)).toBeInTheDocument();
      expect(detail.queryByRole("button", { name: /Re-run/ })).toBeNull();
    });

    it("shows a not-found state for an unknown run", async () => {
      renderWorkflowsView("workflow-run-detail", { runId: "nope" });
      expect(await screen.findByText("Run not found")).toBeInTheDocument();
    });
  });

  describe("marketplace", () => {
    it("sends Browse marketplace to the Marketplace app", async () => {
      const user = userEvent.setup();
      renderWorkflowsApp("/workflows");
      await user.click(await screen.findByRole("button", { name: "Browse marketplace" }));
      expect(pathname()).toBe("/marketplace/workflow");
    });
  });

  describe("name validation", () => {
    it("rejects names that collide with app routes", () => {
      expect(workflowNameError("new")).toMatch(/reserved/);
      expect(workflowNameError("Marketplace")).toMatch(/reserved/);
      expect(workflowNameError("newsletter")).toBeNull();
      expect(workflowNameError("-bad")).toMatch(/letters, numbers/);
      expect(workflowNameError("")).toBeNull();
    });
  });

  describe("layout", () => {
    it("keeps the old dashboard's identity and can host agent chats", () => {
      expect(layout.apps[0]).toMatchObject({
        id: "workflows",
        path: "/workflows",
        label: "Workflows",
        group: "Build",
        shortLabel: "WF",
        defaultPinned: true,
        gradient: "from-cyan-500 to-teal-600",
      });
      expect(layout.apps[0]!.views).toContain("chat");
    });

    it("keeps every URL", () => {
      const at = (path: string) => registry.routes.resolve(path);
      expect(at("/workflows")?.viewId).toBe("workflows-overview");
      expect(at("/workflows/new")?.viewId).toBe("workflow-create");
      expect(at("/workflows/bugHunter")).toMatchObject({ viewId: "workflow-editor", params: { name: "bugHunter" } });
      expect(at("/workflows/runs/run-1")).toMatchObject({ viewId: "workflow-run-detail", params: { runId: "run-1" } });
    });

    it("opens the workflow named by the URL beside the library", async () => {
      renderWorkflowsApp("/workflows/bugHunter");
      expect((await screen.findAllByText("bugHunter.yaml")).length).toBeGreaterThan(0);
      expect(panelOpen("workflow-library:_")).toBe(true);
      expect(panelOpen("workflow-editor:bugHunter")).toBe(true);
    });
  });
});
