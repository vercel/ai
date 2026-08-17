import {
  createProviderExecutedToolFactory,
  tool,
} from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
  mockId,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

const programToolFactory = createProviderExecutedToolFactory<
  { code: string; fingerprint: string },
  { result: string; status: 'completed' | 'incomplete' },
  {}
>({
  id: 'openai.programmatic_tool_calling',
  inputSchema: z.object({
    code: z.string(),
    fingerprint: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
    status: z.enum(['completed', 'incomplete']),
  }),
  supportsDeferredResults: true,
});

const tools = {
  program: programToolFactory({}),
  getTotalHours: tool({
    inputSchema: z.object({ teamId: z.string() }),
    execute: async () => ({ totalHours: 92.5 }),
  }),
};

const programToolCall = {
  type: 'tool-call' as const,
  toolCallId: 'program-call',
  toolName: 'program',
  input: JSON.stringify({
    code: 'const result = await tools.getTotalHours({ teamId: "alpha" });',
    fingerprint: 'fingerprint',
  }),
  providerExecuted: true,
};

const clientToolCall = {
  type: 'tool-call' as const,
  toolCallId: 'client-call',
  toolName: 'getTotalHours',
  input: JSON.stringify({ teamId: 'alpha' }),
};

describe('issue #18970', () => {
  it('generateText should halt for approval while a provider tool result is deferred', async () => {
    const result = await generateText({
      model: new MockLanguageModelV4({
        doGenerate: async () => ({
          content: [programToolCall, clientToolCall],
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          warnings: [],
        }),
      }),
      tools,
      toolApproval: {
        getTotalHours: 'user-approval',
      },
      prompt: 'Get the total hours.',
      stopWhen: isStepCount(3),
      _internal: {
        generateId: mockId({ prefix: 'id' }),
        generateCallId: () => 'call-id',
      },
    });

    expect(result.steps).toHaveLength(1);
    expect(result.content).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        toolCall: expect.objectContaining({
          toolCallId: 'client-call',
          toolName: 'getTotalHours',
        }),
      }),
    );
  });

  it('streamText should halt for approval while a provider tool result is deferred', async () => {
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            { type: 'stream-start' as const, warnings: [] },
            programToolCall,
            clientToolCall,
            {
              type: 'finish' as const,
              finishReason: { unified: 'tool-calls' as const, raw: undefined },
              usage,
            },
          ]),
          response: {},
        }),
      }),
      tools,
      toolApproval: {
        getTotalHours: 'user-approval',
      },
      prompt: 'Get the total hours.',
      stopWhen: isStepCount(3),
      _internal: {
        generateId: mockId({ prefix: 'id' }),
        generateCallId: () => 'call-id',
      },
    });

    const parts = await convertAsyncIterableToArray(result.stream);

    expect(parts.some(part => part.type === 'error')).toBe(false);
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-approval-request',
        toolCall: expect.objectContaining({
          toolCallId: 'client-call',
          toolName: 'getTotalHours',
        }),
      }),
    );
    expect(await result.steps).toHaveLength(1);
  });
});
