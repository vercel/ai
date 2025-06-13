import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { APICallError } from '@ai-sdk/provider';
import { createOpenAI } from './openai-provider';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: 'Search for recent AI research papers' },
    ],
  },
];

describe('OpenAI MCP Server Tools', () => {
  const server = createTestServer({
    'https://api.openai.com/v1/chat/completions': {},
  });

  const provider = createOpenAI({
    apiKey: 'test-api-key',
  });
  const model = provider('gpt-4o');

  function prepareJsonResponse(body: any) {
    server.urls['https://api.openai.com/v1/chat/completions'].response = {
      type: 'json-value',
      body,
    };
  }

  it('should add webSearchPreview tool when provided in tools array', async () => {
    prepareJsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1699999999,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I found some relevant AI research papers.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 15,
        total_tokens: 35,
      },
    });

    const toolConfig = provider.tools.webSearchPreview({
      searchContextSize: 'medium',
      maxResults: 10,
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined',
          id: toolConfig.id,
          name: 'web_search_preview',
          args: toolConfig.args,
          executionMode: toolConfig.executionMode,
          resultSchema: toolConfig.resultSchema as unknown as Record<
            string,
            unknown
          >,
          capabilities: toolConfig.capabilities,
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;

    // Server-side tools don't appear in the tools array, they are processed differently
    expect(requestBody.tools).toEqual([]);
    expect(requestBody.messages).toBeDefined();
  });

  it('should handle webSearchPreview tool with user location', async () => {
    prepareJsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1699999999,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I found local AI research information.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 15,
        total_tokens: 35,
      },
    });

    const toolConfig = provider.tools.webSearchPreview({
      searchContextSize: 'high',
      userLocation: {
        type: 'approximate',
        city: 'San Francisco',
        region: 'California',
        country: 'US',
        timezone: 'America/Los_Angeles',
      },
      maxResults: 5,
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined',
          id: toolConfig.id,
          name: 'web_search_preview',
          args: toolConfig.args,
          executionMode: toolConfig.executionMode,
          resultSchema: toolConfig.resultSchema as unknown as Record<
            string,
            unknown
          >,
          capabilities: toolConfig.capabilities,
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toEqual([]);
    expect(requestBody.messages).toBeDefined();
  });

  it('should handle webSearchPreview results with tool calls', async () => {
    prepareJsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1699999999,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_webSearch123',
                type: 'function',
                function: {
                  name: 'web_search_preview',
                  arguments: '{"query": "AI research papers 2024"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 25,
        total_tokens: 45,
      },
    });

    const toolConfig = provider.tools.webSearchPreview({
      searchContextSize: 'medium',
      maxResults: 10,
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined',
          id: toolConfig.id,
          name: 'web_search_preview',
          args: toolConfig.args,
          executionMode: toolConfig.executionMode,
          resultSchema: toolConfig.resultSchema as unknown as Record<
            string,
            unknown
          >,
          capabilities: toolConfig.capabilities,
        },
      ],
    });

    const toolCallContent = result.content.find(
      (
        part,
      ): part is {
        type: 'tool-call';
        toolCallType: 'function';
        toolCallId: string;
        toolName: string;
        args: string;
      } => part.type === 'tool-call',
    );

    expect(toolCallContent).toBeDefined();
    expect(toolCallContent).toEqual({
      type: 'tool-call',
      toolCallType: 'function',
      toolCallId: 'call_webSearch123',
      toolName: 'web_search_preview',
      args: '{"query": "AI research papers 2024"}',
    });
  });

  it('should handle server-side tool execution errors', async () => {
    server.urls['https://api.openai.com/v1/chat/completions'].response = {
      type: 'error',
      status: 429,
      body: JSON.stringify({
        error: {
          message: 'Tool execution failed: Rate limit exceeded for web search',
          type: 'tool_execution_error',
          code: 'rate_limit_exceeded',
          param: 'web_search_preview',
        },
      }),
    };

    const toolConfig = provider.tools.webSearchPreview({
      searchContextSize: 'medium',
      maxResults: 10,
    });

    await expect(() =>
      model.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider-defined',
            id: toolConfig.id,
            name: 'web_search_preview',
            args: toolConfig.args,
            executionMode: toolConfig.executionMode,
            resultSchema: toolConfig.resultSchema as unknown as Record<
              string,
              unknown
            >,
            capabilities: toolConfig.capabilities,
          },
        ],
      }),
    ).rejects.toThrow(APICallError);
  });

  it('should combine webSearchPreview with regular tools', async () => {
    prepareJsonResponse({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1699999999,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'I can use both server and client tools.',
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 35,
        completion_tokens: 25,
        total_tokens: 60,
      },
    });

    const toolConfig = provider.tools.webSearchPreview({
      searchContextSize: 'medium',
      maxResults: 5,
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined',
          id: toolConfig.id,
          name: 'web_search_preview',
          args: toolConfig.args,
          executionMode: toolConfig.executionMode,
          resultSchema: toolConfig.resultSchema as unknown as Record<
            string,
            unknown
          >,
          capabilities: toolConfig.capabilities,
        },
        {
          type: 'function',
          name: 'calculator',
          description: 'Calculate math',
          parameters: {
            type: 'object',
            properties: {
              operation: { type: 'string' },
              numbers: { type: 'array', items: { type: 'number' } },
            },
            required: ['operation', 'numbers'],
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;

    // Only the regular function tool appears in the tools array
    expect(requestBody.tools).toHaveLength(1);
    expect(requestBody.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Calculate math',
        parameters: {
          type: 'object',
          properties: {
            operation: { type: 'string' },
            numbers: { type: 'array', items: { type: 'number' } },
          },
          required: ['operation', 'numbers'],
        },
        strict: true,
      },
    });
  });
});
