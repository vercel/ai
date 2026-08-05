import { tool } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import type { UIMessage } from '../ui/ui-messages';
import { createAgentUIStream } from './create-agent-ui-stream';
import { ToolLoopAgent } from './tool-loop-agent';

describe('createAgentUIStream', () => {
  it('provides accumulated UI messages after every agent step', async () => {
    let modelCallCount = 0;
    const onStepEnd = vi.fn();
    const onUIMessageStepEnd = vi.fn();

    const agent = new ToolLoopAgent({
      model: new MockLanguageModelV4({
        doStream: async () => {
          modelCallCount++;

          if (modelCallCount === 1) {
            return {
              stream: convertArrayToReadableStream([
                { type: 'stream-start', warnings: [] },
                {
                  type: 'response-metadata',
                  id: 'response-1',
                  modelId: 'mock-model-id',
                  timestamp: new Date(0),
                },
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'weather',
                  input: '{"location":"San Francisco"}',
                },
                {
                  type: 'finish',
                  finishReason: {
                    unified: 'tool-calls' as const,
                    raw: 'tool-calls',
                  },
                  usage: {
                    inputTokens: {
                      total: 3,
                      noCache: 3,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 4,
                      text: 4,
                      reasoning: undefined,
                    },
                  },
                  providerMetadata: {},
                },
              ]),
            };
          }

          return {
            stream: convertArrayToReadableStream([
              { type: 'stream-start', warnings: [] },
              {
                type: 'response-metadata',
                id: 'response-2',
                modelId: 'mock-model-id',
                timestamp: new Date(0),
              },
              { type: 'reasoning-start', id: 'reasoning-1' },
              {
                type: 'reasoning-delta',
                id: 'reasoning-1',
                delta: 'The tool returned 72°F.',
              },
              { type: 'reasoning-end', id: 'reasoning-1' },
              { type: 'text-start', id: 'text-1' },
              {
                type: 'text-delta',
                id: 'text-1',
                delta: 'It is 72°F in San Francisco.',
              },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop' as const, raw: 'stop' },
                usage: {
                  inputTokens: {
                    total: 5,
                    noCache: 5,
                    cacheRead: undefined,
                    cacheWrite: undefined,
                  },
                  outputTokens: {
                    total: 8,
                    text: 6,
                    reasoning: 2,
                  },
                },
                providerMetadata: {},
              },
            ]),
          };
        },
      }),
      tools: {
        weather: tool({
          inputSchema: z.object({ location: z.string() }),
          execute: async ({ location }) => ({
            location,
            temperature: 72,
          }),
        }),
      },
    });

    const uiMessages: UIMessage[] = [
      {
        id: 'user-1',
        role: 'user',
        parts: [
          { type: 'text', text: 'What is the weather in San Francisco?' },
        ],
      },
    ];

    const stream = await createAgentUIStream({
      agent,
      uiMessages,
      generateMessageId: () => 'assistant-1',
      messageMetadata: ({ part }) => ({ partType: part.type }),
      onStepEnd,
      onUIMessageStepEnd,
    });

    await convertReadableStreamToArray(stream);

    expect(onStepEnd).toHaveBeenCalledTimes(2);
    expect(onStepEnd.mock.calls[0][0]).not.toHaveProperty('responseMessage');

    expect(onUIMessageStepEnd).toHaveBeenCalledTimes(2);
    expect(onUIMessageStepEnd.mock.calls[0][0]).toMatchObject({
      isContinuation: false,
      messages: [uiMessages[0], expect.any(Object)],
      responseMessage: {
        id: 'assistant-1',
        role: 'assistant',
        metadata: { partType: 'tool-result' },
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-weather',
            toolCallId: 'call-1',
            state: 'output-available',
            input: { location: 'San Francisco' },
            output: {
              location: 'San Francisco',
              temperature: 72,
            },
          },
        ],
      },
    });

    expect(onUIMessageStepEnd.mock.calls[1][0].responseMessage).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      metadata: { partType: 'text-end' },
      parts: [
        { type: 'step-start' },
        { type: 'tool-weather' },
        { type: 'step-start' },
        { type: 'reasoning', text: 'The tool returned 72°F.' },
        { type: 'text', text: 'It is 72°F in San Francisco.' },
      ],
    });
  });
});
