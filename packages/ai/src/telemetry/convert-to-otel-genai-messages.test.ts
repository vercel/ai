import {
  convertToOTelGenAIInputMessages,
  convertToOTelGenAIOutputMessages,
  convertToOTelGenAIToolDefinitions,
  getGenAIOperationName,
} from './convert-to-otel-genai-messages';
import { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';

describe('convertToOTelGenAIInputMessages', () => {
  it('should convert system/user/assistant/tool messages', () => {
    const prompt: LanguageModelV3Prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello!' },
          {
            type: 'file',
            data: new Uint8Array([1, 2, 3]),
            mediaType: 'image/png',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'NYC' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            output: { type: 'json', value: { temp: 72 } },
          },
        ],
      },
    ];

    expect(convertToOTelGenAIInputMessages(prompt)).toEqual([
      {
        role: 'system',
        parts: [{ type: 'text', content: 'You are a helpful assistant.' }],
      },
      { role: 'user', parts: [{ type: 'text', content: 'Hello!' }] },
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'NYC' },
          },
        ],
      },
      {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: 'call_1',
            result: '{"temp":72}',
          },
        ],
      },
    ]);
  });
});

describe('convertToOTelGenAIOutputMessages', () => {
  it('should convert text and tool calls into an assistant message', () => {
    expect(
      convertToOTelGenAIOutputMessages({
        text: 'Hi!',
        toolCalls: [
          {
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { city: 'NYC' },
          },
        ],
        finishReason: 'stop',
      }),
    ).toEqual([
      {
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Hi!' },
          {
            type: 'tool_call',
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'NYC' },
          },
        ],
        finish_reason: 'stop',
      },
    ]);
  });
});

describe('convertToOTelGenAIToolDefinitions', () => {
  it('should convert function tools and skip provider tools', () => {
    expect(
      convertToOTelGenAIToolDefinitions([
        {
          type: 'function',
          name: 'calculator',
          description: 'Calculate a math expression',
          inputSchema: {
            type: 'object',
            properties: { expression: { type: 'string' } },
          },
        },
        { type: 'provider', name: 'mcp_tool', id: 'mcp.tool', args: {} },
      ]),
    ).toEqual([
      {
        type: 'function',
        name: 'calculator',
        description: 'Calculate a math expression',
        parameters: {
          type: 'object',
          properties: { expression: { type: 'string' } },
        },
      },
    ]);
  });
});

describe('getGenAIOperationName', () => {
  it('should map known AI SDK operations', () => {
    expect(getGenAIOperationName('ai.generateText.doGenerate')).toBe('chat');
    expect(getGenAIOperationName('ai.streamObject.doStream')).toBe('chat');
    expect(getGenAIOperationName('ai.embedMany.doEmbed')).toBe('embeddings');
    expect(getGenAIOperationName('ai.rerank.doRerank')).toBe(
      'ai.rerank.doRerank',
    );
  });
});
