import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { ModelCallStreamPart } from './do-stream-step.js';
import { WorkflowAgent } from './workflow-agent.js';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 0,
    reasoning: undefined,
  },
};

describe('WorkflowAgent.stream transformations', () => {
  it('transforms provider stream parts before writing them', async () => {
    const oversizedOutput = 'x'.repeat(2048);
    const omittedOutput = {
      type: 'omitted',
      reason: 'too_large_for_stream',
    };
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
          { type: 'stream-start', warnings: [] },
          {
            type: 'tool-call',
            toolCallId: 'provider-call',
            toolName: 'providerTool',
            input: '{}',
            providerExecuted: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'provider-call',
            toolName: 'providerTool',
            result: oversizedOutput,
          },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage,
          },
        ]),
      }),
    });
    const agent = new WorkflowAgent({
      model,
      tools: {
        providerTool: tool({
          type: 'provider',
          id: 'test.provider-tool',
          isProviderExecuted: true,
          args: {},
          inputSchema: z.object({}),
        }),
      },
    });
    const writtenParts: ModelCallStreamPart[] = [];
    let transformSawOversizedOutput = false;

    await agent.stream({
      messages: [{ role: 'user', content: 'Run the provider tool.' }],
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          if (JSON.stringify(part).length > 512) {
            throw new Error('stream part exceeded the writable limit');
          }
          writtenParts.push(part);
        },
      }),
      experimental_transform: () =>
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
        >({
          transform(part, controller) {
            if (
              part.type === 'tool-result' &&
              JSON.stringify(part).length > 512
            ) {
              transformSawOversizedOutput = true;
              controller.enqueue({ ...part, result: omittedOutput });
              return;
            }

            controller.enqueue(part);
          },
        }),
    });

    expect(transformSawOversizedOutput).toBe(true);
    expect(writtenParts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        output: omittedOutput,
      }),
    );
  });
});
