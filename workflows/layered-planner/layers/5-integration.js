import ModelRegistry from '@token-ring/ai-client/ModelRegistry';
import ChatService from '@token-ring/chat/ChatService';
import { flow } from '../../../flow.js';
import { Runnable } from '../../../../runnable/runnable.js';

const integrationSchema = {
  type: 'object',
  properties: {
    isComplete: { type: 'boolean' },
    summary: { type: 'string' },
    subtaskFeedback: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subtaskDescription: { type: 'string' },
          executionResult: { type: 'string' },
          status: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['subtaskDescription', 'executionResult', 'status']
      }
    },
    confidenceScore: { type: 'number' },
    nextSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          details: { type: 'string' }
        },
        required: ['action', 'details']
      }
    }
  },
  required: ['isComplete', 'summary', 'subtaskFeedback', 'confidenceScore']
};

async function integrateResults({ workflowContext, registry }) {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const chatService = registry.requireFirstServiceByType(ChatService);

  return await flow('task-integration', async () => {
    chatService.systemLine('[Integrator] Integrating results...');

    const subtaskSummaries = workflowContext.executionResults.map((er, i) => {
      return `Subtask ${i + 1}: ${er.subtask.description}\nResult: ${er.response?.result}\nSuccess: ${er.response?.success}`;
    }).join('\n\n');

    const prompt = `You are a task integrator. Summarize overall progress and determine completion.\n\nPLAN:\n${JSON.stringify(workflowContext.plan, null, 2)}\n\nRESULTS:\n${subtaskSummaries}`;

    const client = await modelRegistry.getFirstOnlineClient({ tags: ['analyze', 'reasoning'] });
    const messages = [...workflowContext.request.messages, { role: 'user', content: prompt }];

    const [integration] = await client.generateObject({
      ...workflowContext.request,
      messages,
      schema: integrationSchema,
      temperature: 0.2
    }, registry);

    chatService.systemLine('[Integrator] Integration complete.');
    return integration;
  });
}

export default class IntegrationRunnable extends Runnable {
  async *invoke(context, { serviceRegistry }) {
    const wfCtx = { request: context.request, plan: context.plan, executionResults: context.executionResults };
    const integration = await integrateResults({ workflowContext: wfCtx, registry: serviceRegistry });
    context.integration = integration;
    yield { type: 'log', level: 'info', message: 'Integration complete', timestamp: Date.now(), runnableName: this.name };
    return context;
  }
}
