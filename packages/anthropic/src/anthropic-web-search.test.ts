import { describe, it, expect } from 'vitest';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { APICallError } from '@ai-sdk/provider';
import { createAnthropic } from './anthropic-provider';

const TEST_PROMPT = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'What is the latest news?' }],
  },
];

describe('Anthropic Web Search Server-Side Tool', () => {
  const server = createTestServer({
    'https://api.anthropic.com/v1/messages': {},
  });

  const provider = createAnthropic({
    apiKey: 'test-api-key',
  });
  const model = provider('claude-3-5-sonnet-latest');

  function prepareJsonResponse(body: any) {
    server.urls['https://api.anthropic.com/v1/messages'].response = {
      type: 'json-value',
      body,
    };
  }

  it('should enable server-side web search when using anthropic.tools.webSearch_20250305', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [
        {
          type: 'text',
          text: 'Here are the latest quantum computing breakthroughs.',
        },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 3,
            allowedDomains: ['arxiv.org', 'nature.com', 'mit.edu'],
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(1);

    expect(requestBody.tools[0]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3,
      allowed_domains: ['arxiv.org', 'nature.com', 'mit.edu'],
    });
  });

  it('should pass web search configuration with blocked domains', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [
        { type: 'text', text: 'Here are the latest stock market trends.' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 2,
            blockedDomains: ['reddit.com'],
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(1);

    expect(requestBody.tools[0]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 2,
      blocked_domains: ['reddit.com'],
    });
  });

  it('should handle web search with user location', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [{ type: 'text', text: 'Here are local tech events.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 1,
            userLocation: {
              type: 'approximate',
              city: 'New York',
              region: 'New York',
              country: 'US',
              timezone: 'America/New_York',
            },
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(1);

    expect(requestBody.tools[0]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 1,
      user_location: {
        type: 'approximate',
        city: 'New York',
        region: 'New York',
        country: 'US',
        timezone: 'America/New_York',
      },
    });
  });

  it('should handle web search with partial user location (city + country)', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [{ type: 'text', text: 'Here are local events.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 1,
            userLocation: {
              type: 'approximate',
              city: 'London',
              country: 'GB',
            },
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(1);

    expect(requestBody.tools[0]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 1,
      user_location: {
        type: 'approximate',
        city: 'London',
        country: 'GB',
      },
    });
  });

  it('should handle web search with minimal user location (country only)', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [{ type: 'text', text: 'Here are global events.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 1,
            userLocation: {
              type: 'approximate',
              country: 'US',
            },
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(1);

    expect(requestBody.tools[0]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 1,
      user_location: {
        type: 'approximate',
        country: 'US',
      },
    });
  });

  it('should handle server-side web search results with citations', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [
        {
          type: 'server_tool_use',
          id: 'tool_1',
          name: 'web_search',
          input: { query: 'latest AI news' },
        },
        {
          type: 'web_search_tool_result',
          tool_use_id: 'tool_1',
          content: [
            {
              type: 'web_search_result',
              url: 'https://example.com/ai-news',
              title: 'Latest AI Developments',
              encrypted_content: 'encrypted_content_123',
              page_age: 'January 15, 2025',
            },
          ],
        },
        {
          type: 'text',
          text: 'Based on recent articles, AI continues to advance rapidly.',
        },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        server_tool_use: { web_search_requests: 1 },
      },
    });

    const result = await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 5,
          },
        },
      ],
    });

    expect(result.content).toHaveLength(2);

    expect(result.content[0]).toEqual({
      type: 'source',
      sourceType: 'url',
      id: expect.any(String),
      url: 'https://example.com/ai-news',
      title: 'Latest AI Developments',
      providerMetadata: {
        anthropic: {
          encryptedContent: 'encrypted_content_123',
          pageAge: 'January 15, 2025',
        },
      },
    });

    expect(result.content[1]).toEqual({
      type: 'text',
      text: 'Based on recent articles, AI continues to advance rapidly.',
    });
  });

  it('should handle server-side web search errors', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [
        {
          type: 'web_search_tool_result',
          tool_use_id: 'tool_1',
          content: {
            type: 'web_search_tool_result_error',
            error_code: 'max_uses_exceeded',
          },
        },
        {
          type: 'text',
          text: 'I cannot search further due to limits.',
        },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await expect(() =>
      model.doGenerate({
        prompt: TEST_PROMPT,
        tools: [
          {
            type: 'provider-defined-server',
            id: 'anthropic.web_search_20250305',
            name: 'web_search',
            args: {
              maxUses: 1,
            },
          },
        ],
      }),
    ).rejects.toThrow(APICallError);
  });

  it('should work alongside regular client-side tools', async () => {
    prepareJsonResponse({
      type: 'message',
      id: 'msg_test',
      content: [{ type: 'text', text: 'I can search and calculate.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 },
    });

    await model.doGenerate({
      prompt: TEST_PROMPT,
      tools: [
        {
          type: 'function',
          name: 'calculator',
          description: 'Calculate math',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          type: 'provider-defined-server',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {
            maxUses: 1,
          },
        },
      ],
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody.tools).toHaveLength(2);

    expect(requestBody.tools[0]).toEqual({
      name: 'calculator',
      description: 'Calculate math',
      input_schema: { type: 'object', properties: {} },
    });

    expect(requestBody.tools[1]).toEqual({
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 1,
    });
  });
});
