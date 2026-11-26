import { jsonSchema } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: 0, reasoning: undefined },
};

const metadata = { openai: { itemId: 'msg_x', phase: 'final_answer' } };

const tools = {
  send_message: {
    inputSchema: jsonSchema<{ text: string }>({
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    }),
    execute: async () => 'OK',
  },
};

const toolCall = {
  type: 'tool-call' as const,
  toolCallId: 'call_x',
  toolName: 'send_message',
  input: '{"text":"Hello"}',
};

function generateModel(finalContent: any[]) {
  return new MockLanguageModelV4({
    doGenerate: [
      {
        content: [toolCall],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage,
        warnings: [],
      },
      {
        content: finalContent,
        finishReason: { unified: 'stop', raw: 'stop' },
        usage,
        warnings: [],
      },
    ],
  });
}

function streamModel(finalParts: any[]) {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          toolCall,
          {
            type: 'finish' as const,
            finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
            usage,
          },
        ]),
      },
      {
        stream: convertArrayToReadableStream([
          { type: 'stream-start' as const, warnings: [] },
          ...finalParts,
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: 'stop' },
            usage,
          },
        ]),
      },
    ],
  });
}

describe('WorkflowAgent empty terminal text with provider metadata', () => {
  it('generate: keeps empty text with provider metadata in responseMessages', async () => {
    const result = await new WorkflowAgent({
      model: generateModel([
        { type: 'text', text: '', providerMetadata: metadata },
      ]),
      tools,
    }).generate({ prompt: 'Say hello', maxRetries: 0 });

    expect(result.responseMessages.at(-1)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: '', providerOptions: metadata }],
    });
  });

  it('generate: omits empty text without provider metadata', async () => {
    const result = await new WorkflowAgent({
      model: generateModel([{ type: 'text', text: '' }]),
      tools,
    }).generate({ prompt: 'Say hello', maxRetries: 0 });

    expect(result.responseMessages.map(message => message.role)).toEqual([
      'assistant',
      'tool',
    ]);
  });

  it('generate: keeps empty text in the same message as reasoning, in order', async () => {
    const result = await new WorkflowAgent({
      model: generateModel([
        {
          type: 'reasoning',
          text: '',
          providerMetadata: { openai: { itemId: 'rs_y' } },
        },
        { type: 'text', text: '', providerMetadata: metadata },
      ]),
      tools,
    }).generate({ prompt: 'Say hello', maxRetries: 0 });

    const last = result.responseMessages.at(-1);
    expect(last).toMatchObject({ role: 'assistant' });
    expect((last!.content as any[]).map(part => part.type)).toEqual([
      'reasoning',
      'text',
    ]);
    expect(
      result.responseMessages.filter(message => message.role === 'assistant'),
    ).toHaveLength(2);
  });

  it.each(['text-start', 'text-end'] as const)(
    'stream: keeps empty text with provider metadata on %s',
    async where => {
      const result = await new WorkflowAgent({
        model: streamModel([
          {
            type: 'text-start' as const,
            id: '1',
            ...(where === 'text-start' ? { providerMetadata: metadata } : {}),
          },
          {
            type: 'text-end' as const,
            id: '1',
            ...(where === 'text-end' ? { providerMetadata: metadata } : {}),
          },
        ]),
        tools,
      }).stream({
        prompt: 'Say hello',
        maxRetries: 0,
        writable: new WritableStream(),
      });

      expect(result.messages.at(-1)).toEqual({
        role: 'assistant',
        content: [{ type: 'text', text: '', providerOptions: metadata }],
      });
    },
  );

  it('stream: omits empty text without provider metadata', async () => {
    const result = await new WorkflowAgent({
      model: streamModel([
        { type: 'text-start' as const, id: '1' },
        { type: 'text-end' as const, id: '1' },
      ]),
      tools,
    }).stream({
      prompt: 'Say hello',
      maxRetries: 0,
      writable: new WritableStream(),
    });

    expect(result.messages.map(message => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
    ]);
  });
});
