import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { tool } from 'ai';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import type { ModelCallStreamPart } from './do-stream-step.js';
import {
  MAX_STREAM_PART_BYTES,
  OMITTED_STREAM_PAYLOAD,
} from './limit-stream-part-size.js';
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

// Emulates a durable stream that rejects chunks over 10 MiB.
function createSizeLimitedWritable(writtenParts: ModelCallStreamPart[]) {
  return new WritableStream<ModelCallStreamPart>({
    write(part) {
      if (JSON.stringify(part).length > 10 * 1024 * 1024) {
        throw new Error('stream part exceeded the writable limit');
      }
      writtenParts.push(part);
    },
  });
}

describe('WorkflowAgent oversized stream parts', () => {
  const oversizedOutput = 'x'.repeat(MAX_STREAM_PART_BYTES + 1024 * 1024);

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('omits an oversized provider-executed tool result from the writable only', async () => {
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
    const writtenParts: ModelCallStreamPart[] = [];

    const result = await new WorkflowAgent({
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
    }).stream({
      messages: [{ role: 'user', content: 'Run the provider tool.' }],
      writable: createSizeLimitedWritable(writtenParts),
    });

    expect(writtenParts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'provider-call',
        output: OMITTED_STREAM_PAYLOAD,
      }),
    );
    expect(result.steps[0]!.toolResults).toContainEqual(
      expect.objectContaining({
        toolCallId: 'provider-call',
        output: oversizedOutput,
      }),
    );
  });

  it('omits an oversized client tool result from the writable only', async () => {
    const prompts: unknown[] = [];
    let callCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async ({ prompt }) => {
        prompts.push(prompt);
        const parts: LanguageModelV4StreamPart[] =
          callCount++ === 0
            ? [
                {
                  type: 'tool-call',
                  toolCallId: 'call-1',
                  toolName: 'read',
                  input: '{}',
                },
                {
                  type: 'finish',
                  finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
                  usage,
                },
              ]
            : [
                {
                  type: 'finish',
                  finishReason: { unified: 'stop', raw: 'stop' },
                  usage,
                },
              ];
        return {
          stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
            { type: 'stream-start', warnings: [] },
            ...parts,
          ]),
        };
      },
    });
    const writtenParts: ModelCallStreamPart[] = [];

    await new WorkflowAgent({
      model,
      tools: {
        read: tool({
          inputSchema: z.object({}),
          execute: async () => oversizedOutput,
        }),
      },
    }).stream({
      messages: [{ role: 'user', content: 'Read the file.' }],
      writable: createSizeLimitedWritable(writtenParts),
    });

    expect(writtenParts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'call-1',
        output: OMITTED_STREAM_PAYLOAD,
      }),
    );
    expect(JSON.stringify(prompts[1])).toContain(oversizedOutput);
  });
});
