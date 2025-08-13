import ModelRegistry from "@token-ring/ai-client/ModelRegistry";
import ChatService from "@token-ring/chat/ChatService";
import FileSystemService from "@token-ring/filesystem/FileSystemService";
import {createChatRequest} from "@token-ring/ai-client";
import {flow} from "../../../flow.js";
import {Runnable} from "@token-ring/runnable";
import {ChatInputMessage, ChatRequest} from "@token-ring/ai-client/client/AIChatClient";
import {Registry} from "@token-ring/registry";

interface AnalysisSchema {
  requiresFiles: string[];
  searchFilesFor: string[];
  searchWebFor: string[];
  taskDescription: string;
}

interface DiscoveryContext {
  prompt: string;
  request?: ChatRequest;
  [key: string]: any;
}

interface DiscoveryParams {
  originalPrompt: string;
}


interface FileSearchResult {
  file: string;
  line: number; 
  match: string;
}

const schema = {
  type: "object",
  properties: {
    requiresFiles: {
      type: "array",
      description: "Specific files needed to complete the request",
      items: {
        type: "string",
      },
    },
    searchFilesFor: {
      type: "array",
      description: "File search queries to execute",
      items: {
        type: "string",
      },
    },
    searchWebFor: {
      type: "array",
      description: "Web search queries to execute",
      items: {
        type: "string",
      },
    },
    taskDescription: {
      type: "string",
      description: "Description of the task to be completed",
    },
  },
  required: [
    "requiresFiles",
    "searchFilesFor",
    "searchWebFor",
    "taskDescription",
  ],
};

const discoverySystemPrompt = `You are a prompt analyzer, analyzing a prompt that will be fed to an AI model. Given the following chat payload, generate:
- A list of any specific files that are needed to complete the request. Each item should be a file path relative to the project root.
- Whether a web search is necessary to gather information to complete the request, and if so, a list of search queries to execute.
- Whether a file search is necessary to gather information to complete the request, and if so, a list of file search queries to execute.
- A two paragraph explanation of the task to be completed.
`;

/**
 * Analyze a chat payload for meta-parameters (model, temperature, etc.).
 * @param params - The parameters object.
 * @param params.originalPrompt - The initial user prompt.
 * @param registry - The package registry
 */
async function contextDiscovery({ originalPrompt }: DiscoveryParams, registry: Registry): Promise<ChatRequest> {
  const modelRegistry = registry.requireFirstServiceByType(ModelRegistry);
  const chatService = registry.requireFirstServiceByType(ChatService);
  const filesystem = registry.requireFirstServiceByType(FileSystemService);

  const systemPrompt = chatService.getInstructions();
  const request = await createChatRequest(
    { input: originalPrompt, systemPrompt },
    registry,
  );

  let input = request.messages
    .map(({ role, content }) => `"${role}": "${content}"`)
    .join(",\n  ");
  if (input.length > 30000) {
    input = `${input.slice(0, 2500)}
--- Chat length was ${input.length} characters, omitting the middle of chat for brevity---
${input.slice(-5000)}`;
  }

  const client = await modelRegistry.chat.getFirstOnlineClient('auto:reasoning>4');

  // Generate object using schema
  const [response] = await client.generateObject(
    {
      messages: [
        {
          role: "system",
          content: discoverySystemPrompt,
        },
        {
          role: "user",
          content: input,
        },
      ],
      schema,
      temperature: 0.0,
    },
    registry,
  );

  const analysis = response.object as AnalysisSchema;

  const fileIndexMessages: ChatInputMessage[] = await Promise.all(
    analysis.searchFilesFor.map(async (query) =>
      flow<ChatInputMessage | undefined>(`Search files for ${query}`, async () => {
        const results = await filesystem.grep(query, {}) as FileSearchResult[];
        if (results.length > 0) {
          chatService.systemLine(
            `[PromptAnalyzer] Added ${results.length} file search results for ${query} to the chat`,
          );
          return {
            role: "user",
            content: `A file search for ${query} returned the following matches:\n${JSON.stringify(results)}`,
          };
        }
        return undefined;
      }),
    ),
  ).then(messages => messages.filter(Boolean) as ChatInputMessage[]);

  const wholeFileMessages: ChatInputMessage[] = await Promise.all(
    analysis.requiresFiles.map(async (file) =>
      flow<ChatInputMessage | undefined>(`Adding ${file} to chat`, async () => {
        try {
          const content = await filesystem.readFile(file);
          return {
            role: "user",
            content: `// ${file}\n${content}`,
          };
        } catch (err) {
          chatService.errorLine(
            `[PromptAnalyzer] Error reading file ${file}, skipping. Error: `,
            err as Error,
          );
          return undefined;
        }
      }),
    ),
  ).then(messages => messages.filter(Boolean));

  return await createChatRequest(
    {
      systemPrompt,
      input: [
        ...fileIndexMessages,
        ...wholeFileMessages,
        {
          role: "user",
          content: `${originalPrompt}\n\n${analysis.taskDescription}`,
        },
      ],
    },
    registry,
  );
}

export default class DiscoveryRunnable extends Runnable {
  async *invoke(context: DiscoveryContext, { registry }: { registry: Registry }): AsyncGenerator<any, DiscoveryContext, unknown> {
    const request = await contextDiscovery(
      { originalPrompt: context.prompt },
      registry,
    );
    context.request = request;
    yield {
      type: "log",
      level: "info",
      message: "Discovery complete",
      timestamp: Date.now(),
      runnableName: this.name,
    };
    return context;
  }
}