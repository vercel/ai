import assert from 'node:assert/strict';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';

const delay = (durationMs: number) =>
  new Promise(resolve => setTimeout(resolve, durationMs));

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createErroringModel(): LanguageModelV2 {
  return {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock',
    supportedUrls: Promise.resolve({}),
    doGenerate: async () => {
      throw new Error('not implemented');
    },
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'response-metadata',
            id: 'resp-1',
            modelId: 'mock',
            timestamp: new Date(),
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'slow_tool_a',
            input: '{"q":"a"}',
          });
          controller.enqueue({
            type: 'tool-call',
            toolCallId: 'call_2',
            toolName: 'slow_tool_b',
            input: '{"q":"b"}',
          });

          setTimeout(() => {
            controller.error(new Error('simulated LLM stream error'));
          }, 25);
        },
      }),
    }),
  };
}

async function main() {
  const processErrors: unknown[] = [];
  const startedTools: string[] = [];
  const completedTools: string[] = [];

  process.on('unhandledRejection', error => {
    processErrors.push(error);
  });
  process.on('uncaughtException', error => {
    processErrors.push(error);
  });

  const result = streamText({
    model: createErroringModel(),
    messages: [{ role: 'user', content: 'test' }],
    tools: {
      slow_tool_a: tool({
        description: 'Slow tool A',
        inputSchema: z.object({ q: z.string() }),
        execute: async () => {
          startedTools.push('a');
          await delay(200);
          completedTools.push('a');
          return { ok: true };
        },
      }),
      slow_tool_b: tool({
        description: 'Slow tool B',
        inputSchema: z.object({ q: z.string() }),
        execute: async () => {
          startedTools.push('b');
          await delay(300);
          completedTools.push('b');
          return { ok: true };
        },
      }),
    },
    toolChoice: 'auto',
    stopWhen: stepCountIs(10),
    onError: () => {},
  });

  let consumerError: unknown;
  try {
    for await (const _chunk of result.fullStream) {
      // Drain the stream so the model error reaches the consumer.
    }
  } catch (error) {
    consumerError = error;
  }

  await delay(500);

  assert.equal(
    getErrorMessage(consumerError),
    'simulated LLM stream error',
    'the model stream error should reach the stream consumer',
  );
  assert.deepEqual(startedTools, ['a', 'b'], 'both tools should start');
  assert.deepEqual(completedTools, ['a', 'b'], 'both tools should complete');
  assert.deepEqual(
    processErrors.map(getErrorMessage),
    [],
    'tool completion after a model stream error must not cause a process-level error',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
