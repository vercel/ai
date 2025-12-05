import { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { toolInputExamplesMiddleware } from './tool-input-examples-middleware';
import { MockLanguageModelV3 } from '../test/mock-language-model-v3';
import { describe, it, expect } from 'vitest';

const BASE_PARAMS: LanguageModelV3CallOptions = {
  prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Hello, world!' }] },
  ],
};

const MOCK_MODEL = new MockLanguageModelV3();

describe('toolInputExamplesMiddleware', () => {
  describe('transformParams', () => {
    it('should append examples to tool description', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather in a location',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [
                { input: { location: 'San Francisco' } },
                { input: { location: 'London' } },
              ],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "description": "Get the weather in a location

        Input Examples:
        {"location":"San Francisco"}
        {"location":"London"}",
            "inputExamples": [
              {
                "input": {
                  "location": "San Francisco",
                },
              },
              {
                "input": {
                  "location": "London",
                },
              },
            ],
            "inputSchema": {
              "properties": {
                "location": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "name": "weather",
            "type": "function",
          },
        ]
      `);
    });

    it('should handle tool without existing description', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [{ input: { location: 'Berlin' } }],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "description": "Input Examples:
        {"location":"Berlin"}",
            "inputExamples": [
              {
                "input": {
                  "location": "Berlin",
                },
              },
            ],
            "inputSchema": {
              "properties": {
                "location": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "name": "weather",
            "type": "function",
          },
        ]
      `);
    });

    it('should keep inputExamples property on the tool', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [{ input: { location: 'NYC' } }],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools![0]).toHaveProperty('inputExamples');
      expect((result.tools![0] as any).inputExamples).toMatchInlineSnapshot(`
        [
          {
            "input": {
              "location": "NYC",
            },
          },
        ]
      `);
    });
  });

  describe('description', () => {
    it('should use provided description as header', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Here are some example inputs:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [{ input: { location: 'Paris' } }],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect((result.tools![0] as any).description).toMatchInlineSnapshot(`
        "Get the weather

        Here are some example inputs:
        {"location":"Paris"}"
      `);
    });
  });

  describe('formatExample', () => {
    it('should use default JSON.stringify format', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'search',
              description: 'Search for items',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  limit: { type: 'number' },
                },
              },
              inputExamples: [{ input: { query: 'test', limit: 10 } }],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect((result.tools![0] as any).description).toMatchInlineSnapshot(`
        "Search for items

        Examples:
        {"query":"test","limit":10}"
      `);
    });

    it('should use custom formatExample function', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Examples:',
        formatExample: (example, index) =>
          `${index + 1}. ${JSON.stringify(example.input)}`,
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [
                { input: { location: 'Paris' } },
                { input: { location: 'Tokyo' } },
              ],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect((result.tools![0] as any).description).toMatchInlineSnapshot(`
        "Get the weather

        Examples:
        1. {"location":"Paris"}
        2. {"location":"Tokyo"}"
      `);
    });
  });

  describe('edge cases', () => {
    it('should pass through tools without inputExamples', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "description": "Get the weather",
            "inputSchema": {
              "properties": {
                "location": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "name": "weather",
            "type": "function",
          },
        ]
      `);
    });

    it('should pass through tools with empty inputExamples array', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [],
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect((result.tools![0] as any).description).toBe('Get the weather');
    });

    it('should pass through provider tools unchanged', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'provider',
              name: 'web_search',
              id: 'anthropic.web_search_20250305',
              args: { maxUses: 5 },
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "args": {
              "maxUses": 5,
            },
            "id": "anthropic.web_search_20250305",
            "name": "web_search",
            "type": "provider",
          },
        ]
      `);
    });

    it('should handle multiple tools with mixed examples', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: {
          ...BASE_PARAMS,
          tools: [
            {
              type: 'function',
              name: 'weather',
              description: 'Get the weather',
              inputSchema: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
              inputExamples: [{ input: { location: 'NYC' } }],
            },
            {
              type: 'function',
              name: 'time',
              description: 'Get the current time',
              inputSchema: {
                type: 'object',
                properties: { timezone: { type: 'string' } },
              },
            },
          ],
        },
        model: MOCK_MODEL,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "description": "Get the weather

        Input Examples:
        {"location":"NYC"}",
            "inputExamples": [
              {
                "input": {
                  "location": "NYC",
                },
              },
            ],
            "inputSchema": {
              "properties": {
                "location": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "name": "weather",
            "type": "function",
          },
          {
            "description": "Get the current time",
            "inputSchema": {
              "properties": {
                "timezone": {
                  "type": "string",
                },
              },
              "type": "object",
            },
            "name": "time",
            "type": "function",
          },
        ]
      `);
    });

    it('should handle empty tools array', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: { ...BASE_PARAMS, tools: [] },
        model: MOCK_MODEL,
      });

      expect(result.tools).toEqual([]);
    });

    it('should handle undefined tools', async () => {
      const middleware = toolInputExamplesMiddleware({
        description: 'Input Examples:',
      });

      const result = await middleware.transformParams!({
        type: 'generate',
        params: { ...BASE_PARAMS, tools: undefined },
        model: MOCK_MODEL,
      });

      expect(result.tools).toBeUndefined();
    });
  });
});
