import { describe, it, expect } from 'vitest';
import {
  formatInputMessages,
  formatOutputMessages,
  formatObjectOutputMessages,
  formatSystemInstructions,
  extractSystemFromPrompt,
  mapProviderName,
  mapOperationName,
} from './gen-ai-format-messages';
import type { LanguageModelV4Prompt } from '@ai-sdk/provider';

describe('mapProviderName', () => {
  it('should map known providers to well-known values', () => {
    expect(mapProviderName('anthropic.messages')).toBe('anthropic');
    expect(mapProviderName('openai.chat')).toBe('openai');
    expect(mapProviderName('google.generative-ai')).toBe('gcp.gen_ai');
    expect(mapProviderName('mistral.chat')).toBe('mistral_ai');
    expect(mapProviderName('groq.chat')).toBe('groq');
    expect(mapProviderName('deepseek.chat')).toBe('deepseek');
  });

  it('should map bedrock provider', () => {
    expect(mapProviderName('amazon-bedrock.chat')).toBe('aws.bedrock');
    expect(mapProviderName('bedrock.chat')).toBe('aws.bedrock');
  });

  it('should return the original string for unknown providers', () => {
    expect(mapProviderName('custom-provider.chat')).toBe(
      'custom-provider.chat',
    );
  });
});

describe('mapOperationName', () => {
  it('should map generateText/streamText to invoke_agent', () => {
    expect(mapOperationName('ai.generateText')).toBe('invoke_agent');
    expect(mapOperationName('ai.streamText')).toBe('invoke_agent');
  });

  it('should map generateObject/streamObject to invoke_agent', () => {
    expect(mapOperationName('ai.generateObject')).toBe('invoke_agent');
    expect(mapOperationName('ai.streamObject')).toBe('invoke_agent');
  });

  it('should map embed/embedMany to embeddings', () => {
    expect(mapOperationName('ai.embed')).toBe('embeddings');
    expect(mapOperationName('ai.embedMany')).toBe('embeddings');
  });

  it('should map rerank to rerank', () => {
    expect(mapOperationName('ai.rerank')).toBe('rerank');
  });

  it('should return the original string for unknown operations', () => {
    expect(mapOperationName('ai.unknown')).toBe('ai.unknown');
  });
});

describe('formatSystemInstructions', () => {
  it('should format a system string into SemConv system instructions', () => {
    const result = formatSystemInstructions('You are a helpful assistant.');
    expect(result).toEqual([
      { type: 'text', content: 'You are a helpful assistant.' },
    ]);
  });
});

describe('extractSystemFromPrompt', () => {
  it('should extract system message from prompt', () => {
    const prompt: LanguageModelV4Prompt = [
      { role: 'system', content: 'Be helpful' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ];
    expect(extractSystemFromPrompt(prompt)).toBe('Be helpful');
  });

  it('should return undefined when no system message', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ];
    expect(extractSystemFromPrompt(prompt)).toBeUndefined();
  });
});

describe('formatInputMessages', () => {
  it('should convert user text messages', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is the weather?' }],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'user',
        parts: [{ type: 'text', content: 'What is the weather?' }],
      },
    ]);
  });

  it('should exclude system messages', () => {
    const prompt: LanguageModelV4Prompt = [
      { role: 'system', content: 'Be helpful' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
  });

  it('should convert assistant messages with tool calls', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_123',
            toolName: 'get_weather',
            input: { city: 'Paris' },
          },
        ],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'call_123',
            name: 'get_weather',
            arguments: { city: 'Paris' },
          },
        ],
      },
    ]);
  });

  it('should convert tool result messages', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_123',
            toolName: 'get_weather',
            output: { type: 'text', value: 'Sunny, 72°F' },
          },
        ],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'tool',
        parts: [
          {
            type: 'tool_call_response',
            id: 'call_123',
            response: 'Sunny, 72°F',
          },
        ],
      },
    ]);
  });

  it('should convert file parts to blob parts', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'base64data',
            mediaType: 'image/png',
          },
        ],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'user',
        parts: [
          {
            type: 'blob',
            modality: 'image',
            mime_type: 'image/png',
            content: 'base64data',
          },
        ],
      },
    ]);
  });

  it('should convert URL file parts to uri parts', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'user',
        content: [
          {
            type: 'file',
            data: 'https://example.com/image.png',
            mediaType: 'image/png',
          },
        ],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'user',
        parts: [
          {
            type: 'uri',
            modality: 'image',
            mime_type: 'image/png',
            uri: 'https://example.com/image.png',
          },
        ],
      },
    ]);
  });

  it('should convert reasoning parts', () => {
    const prompt: LanguageModelV4Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'reasoning',
            text: 'Let me think about this...',
          },
        ],
      },
    ];
    const result = formatInputMessages(prompt);
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'reasoning',
            content: 'Let me think about this...',
          },
        ],
      },
    ]);
  });
});

describe('formatOutputMessages', () => {
  it('should format text-only output', () => {
    const result = formatOutputMessages({
      text: 'Hello world',
      finishReason: 'stop',
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: 'Hello world' }],
        finish_reason: 'stop',
      },
    ]);
  });

  it('should format output with reasoning', () => {
    const result = formatOutputMessages({
      text: 'The answer is 42',
      reasoning: [{ text: 'Let me think...' }],
      finishReason: 'stop',
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [
          { type: 'reasoning', content: 'Let me think...' },
          { type: 'text', content: 'The answer is 42' },
        ],
        finish_reason: 'stop',
      },
    ]);
  });

  it('should format output with tool calls', () => {
    const result = formatOutputMessages({
      toolCalls: [
        {
          toolCallId: 'call_abc',
          toolName: 'get_weather',
          input: { city: 'Paris' },
        },
      ],
      finishReason: 'tool-calls',
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool_call',
            id: 'call_abc',
            name: 'get_weather',
            arguments: { city: 'Paris' },
          },
        ],
        finish_reason: 'tool_call',
      },
    ]);
  });

  it('should format output with files', () => {
    const result = formatOutputMessages({
      files: [{ mediaType: 'image/png', base64: 'abc123' }],
      finishReason: 'stop',
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [
          {
            type: 'blob',
            modality: 'image',
            mime_type: 'image/png',
            content: 'abc123',
          },
        ],
        finish_reason: 'stop',
      },
    ]);
  });

  it('should combine reasoning, text, tool calls, and files', () => {
    const result = formatOutputMessages({
      text: 'Here is the result',
      reasoning: [{ text: 'Thinking...' }],
      toolCalls: [
        {
          toolCallId: 'tc1',
          toolName: 'search',
          input: { q: 'test' },
        },
      ],
      files: [{ mediaType: 'image/jpeg', base64: 'data' }],
      finishReason: 'stop',
    });
    expect(result[0].parts).toHaveLength(4);
    expect(result[0].parts[0].type).toBe('reasoning');
    expect(result[0].parts[1].type).toBe('text');
    expect(result[0].parts[2].type).toBe('tool_call');
    expect(result[0].parts[3].type).toBe('blob');
  });

  it('should map finish reasons correctly', () => {
    expect(
      formatOutputMessages({ finishReason: 'stop' })[0].finish_reason,
    ).toBe('stop');
    expect(
      formatOutputMessages({ finishReason: 'length' })[0].finish_reason,
    ).toBe('length');
    expect(
      formatOutputMessages({ finishReason: 'tool-calls' })[0].finish_reason,
    ).toBe('tool_call');
    expect(
      formatOutputMessages({ finishReason: 'content-filter' })[0].finish_reason,
    ).toBe('content_filter');
  });
});

describe('formatObjectOutputMessages', () => {
  it('should format object output as text content', () => {
    const result = formatObjectOutputMessages({
      objectText: '{"name":"test"}',
      finishReason: 'stop',
    });
    expect(result).toEqual([
      {
        role: 'assistant',
        parts: [{ type: 'text', content: '{"name":"test"}' }],
        finish_reason: 'stop',
      },
    ]);
  });
});
