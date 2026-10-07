import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { createAgentUIStream, tool, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

// This example needs no API credentials. Each callback can be used to upsert
// responseMessage by ID, preserving progress before the next step completes.
run(async () => {
  const steps: LanguageModelV4StreamPart[][] = [
    [
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: 'Looking up the answer.' },
      { type: 'text-end', id: 'text-1' },
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'lookup',
        input: '{}',
      },
    ],
    [
      { type: 'text-start', id: 'text-2' },
      { type: 'text-delta', id: 'text-2', delta: 'The answer is 42.' },
      { type: 'text-end', id: 'text-2' },
    ],
  ];
  const agent = new ToolLoopAgent({
    model: new MockLanguageModelV4({
      doStream: steps.map((parts, index) => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          ...parts,
          {
            type: 'finish',
            finishReason: {
              unified: index === 0 ? 'tool-calls' : 'stop',
              raw: index === 0 ? 'tool-calls' : 'stop',
            },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: undefined },
            },
          },
        ]),
      })),
    }),
    tools: {
      lookup: tool({ inputSchema: z.object({}), execute: () => 42 }),
    },
  });

  const stream = await createAgentUIStream({
    agent,
    uiMessages: [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Look up the answer.' }],
      },
    ],
    generateMessageId: () => 'assistant-1',
    onStepEnd: ({
      stepNumber,
      responseMessage,
      messages,
      isContinuation,
      usage,
      toolCalls,
    }) => {
      console.log('Step ended:', {
        stepNumber,
        usage,
        toolCalls,
        isContinuation,
      });
      console.log('UI message so far:', JSON.stringify(responseMessage));
      console.log('Conversation length:', messages.length);
    },
  });

  for await (const chunk of stream) {
    if (chunk.type === 'error') {
      throw new Error(chunk.errorText);
    }
  }
});
