import { beforeEach, describe, expect, it, mock } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const PassThroughFocusTrap = ({ children }: { children: React.ReactNode }) => children;
void mock.module("focus-trap-react", () => ({ FocusTrap: PassThroughFocusTrap, default: PassThroughFocusTrap }));

void mock.module("@tokenring-ai/one-frontend/components/chat/ChatDock.tsx", () => ({
  default: ({
    agentId,
    extraAttachments,
    children,
  }: {
    agentId: string | null;
    extraAttachments?: { id: string; label: string }[];
    children?: React.ReactNode;
  }) => (
    <div data-testid="chat-dock">
      {agentId ? <span>Chat with {agentId}</span> : <span>No docked agent</span>}
      {extraAttachments?.map(extra => (
        <span key={extra.id}>{extra.label}</span>
      ))}
      {children}
    </div>
  ),
}));

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
  steps: [
    "List all packages in the monorepo",
    {
      command: "agent run",
      arguments: { type: "code-quality-engineer" },
      remainder: "fix bugs",
    },
  ],
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
const mutateWorkflows = mock(async () => undefined);

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

const sampleCommands = [
  {
    name: "chat",
    description: "Send a chat message",
    inputSchema: {
      remainder: { name: "message", description: "Message to send", required: true },
    },
  },
  {
    name: "agent run",
    description: "Run an agent with a message",
    inputSchema: {
      args: {
        type: { type: "string", description: "Agent type", required: true },
        bg: { type: "flag", description: "Background" },
      },
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
const listMarketplaceItems = mock(async (_args: { refresh: boolean }) => marketplaceListData);
const mutateMarketplaceItems = mock(async (..._args: unknown[]) => undefined);
const mutateMarketplaceItem = mock(async () => undefined);

let marketplaceListData: Record<string, unknown> = {
  status: "success",
  registryName: "tokenring-ai/community",
  fetchedAt: 0,
  items: [marketplaceEntry],
  installed: {},
};
let marketplaceItemData: Record<string, unknown> | undefined = {
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
  useWorkflows: () => ({ data: [bugHunter], isLoading: false, mutate: mutateWorkflows }),
  useMarketplaceItems: (enabled: boolean) => ({
    data: enabled ? marketplaceListData : undefined,
    isLoading: false,
    error: undefined,
    mutate: mutateMarketplaceItems,
  }),
  useMarketplaceItem: (id: string | null | undefined) => ({
    data: id ? marketplaceItemData : undefined,
    isLoading: false,
    error: undefined,
    mutate: mutateMarketplaceItem,
  }),
  marketplaceRPCClient: { installMarketplaceItem, listMarketplaceItems },
  useWorkflowRuns: () => ({ data: { status: "success", runs: workflowRuns }, isLoading: false }),
  useAgentList: () => ({ data: [], isLoading: false, mutate: mock() }),
  useAgentTypes: () => ({ data: [{ type: "leader", displayName: "Leader", description: "", category: "General", enabledTools: [] }], isLoading: false }),
  useAvailableCommands: () => ({ data: sampleCommands, isLoading: false }),
  useTypedSWR: () => ({ data: { directory: "/project/.tokenring/workflows" }, isLoading: false }),
  workflowRPCClient: { createWorkflow, updateWorkflow, deleteWorkflow, spawnWorkflow, cancelRun },
}));

const { default: WorkflowsApp } = await import("./WorkflowsApp.tsx");

function renderApp(initialPath = "/workflows") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/workflows/marketplace/:category?/:name?" element={<WorkflowsApp />} />
        <Route path="/workflows/:workflowName?" element={<WorkflowsApp />} />
        <Route path="/agent/:agentId" element={<div>Agent page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Workflow names and run status appear in both panes, so most queries are scoped. */
const sidebar = () => within(screen.getByRole("complementary", { name: "Workflows and runs" }));
const detailPane = () => within(screen.getByRole("region", { name: "Workflows workspace" }));

describe("WorkflowsApp", () => {
  beforeEach(() => {
    createWorkflow.mockClear();
    updateWorkflow.mockClear();
    deleteWorkflow.mockClear();
    spawnWorkflow.mockClear();
    cancelRun.mockClear();
    installMarketplaceItem.mockClear();
    listMarketplaceItems.mockClear();
    workflowRuns = [];
    marketplaceListData = {
      status: "success",
      registryName: "tokenring-ai/community",
      fetchedAt: 0,
      items: [marketplaceEntry],
      installed: {},
    };
    marketplaceItemData = {
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
  });

  it("groups workflows by category and shows the installed overview", () => {
    renderApp();

    expect(sidebar().getByText("Code Review")).toBeInTheDocument();
    expect(sidebar().getByText("All-Package Bug Hunter")).toBeInTheDocument();
    expect(sidebar().getByText("No active workflows")).toBeInTheDocument();

    expect(detailPane().getByText("Running workflows")).toBeInTheDocument();
    expect(detailPane().getByText("Launch a workflow")).toBeInTheDocument();
    expect(detailPane().getByText("No workflows are running yet — launch one below.")).toBeInTheDocument();
    expect(detailPane().getByRole("button", { name: "View All-Package Bug Hunter" })).toBeInTheDocument();
  });

  it("shows a workflow's steps and settings when it is selected", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(sidebar().getByText("All-Package Bug Hunter"));

    expect(screen.getAllByText("bugHunter.yaml").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("Finds and fixes bugs")).toBeInTheDocument();
    // Step 1 is a plain chat message; step 2 is a structured command.
    expect(screen.getByLabelText("Step 1 chat message")).toHaveValue("List all packages in the monorepo");
    expect(screen.getByLabelText("Step 2 command")).toHaveValue("agent run");
    expect(screen.getByDisplayValue("code-quality-engineer")).toBeInTheDocument();
    expect(screen.getByDisplayValue("fix bugs")).toBeInTheDocument();
  });

  it("saves edits to an existing workflow", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();

    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "Renamed Hunter");
    expect(saveButton).not.toBeDisabled();

    await user.click(saveButton);

    await waitFor(() => expect(updateWorkflow).toHaveBeenCalledTimes(1));
    const { name: _name, updatedAt: _updatedAt, ...body } = bugHunter;
    expect(updateWorkflow.mock.calls[0]![0]).toEqual({ name: "bugHunter", workflow: { ...body, displayName: "Renamed Hunter" } });
  });

  it("creates a new workflow with a chat step", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getAllByRole("button", { name: "New workflow" })[0]!);
    await user.type(screen.getByLabelText("Name"), "newFlow");
    await user.type(screen.getByLabelText("Display name"), "New Flow");
    await user.selectOptions(screen.getByLabelText("Agent type"), "leader");
    await user.type(screen.getByLabelText("Step 1 chat message"), "do the thing");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createWorkflow).toHaveBeenCalledTimes(1));
    const call = createWorkflow.mock.calls[0]![0];
    expect(call.name).toBe("newFlow");
    expect(call.workflow.displayName).toBe("New Flow");
    expect(call.workflow.agentType).toBe("leader");
    expect(call.workflow.steps).toEqual(["do the thing"]);
  });

  it("edits the workflow through YAML mode and blocks saving invalid YAML", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: "YAML" }));

    // The YAML view serializes the current draft.
    const yamlEditor = screen.getByLabelText("Workflow YAML editor", { selector: "textarea" }) as HTMLTextAreaElement;
    expect(yamlEditor.value).toContain("All-Package Bug Hunter");

    // Invalid YAML surfaces an error and disables Save.
    await user.clear(yamlEditor);
    await user.type(yamlEditor, 'displayName: "unclosed value');
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());

    // Valid YAML applies to the draft live: rename, then save through the same path as the form.
    await user.clear(yamlEditor);
    await user.type(
      yamlEditor,
      "displayName: Renamed Hunter\ncategory: Code Review\ndescription: Finds and fixes bugs\nagentType: leader\nsteps:\n  - List all packages in the monorepo",
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateWorkflow).toHaveBeenCalledTimes(1));
    expect(updateWorkflow.mock.calls[0]![0].workflow.displayName).toBe("Renamed Hunter");
  });

  it("shows required and optional args when a schema-rich command is selected", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getAllByRole("button", { name: "New workflow" })[0]!);
    await user.click(screen.getByRole("button", { name: "Add command step" }));
    // New workflows start with one empty chat step; the command step is step 2.
    await user.selectOptions(screen.getByLabelText("Step 2 command"), "agent run");

    expect(screen.getByText("Run an agent with a message")).toBeInTheDocument();
    expect(screen.getByLabelText(/--type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/--bg/)).toBeInTheDocument();
    expect(screen.getByText("Required: type, message")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/--type/), "leader");
    await user.type(screen.getByLabelText(/^message/), "analyze the repo");
    expect(screen.getByText("/agent run --type leader analyze the repo")).toBeInTheDocument();
  });

  it("deletes a workflow after confirmation", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: "Delete workflow" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteWorkflow).toHaveBeenCalledWith({ name: "bugHunter" }));
  });

  it("clones the currently viewed workflow into a new draft", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: "Clone" }));

    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("bugHunter-copy");
    expect(screen.getByLabelText("Display name")).toHaveValue("All-Package Bug Hunter (copy)");
    expect(screen.getByDisplayValue("Finds and fixes bugs")).toBeInTheDocument();
    expect(screen.getByLabelText("Step 1 chat message")).toHaveValue("List all packages in the monorepo");
    expect(screen.getByLabelText("Step 2 command")).toHaveValue("agent run");

    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createWorkflow).toHaveBeenCalledTimes(1));
    const call = createWorkflow.mock.calls[0]![0];
    expect(call.name).toBe("bugHunter-copy");
    expect(call.workflow.displayName).toBe("All-Package Bug Hunter (copy)");
    expect(call.workflow.agentType).toBe("leader");
    expect(call.workflow.steps).toEqual(bugHunter.steps);
  });

  it("launches a workflow on a new agent", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: /Launch/ }));

    await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
  });

  it("runs a workflow from the sidebar without selecting it first", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(sidebar().getByRole("button", { name: "Run All-Package Bug Hunter" }));

    await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
  });

  it("launches a workflow from the installed overview grid", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(detailPane().getByRole("button", { name: "Launch All-Package Bug Hunter" }));

    await waitFor(() => expect(spawnWorkflow).toHaveBeenCalledWith({ name: "bugHunter", headless: false }));
  });

  it("shows running workflows on the installed overview", () => {
    workflowRuns = [activeRun];
    renderApp();

    expect(detailPane().getByRole("button", { name: "Watch All-Package Bug Hunter run" })).toBeInTheDocument();
    expect(detailPane().getByText(/Step 2 of 2: \/agent run --type code-quality-engineer fix bugs/)).toBeInTheDocument();
    expect(detailPane().queryByText("No workflows are running yet — launch one below.")).not.toBeInTheDocument();
  });

  it("watches a running workflow from the installed overview in-app", async () => {
    const user = userEvent.setup();
    workflowRuns = [activeRun];
    renderApp();

    await user.click(detailPane().getByRole("button", { name: "Watch All-Package Bug Hunter run" }));
    // Navigates to the workflow editor, where the run panel and dock live.
    await waitFor(() => expect(screen.getByTestId("chat-dock")).toHaveTextContent("Chat with agent-1"));
    expect(screen.getAllByText("bugHunter.yaml").length).toBeGreaterThan(0);
  });

  it("shows the step an active run is on and opens its agent", async () => {
    const user = userEvent.setup();
    workflowRuns = [activeRun];
    renderApp("/workflows/bugHunter");

    expect(screen.getByText(/running step 2 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 2: \/agent run --type code-quality-engineer fix bugs/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Open agent" })[0]!);
    expect(screen.getByText("Agent page")).toBeInTheDocument();
  });

  it("cancels an active run from the run panel", async () => {
    const user = userEvent.setup();
    workflowRuns = [activeRun];
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: /Cancel/ }));

    await waitFor(() => expect(cancelRun).toHaveBeenCalledWith({ runId: "run-1" }));
  });

  it("shows a run that has not started its first step yet", () => {
    workflowRuns = [{ ...activeRun, status: "starting", agentId: null, currentStep: 0 }];
    renderApp("/workflows/bugHunter");

    expect(screen.getByText("Starting agent…")).toBeInTheDocument();
    expect(screen.getByText(/· starting agent…/)).toBeInTheDocument();
    expect(screen.getByText("Spawning agent…")).toBeInTheDocument();
    // Header may still spin for "Starting", but no step row should claim to be running.
    expect(screen.queryByText(/Step \d+ of \d+/)).not.toBeInTheDocument();
  });

  it("closes the delete confirmation modal with Escape", async () => {
    const user = userEvent.setup();
    renderApp("/workflows/bugHunter");

    await user.click(screen.getByRole("button", { name: "Delete workflow" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(deleteWorkflow).not.toHaveBeenCalled();
  });

  it("cancels create and returns to the installed overview", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getAllByRole("button", { name: "New workflow" })[0]!);
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(detailPane().getByText("Running workflows")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create" })).not.toBeInTheDocument();
  });

  it("shows finished run history in the sidebar and editor", () => {
    workflowRuns = [
      {
        ...activeRun,
        id: "run-done",
        status: "completed",
        currentStep: 2,
        message: 'Workflow "bugHunter" completed',
        finishedAt: 1_700_000_100_000,
      },
      {
        ...activeRun,
        id: "run-failed",
        status: "failed",
        currentStep: 0,
        message: "Step failed",
        finishedAt: 1_700_000_050_000,
      },
    ];
    renderApp("/workflows/bugHunter");

    expect(screen.getByText("Recent runs")).toBeInTheDocument();
    expect(screen.getByLabelText("Workflow run progress")).toBeInTheDocument();
    expect(screen.getByLabelText("Workflow run history")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText('Workflow "bugHunter" completed')).toBeInTheDocument();
  });

  it("shows an empty run-history prompt when a workflow has never been launched", () => {
    renderApp("/workflows/bugHunter");

    expect(screen.getByText(/No runs yet for this workflow/)).toBeInTheDocument();
  });

  it("opens the agent for an active run from the editor", async () => {
    const user = userEvent.setup();
    workflowRuns = [activeRun];
    renderApp("/workflows/bugHunter");

    await user.click(screen.getAllByRole("button", { name: /Open agent/ })[0]!);
    expect(screen.getByText("Agent page")).toBeInTheDocument();
  });

  it("navigates to a workflow when a finished run is clicked in the sidebar", async () => {
    const user = userEvent.setup();
    workflowRuns = [
      {
        ...activeRun,
        id: "run-done",
        status: "completed",
        currentStep: 2,
        message: 'Workflow "bugHunter" completed',
        finishedAt: 1_700_000_100_000,
      },
    ];
    renderApp();

    await user.click(screen.getByLabelText("View runs for All-Package Bug Hunter"));
    expect(screen.getAllByText("bugHunter.yaml").length).toBeGreaterThan(0);
  });

  describe("marketplace", () => {
    it("switches to the marketplace tab and lists registry workflows", async () => {
      const user = userEvent.setup();
      renderApp();

      await user.click(screen.getByRole("button", { name: /^Marketplace/ }));

      expect(await screen.findByText("Coverage Sweep")).toBeInTheDocument();
      expect(screen.getByText("TokenRing Core")).toBeInTheDocument();
    });

    it("does not treat /workflows/marketplace as a missing workflow", () => {
      renderApp("/workflows/marketplace");

      expect(screen.getByText("Coverage Sweep")).toBeInTheDocument();
      // The sidebar keeps showing installed workflows.
      expect(screen.getByText("All-Package Bug Hunter")).toBeInTheDocument();
    });

    it("only offers workflows, since the host app pins the kind", () => {
      marketplaceListData = {
        status: "success",
        registryName: "tokenring-ai/community",
        fetchedAt: 0,
        items: [marketplaceEntry, { ...marketplaceEntry, kind: "agent", id: "agent/coding/reviewer", displayName: "Code Reviewer" }],
        installed: {},
      };
      renderApp("/workflows/marketplace");

      expect(screen.getByText("Coverage Sweep")).toBeInTheDocument();
      expect(screen.queryByText("Code Reviewer")).not.toBeInTheDocument();
    });

    it("installs a workflow straight from a card", async () => {
      const user = userEvent.setup();
      renderApp("/workflows/marketplace");

      await user.click(screen.getByRole("button", { name: "Install Coverage Sweep" }));

      await waitFor(() => expect(installMarketplaceItem).toHaveBeenCalledWith({ id: "workflow/testing/coverage-sweep" }));
    });

    it("previews a workflow's agent and steps on its detail page", async () => {
      const user = userEvent.setup();
      renderApp("/workflows/marketplace");

      await user.click(screen.getByRole("button", { name: "View Coverage Sweep" }));

      expect(await screen.findByText("Adds the tests you are missing.")).toBeInTheDocument();
      expect(screen.getByText("test-engineer")).toBeInTheDocument();
      expect(screen.getByText("Find untested code")).toBeInTheDocument();
      // Command steps render the way the workflow editor formats them.
      expect(screen.getByText("/agent run --type test-engineer add tests")).toBeInTheDocument();
    });

    it("marks an already-installed workflow instead of offering install again", () => {
      marketplaceListData = {
        status: "success",
        registryName: "tokenring-ai/community",
        fetchedAt: 0,
        items: [marketplaceEntry],
        installed: { "workflow/testing/coverage-sweep": { kind: "workflow", name: "coverageSweep" } },
      };
      renderApp("/workflows/marketplace");

      expect(screen.getByTestId("installed-badge")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Install Coverage Sweep" })).not.toBeInTheDocument();
    });

    it("shows an empty state with a retry when the registry is unavailable", async () => {
      marketplaceListData = { status: "unavailable", registryName: "tokenring-ai/community", message: "Could not load the registry index (HTTP 404)." };
      const user = userEvent.setup();
      renderApp("/workflows/marketplace");

      expect(screen.getByText("Marketplace unavailable")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(listMarketplaceItems).toHaveBeenCalledWith({ refresh: true }));
    });

    it("returns to the installed tab from the marketplace pane", async () => {
      const user = userEvent.setup();
      renderApp("/workflows/marketplace");

      await user.click(screen.getByRole("button", { name: /^Installed/ }));

      await waitFor(() => expect(detailPane().getByText("Running workflows")).toBeInTheDocument());
      expect(detailPane().getByText("Launch a workflow")).toBeInTheDocument();
    });
  });
});
