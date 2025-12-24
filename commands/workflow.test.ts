import {runSubAgent} from "@tokenring-ai/agent/runSubAgent";
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import workflowCommand from './workflow';
import { AgentCommandService } from '@tokenring-ai/agent';
import createTestingAgent from '@tokenring-ai/agent/test/createTestingAgent';
import TokenRingApp from '@tokenring-ai/app';
import createTestingApp from '@tokenring-ai/app/test/createTestingApp';
import WorkflowService from '../WorkflowService';

vi.mock('@tokenring-ai/agent/runSubAgent');

describe('workflow command', () => {
  let app: TokenRingApp;
  let agent: any;
  let workflowService: WorkflowService;
  let agentCommandService: any;

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

    agentCommandService = {
      name: AgentCommandService.name,
      description: 'Test agent command service',
      executeAgentCommand: vi.fn(),
    };

    app.addServices(workflowService);
    app.addServices(agentCommandService as any);

    agent = createTestingAgent(app);
    agent.headless = false;
    vi.spyOn(agent, 'infoLine');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('command metadata', () => {
    it('should have correct description', () => {
      expect(workflowCommand.description).toBe('/workflow run <name> - Run a workflow by name.');
    });

    it('should have help text', () => {
      expect(workflowCommand.help).toContain('# /workflow');
      expect(workflowCommand.help).toContain('## Description');
      expect(workflowCommand.help).toContain('Run multi-step workflows on the current agent.');
    });
  });

  describe('execute() with no arguments', () => {
    it('should list all workflows', async () => {
      await workflowCommand.execute(undefined, agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Available workflows:\n');
      expect(agent.infoLine).toHaveBeenCalledWith('**testWorkflow**: Test Workflow');
      expect(agent.infoLine).toHaveBeenCalledWith('  A test workflow');
      expect(agent.infoLine).toHaveBeenCalledWith('  Steps: 3\n');
      expect(agent.infoLine).toHaveBeenCalledWith('**complexWorkflow**: Complex Workflow');
      expect(agent.infoLine).toHaveBeenCalledWith('  A complex test workflow');
      expect(agent.infoLine).toHaveBeenCalledWith('  Steps: 4\n');
    });
  });

  describe('execute() with "run" command', () => {
    it('should execute workflow steps', async () => {
      await workflowCommand.execute('run testWorkflow', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledTimes(3);
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step1');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step2');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step3');
    });

    it('should handle complex workflow steps', async () => {
      await workflowCommand.execute('run complexWorkflow', agent);

      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledTimes(4);
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'setup');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'process');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'validate');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'cleanup');
    });

    it('should show error for non-existent workflow', async () => {
      await workflowCommand.execute('run nonExistentWorkflow', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('run', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Usage: /workflow run <name>');
    });

    it('should handle workflow with multiple word name', async () => {
      const multiWordWorkflows = {
        ...mockWorkflows,
        'multi word workflow': {
          ...mockWorkflows.testWorkflow,
          name: 'Multi Word Workflow',
        },
      };
      const appWithMultiWord = createTestingApp();
      const multiWordService = new WorkflowService(appWithMultiWord, multiWordWorkflows);
      const multiWordCommandService = {
        name: AgentCommandService.name,
        description: 'Test agent command service',
        executeAgentCommand: vi.fn(),
      };
      appWithMultiWord.addServices(multiWordService);
      appWithMultiWord.addServices(multiWordCommandService as any);
      const agentWithMultiWord = createTestingAgent(appWithMultiWord);
      vi.spyOn(agentWithMultiWord, 'infoLine');

      await workflowCommand.execute('run multi word workflow', agentWithMultiWord);

      expect(agentWithMultiWord.infoLine).toHaveBeenCalledWith('Running workflow: Multi Word Workflow\n');
      expect(multiWordCommandService.executeAgentCommand).toHaveBeenCalled();
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

      expect(agent.infoLine).toHaveBeenCalledWith('Spawning agent type "test-agent" for workflow: Test Workflow\n');
      expect(runSubAgent).toHaveBeenCalledWith({
        agentType: 'test-agent',
        command: '/workflow run testWorkflow',
        headless: false,
        forwardChatOutput: true,
        forwardReasoning: true,
        forwardHumanRequests: true,
        forwardSystemOutput: true,
      }, agent, true);
    });

    it('should handle headless spawning', async () => {
      agent.headless = true;
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

      expect(agent.infoLine).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('spawn', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Usage: /workflow spawn <name>');
    });
  });

  describe('execute() with unknown command', () => {
    it('should show usage for unknown command', async () => {
      await workflowCommand.execute('unknown command', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Usage: /workflow run <name> | /workflow spawn <name>');
    });
  });

  describe('Error handling scenarios', () => {
    it('should handle missing workflow service', async () => {
      const emptyApp = createTestingApp();
      const agentWithoutService = createTestingAgent(emptyApp);
      vi.spyOn(agentWithoutService, 'infoLine');

      await workflowCommand.execute('run testWorkflow', agentWithoutService);

      expect(agentWithoutService.infoLine).toHaveBeenCalledWith('Workflow service is not running.');
    });

    it('should handle agent command service missing', async () => {
      const appWithoutCommandService = createTestingApp();
      const workflowServiceNoCommand = new WorkflowService(appWithoutCommandService, mockWorkflows);
      appWithoutCommandService.addServices(workflowServiceNoCommand);
      const agentWithoutCommandService = createTestingAgent(appWithoutCommandService);
      vi.spyOn(agentWithoutCommandService, 'infoLine');

      await workflowCommand.execute('run testWorkflow', agentWithoutCommandService);

      expect(agentWithoutCommandService.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(agentCommandService.executeAgentCommand).not.toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full workflow execution flow', async () => {
      await workflowCommand.execute('run testWorkflow', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step1');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step2');
      expect(agentCommandService.executeAgentCommand).toHaveBeenCalledWith(agent, 'step3');
    });

    it('should handle full workflow spawn flow', async () => {
      await workflowCommand.execute('spawn complexWorkflow', agent);

      expect(agent.infoLine).toHaveBeenCalledWith('Spawning agent type "complex-agent" for workflow: Complex Workflow\n');
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
      expect(agent.infoLine).toHaveBeenCalled();

      await workflowCommand.execute('run\ttestWorkflow\t', agent);
      expect(agent.infoLine).toHaveBeenCalled();

      await workflowCommand.execute('run testWorkflow with multiple words', agent);
      expect(agent.infoLine).toHaveBeenCalled();
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
      description: expect.stringContaining('/workflow run'),
      execute: expect.any(Function),
      help: expect.stringContaining('/workflow'),
    });
  });
});