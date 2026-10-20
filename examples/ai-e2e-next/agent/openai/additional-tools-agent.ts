import {
  openai,
  type OpenAIResponsesToolResultOptions,
  type OpenAIToolOptions,
} from '@ai-sdk/openai';
import { tool, ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { z } from 'zod/v4';

const discoveredTool = {
  type: 'function' as const,
  name: 'linear__list_issues',
  description: 'List Linear issues.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
};

export const openaiAdditionalToolsAgent = new ToolLoopAgent({
  model: openai.responses('gpt-5.4'),
  instructions:
    'To list issues, first call connection_search if no search result exists in the conversation. ' +
    'Then call linear__list_issues and summarize its result. ' +
    'On later turns, reuse the discovered tool without searching again.',
  tools: {
    connection_search: tool({
      description: 'Find the connection tool for listing Linear issues.',
      inputSchema: z.object({}),
      execute: async () => ({ tool: 'linear__list_issues', connected: true }),
    }),
    linear__list_issues: tool({
      inputSchema: z.object({}),
      execute: async () => ({ issues: ['Synthetic issue'] }),
      providerOptions: {
        openai: { omitFromRequestTools: true } satisfies OpenAIToolOptions, // This replaces activeTools: ['connection_search'].
      },
    }),
  },
  prepareStep: ({ messages }) => ({
    messages: messages.map(message =>
      message.role !== 'tool'
        ? message
        : {
            ...message,
            content: message.content.map(part =>
              part.type === 'tool-result' &&
              part.toolName === 'connection_search' &&
              part.output.type === 'json'
                ? {
                    ...part,
                    providerOptions: {
                      ...part.providerOptions,
                      openai: {
                        ...part.providerOptions?.openai,
                        additionalTools: [discoveredTool],
                      } satisfies OpenAIResponsesToolResultOptions,
                    },
                  }
                : part,
            ),
          },
    ),
  }),
  include: { requestBody: true },
  onStepFinish: ({
    stepNumber,
    request,
    toolCalls,
    toolResults,
    providerMetadata,
  }) => {
    // Read the actual request: top-level tools plus definitions in the history.
    const body = request.body as {
      tools?: { name: string }[];
      input: { type: string; tools?: { name: string }[] }[];
    };
    const availableTools = [
      ...new Set([
        ...(body.tools ?? []).map(tool => tool.name),
        ...body.input.flatMap(item =>
          item.type === 'additional_tools'
            ? (item.tools ?? []).map(tool => tool.name)
            : [],
        ),
      ]),
    ];

    console.group(`OpenAI additional tools — step ${stepNumber + 1}`);
    console.dir(
      { availableTools, toolCalls, toolResults, providerMetadata },
      { depth: null, maxArrayLength: null, maxStringLength: null },
    );
    console.groupEnd();
  },
  providerOptions: { openai: { store: false } },
});

export type OpenAIAdditionalToolsMessage = InferAgentUIMessage<
  typeof openaiAdditionalToolsAgent
>;
