import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import workflowCommand from './workflow';
import { AgentCommandService } from '@tokenring-ai/agent';
import { runSubAgent } from '@tokenring-ai/agent/runSubAgent';
import WorkflowService from '../WorkflowService';


describe('workflow command', () => {
  let mockAgent: any;
  let mockWorkflowService: any;
  let mockAgentCommandService: any;

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
    
    mockAgent = {
      app: {
        getService: vi.fn(),
        requireService: vi.fn(),
      },
      config: {
        agentType: 'default-agent',
      },
      infoLine: vi.fn(),
      askHuman: vi.fn(),
      headless: false,
    };

    mockWorkflowService = {
      getWorkflow: vi.fn((name) => mockWorkflows[name]),
      listWorkflows: vi.fn(() => [
        { key: 'testWorkflow', workflow: mockWorkflows.testWorkflow },
        { key: 'complexWorkflow', workflow: mockWorkflows.complexWorkflow },
      ]),
    };

    mockAgentCommandService = {
      executeAgentCommand: vi.fn(),
    };

    mockAgent.app.getService = vi.fn((serviceClass) => {
      if (serviceClass === WorkflowService) return mockWorkflowService;
      return null;
    });

    mockAgent.app.requireService = vi.fn((serviceClass) => {
      if (serviceClass === WorkflowService) return mockWorkflowService;
      if (serviceClass === AgentCommandService) return mockAgentCommandService;
      return null;
    });
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
      await workflowCommand.execute(undefined, mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Available workflows:\n');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('**testWorkflow**: Test Workflow');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('  A test workflow');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('  Steps: 3\n');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('**complexWorkflow**: Complex Workflow');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('  A complex test workflow');
      expect(mockAgent.infoLine).toHaveBeenCalledWith('  Steps: 4\n');
    });
  });

  describe('execute() with "run" command', () => {
    it('should execute workflow steps', async () => {
      await workflowCommand.execute('run testWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledTimes(3);
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step1');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step2');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step3');
    });

    it('should handle complex workflow steps', async () => {
      await workflowCommand.execute('run complexWorkflow', mockAgent);

      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledTimes(4);
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'setup');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'process');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'validate');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'cleanup');
    });

    it('should show error for non-existent workflow', async () => {
      await workflowCommand.execute('run nonExistentWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('run', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Usage: /workflow run <name>');
    });

    it('should handle workflow with multiple word name', async () => {
      const multiWordWorkflow = {
        ...mockWorkflows.testWorkflow,
        name: 'Multi Word Workflow',
      };
      mockWorkflowService.getWorkflow = vi.fn((name) => {
        if (name === 'multi word workflow') return multiWordWorkflow;
        return null;
      });

      await workflowCommand.execute('run multi word workflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Running workflow: Multi Word Workflow\n');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalled();
    });
  });

  describe('execute() with "spawn" command', () => {
    beforeEach(() => {
      vi.mocked(runSubAgent).mockResolvedValue({
        id: 'spawned-agent-123',
        name: 'Spawned Agent',
        config: { description: 'Spawned agent description' },
      });
    });

    it('should spawn agent and run workflow', async () => {
      await workflowCommand.execute('spawn testWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Spawning agent type "test-agent" for workflow: Test Workflow\n');
      expect(runSubAgent).toHaveBeenCalledWith({
        agentType: 'test-agent',
        command: '/workflow run testWorkflow',
        headless: false,
        forwardChatOutput: true,
        forwardReasoning: true,
        forwardHumanRequests: true,
        forwardSystemOutput: true,
      }, mockAgent, true);
    });

    it('should handle headless spawning', async () => {
      mockAgent.headless = true;
      await workflowCommand.execute('spawn testWorkflow', mockAgent);

      expect(runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
        }),
        mockAgent,
        true
      );
    });

    it('should show error for non-existent workflow', async () => {
      await workflowCommand.execute('spawn nonExistentWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Workflow "nonExistentWorkflow" not found.');
    });

    it('should show usage when no workflow name provided', async () => {
      await workflowCommand.execute('spawn', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Usage: /workflow spawn <name>');
    });
  });

  describe('execute() with unknown command', () => {
    it('should show usage for unknown command', async () => {
      await workflowCommand.execute('unknown command', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Usage: /workflow run <name> | /workflow spawn <name>');
    });
  });

  describe('Error handling scenarios', () => {
    it('should handle missing workflow service', async () => {
      mockAgent.app.getService = vi.fn(() => null);

      await workflowCommand.execute('run testWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Workflow service is not running.');
    });

    it('should handle agent command service missing', async () => {
      mockAgent.app.requireService = vi.fn((serviceClass) => {
        if (serviceClass === WorkflowService) return mockWorkflowService;
        return null;
      });

      await workflowCommand.execute('run testWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(mockAgentCommandService.executeAgentCommand).not.toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle full workflow execution flow', async () => {
      await workflowCommand.execute('run testWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Running workflow: Test Workflow\n');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step1');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step2');
      expect(mockAgentCommandService.executeAgentCommand).toHaveBeenCalledWith(mockAgent, 'step3');
    });

    it('should handle full workflow spawn flow', async () => {
      await workflowCommand.execute('spawn complexWorkflow', mockAgent);

      expect(mockAgent.infoLine).toHaveBeenCalledWith('Spawning agent type "complex-agent" for workflow: Complex Workflow\n');
      expect(runSubAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'complex-agent',
          command: '/workflow run complexWorkflow',
        }),
        mockAgent,
        true
      );
    });
  });

  describe('Command parsing', () => {
    it('should handle various input formats', async () => {
      await workflowCommand.execute('run   testWorkflow   ', mockAgent);
      expect(mockAgent.infoLine).toHaveBeenCalled();

      await workflowCommand.execute('run\ttestWorkflow\t', mockAgent);
      expect(mockAgent.infoLine).toHaveBeenCalled();

      await workflowCommand.execute('run testWorkflow with multiple words', mockAgent);
      expect(mockAgent.infoLine).toHaveBeenCalled();
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