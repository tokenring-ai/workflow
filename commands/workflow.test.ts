import {Agent, AgentCommandService} from '@tokenring-ai/agent';
import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import createTestingAgent from '@tokenring-ai/agent/test/createTestingAgent';
import TokenRingApp from '@tokenring-ai/app';
import createTestingApp from '@tokenring-ai/app/test/createTestingApp';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import WorkflowService from '../WorkflowService';
import workflowCommand from './workflow';

vi.mock('@tokenring-ai/agent/runSubAgent');

describe('workflow command', () => {
  let app: TokenRingApp;
  let agent: Agent;
  let workflowService: WorkflowService;
  let agentCommandService: AgentCommandService;

  const mockWorkflows = {
    testWorkflow: {
      name: 'Test Workflow',
      description: 'A test workflow',
      agentType: 'test-agent',
      steps: ['step1', 'step2', 'step3'],
    },
    complexWorkflow: {
      name: 'Complex Workflow',
      description: 'A complex test workflow',
      agentType: 'complex-agent',
      steps: ['setup', 'process', 'validate', 'cleanup'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    app = createTestingApp();
    
    workflowService = new WorkflowService(app, mockWorkflows);

    agentCommandService = new AgentCommandService();

    app.addServices(workflowService);
    app.addServices(agentCommandService);

    agent = createTestingAgent(app);
    agent.config.headless = false;
    vi.spyOn(agent, 'infoMessage');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('command metadata', () => {
    it('should have correct description', () => {
      expect(workflowCommand.description).toBe('/workflow - Manage and run workflows');
    });

    it('should have help text', () => {
      expect(workflowCommand.help).toContain('# /workflow');
      expect(workflowCommand.help).toContain('## Description');
      expect(workflowCommand.help).toContain('Run multi-step workflows on the current agent.');
    });
  });

  describe('execute() with no arguments', () => {
    it('should list all workflows', async () => {
      await workflowCommand.execute("list", agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Available workflows:\n');
      expect(agent.infoMessage).toHaveBeenCalledWith('**testWorkflow**: Test Workflow');
      expect(agent.infoMessage).toHaveBeenCalledWith(' A test workflow\n Steps: 3');
      expect(agent.infoMessage).toHaveBeenCalledWith('**complexWorkflow**: Complex Workflow');
      expect(agent.infoMessage).toHaveBeenCalledWith(' A complex test workflow\n Steps: 4');
    });
  });

  describe('execute() with "run" command', () => {
    it('should execute workflow steps', async () => {
      vi.spyOn(agentCommandService, 'executeAgentCommand').mockImplementation(() => Promise.resolve())

      await workflowCommand.execute('run testWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step1');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step2');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step3');
    });

    it('should handle complex workflow steps', async () => {
      vi.spyOn(agentCommandService, 'executeAgentCommand').mockImplementation(() => Promise.resolve())
      await workflowCommand.execute('run complexWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Running workflow: Complex Workflow\n');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'setup');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'process');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'validate');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'cleanup');
    });

    it('should show error for non-existent workflow', async () => {
      await workflowCommand.execute('run nonExistentWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('run', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Usage: /workflow run <name>');
    });

  });

  describe('execute() with "spawn" command', () => {
    beforeEach(async () => {
      vi.mocked(runSubAgent).mockResolvedValue({
        id: 'spawned-agent-123',
        name: 'Spawned Agent',
        config: { description: 'Spawned agent description' },
      });
    });

    it('should spawn agent and run workflow', async () => {
      await workflowCommand.execute('spawn testWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Spawning agent type "test-agent" for workflow: Test Workflow\n');
      expect(runSubAgent).toHaveBeenCalledWith({
        agentType: 'test-agent',
        command: '/workflow run testWorkflow',
        headless: false,
      }, agent, true);
    });

    it('should handle headless spawning', async () => {
      agent.config.headless = true;
      await workflowCommand.execute('spawn testWorkflow', agent);

      expect(runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
        }),
        agent,
        true
      );
    });

    it('should show error for non-existent workflow', async () => {
      await workflowCommand.execute('spawn nonExistentWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('spawn', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Usage: /workflow spawn <name>');
    });
  });

  describe('execute() with unknown command', () => {
    it('should show usage for unknown command', async () => {
      await workflowCommand.execute('unknown command', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Available subcommands: list, run, spawn');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full workflow execution flow', async () => {
      vi.spyOn(agentCommandService, 'executeAgentCommand').mockImplementation(() => Promise.resolve())
      await workflowCommand.execute('run testWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step1');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step2');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step3');
    });

    it('should handle full workflow spawn flow', async () => {
      await workflowCommand.execute('spawn complexWorkflow', agent);

      expect(agent.infoMessage).toHaveBeenCalledWith('Spawning agent type "complex-agent" for workflow: Complex Workflow\n');
      expect(runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'complex-agent',
          command: '/workflow run complexWorkflow',
        }),
        agent,
        true
      );
    });
  });

  describe('Command parsing', () => {
    it('should handle various input formats', async () => {
      await workflowCommand.execute('run   testWorkflow   ', agent);
      expect(agent.infoMessage).toHaveBeenCalled();

      await workflowCommand.execute('run\ttestWorkflow\t', agent);
      expect(agent.infoMessage).toHaveBeenCalled();

      await workflowCommand.execute('run testWorkflow with multiple words', agent);
      expect(agent.infoMessage).toHaveBeenCalled();
    });
  });
});

describe('workflow command metadata', () => {
  it('should implement TokenRingAgentCommand interface', () => {
    const command = {
      description: workflowCommand.description,
      execute: workflowCommand.execute,
      help: workflowCommand.help,
    };

    expect(command).toMatchObject({
      description: expect.stringContaining('/workflow'),
      execute: expect.any(Function),
      help: expect.stringContaining('/workflow run'),
    });
  });
});
