import type { LanguageModelV4Usage } from '@ai-sdk/provider';
import { tool, type ModelMessage } from '@ai-sdk/provider-utils';
import {
  convertArrayToReadableStream,
  convertAsyncIterableToArray,
} from '@ai-sdk/provider-utils/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v4';
import { compactMessages } from '../compact-messages/compact-messages';
import type {
  CompactionCheckpoint,
  CompactionResult,
} from '../compact-messages/types';
import { createCheckpoint } from '../compact-messages/validate-compaction';
import { MockLanguageModelV4 } from '../test/mock-language-model-v4';
import { generateText } from './generate-text';
import type { PrepareStepFunction } from './prepare-step';
import { isStepCount } from './stop-condition';
import { streamText } from './stream-text';

const tools = {
  ping: tool({ inputSchema: z.object({}), execute: async () => 'pong' }),
};
const usage: LanguageModelV4Usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
const initialMessages: ModelMessage[] = [
  { role: 'user', content: 'Earlier question' },
  { role: 'assistant', content: 'Earlier answer' },
  { role: 'user', content: 'Continue working' },
];

function createModel(toolSteps = 2) {
  let stepNumber = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const currentStep = stepNumber++;
      return {
        content:
          currentStep < toolSteps
            ? [
                {
                  type: 'tool-call',
                  toolCallId: `call-${currentStep}`,
                  toolName: 'ping',
                  input: '{}',
                },
              ]
            : [{ type: 'text', text: 'Done' }],
        finishReason: {
          unified: currentStep < toolSteps ? 'tool-calls' : 'stop',
          raw: 'stop',
        },
        usage,
        warnings: [],
      };
    },
    doStream: async () => {
      const currentStep = stepNumber++;
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          ...(currentStep < toolSteps
            ? [
                {
                  type: 'tool-call' as const,
                  toolCallId: `call-${currentStep}`,
                  toolName: 'ping',
                  input: '{}',
                },
              ]
            : [
                { type: 'text-start' as const, id: 'text' },
                { type: 'text-delta' as const, id: 'text', delta: 'Done' },
                { type: 'text-end' as const, id: 'text' },
              ]),
          {
            type: 'finish',
            finishReason: {
              unified: currentStep < toolSteps ? 'tool-calls' : 'stop',
              raw: 'stop',
            },
            usage,
          },
        ]),
      };
    },
  });
}

async function run(
  mode: 'generate' | 'stream',
  options: {
    model: MockLanguageModelV4;
    messages: ModelMessage[];
    prepareStep?: PrepareStepFunction<typeof tools>;
    compactionCheckpoint?: CompactionCheckpoint;
  },
) {
  if (mode === 'generate') {
    const result = await generateText({
      ...options,
      tools,
      stopWhen: isStepCount(5),
    });
    return { calls: options.model.doGenerateCalls, parts: [], result };
  }
  const result = streamText({
    ...options,
    tools,
    stopWhen: isStepCount(5),
    onError: () => {},
  });
  const parts = await convertAsyncIterableToArray(result.stream);
  const error = parts.find(part => part.type === 'error');
  if (error != null) throw error.error;
  return { calls: options.model.doStreamCalls, parts, result };
}

describe.each(['generate', 'stream'] as const)(
  '%s prepareStep compaction',
  mode => {
    it('applies compaction between tool steps and carries its checkpoint forward', async () => {
      const model = createModel();
      const checkpoints: Array<CompactionCheckpoint | undefined> = [];
      let applied: CompactionResult | undefined;
      const { calls, parts } = await run(mode, {
        model,
        messages: initialMessages,
        prepareStep: async ({ messages, stepNumber, compactionCheckpoint }) => {
          checkpoints.push(compactionCheckpoint);
          if (stepNumber !== 1) return;
          applied = await compactMessages({
            messages,
            strategy: 'summarize',
            keepRecentMessages: 0,
            keepCurrentTurn: false,
            summarize: {
              maxOutputTokens: 100,
              execute: async () => ({ text: 'Earlier work was completed.' }),
            },
          });
          return { compaction: applied };
        },
      });

      expect(applied?.compacted).toBe(true);
      expect(checkpoints).toEqual([undefined, undefined, applied!.checkpoint]);
      expect(JSON.stringify(calls[1].prompt)).toContain(
        'Earlier work was completed.',
      );
      expect(JSON.stringify(calls[1].prompt)).not.toContain('Earlier answer');
      expect(JSON.stringify(calls[2].prompt)).toContain(
        'Earlier work was completed.',
      );
      expect(JSON.stringify(calls[2].prompt)).toContain('call-1');
      if (mode === 'stream') {
        const eventIndex = parts.findIndex(part => part.type === 'compaction');
        expect(parts[eventIndex - 1].type).toBe('finish-step');
        expect(parts[eventIndex + 1].type).toBe('start-step');
        expect(parts[eventIndex]).toEqual({
          type: 'compaction',
          messages: applied!.messages,
          checkpoint: applied!.checkpoint,
        });
        expect(parts.filter(part => part.type === 'compaction')).toHaveLength(
          1,
        );
      }
    });

    it('restores an initial checkpoint and clears it after a plain messages override', async () => {
      const checkpoint = await createCheckpoint(initialMessages, 0, 1);
      const observed: Array<CompactionCheckpoint | undefined> = [];
      const { parts } = await run(mode, {
        model: createModel(),
        messages: initialMessages,
        compactionCheckpoint: checkpoint,
        prepareStep: ({ messages, stepNumber, compactionCheckpoint }) => {
          observed.push(compactionCheckpoint);
          if (stepNumber === 0) return { messages };
        },
      });
      expect(observed).toEqual([checkpoint, undefined, undefined]);
      expect(parts.some(part => part.type === 'compaction')).toBe(false);
    });

    it('updates the checkpoint of an unchanged result without emitting a record', async () => {
      const checkpoint = await createCheckpoint(initialMessages, 0, 1);
      const observed: Array<CompactionCheckpoint | undefined> = [];
      const { parts } = await run(mode, {
        model: createModel(1),
        messages: initialMessages,
        prepareStep: ({ messages, stepNumber, compactionCheckpoint }) => {
          observed.push(compactionCheckpoint);
          if (stepNumber === 0)
            return {
              compaction: {
                messages,
                checkpoint,
                compacted: false,
                measurement: 'unavailable',
              },
            };
        },
      });
      expect(observed).toEqual([undefined, checkpoint]);
      expect(parts.some(part => part.type === 'compaction')).toBe(false);
    });

    it('rejects an invalid initial checkpoint before calling prepareStep or the provider', async () => {
      const model = createModel(0);
      const prepareStep = vi.fn();
      await expect(
        run(mode, {
          model,
          messages: initialMessages,
          compactionCheckpoint: {
            version: 1,
            startIndex: 0,
            messageCount: 1,
            digest: 'invalid',
          },
          prepareStep,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CHECKPOINT' });
      expect(prepareStep).not.toHaveBeenCalled();
      expect([...model.doGenerateCalls, ...model.doStreamCalls]).toHaveLength(
        0,
      );
    });

    it('rejects simultaneous messages and compaction overrides', async () => {
      await expect(
        run(mode, {
          model: createModel(0),
          messages: initialMessages,
          prepareStep: ({ messages }) => ({
            messages,
            compaction: {
              messages,
              compacted: false,
              measurement: 'unavailable',
            },
          }),
        }),
      ).rejects.toThrow('both messages and compaction');
    });

    it('rejects replacement history inconsistent with the compacted flag', async () => {
      await expect(
        run(mode, {
          model: createModel(0),
          messages: initialMessages,
          prepareStep: () => ({
            compaction: {
              messages: [{ role: 'user', content: 'Replacement' }],
              compacted: false,
              measurement: 'unavailable',
            },
          }),
        }),
      ).rejects.toThrow('must describe whether the history changed');
    });

    it('rejects malformed replacement messages and invalid replacement checkpoints', async () => {
      await expect(
        run(mode, {
          model: createModel(0),
          messages: initialMessages,
          prepareStep: () => ({
            compaction: {
              messages: [
                { role: 'user', content: 1 },
              ] as unknown as ModelMessage[],
              compacted: true,
              measurement: 'unavailable',
            },
          }),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_MESSAGES' });
      await expect(
        run(mode, {
          model: createModel(0),
          messages: initialMessages,
          prepareStep: ({ messages }) => ({
            compaction: {
              messages,
              compacted: false,
              measurement: 'unavailable',
              checkpoint: {
                version: 1,
                startIndex: 0,
                messageCount: 1,
                digest: 'invalid',
              },
            },
          }),
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CHECKPOINT' });
    });
  },
);

describe('stream compaction event ordering', () => {
  it.each(['changed', 'unchanged', 'none'] as const)(
    'preserves ordering when provider setup fails after %s compaction',
    async mode => {
      const model = createModel(1);
      const doStream = model.doStream;
      const error = new Error('Next step setup failed');
      let attempts = 0;
      model.doStream = async options => {
        if (attempts++ > 0) throw error;
        return doStream(options);
      };
      const result = streamText({
        model,
        messages: initialMessages,
        tools,
        stopWhen: isStepCount(3),
        maxRetries: 0,
        onError: () => {},
        prepareStep: async ({ messages, stepNumber }) => {
          if (stepNumber !== 1 || mode === 'none') return;
          return {
            compaction: await compactMessages({
              messages,
              strategy: async () => ({
                messages:
                  mode === 'changed'
                    ? [{ role: 'user', content: 'Summary' }]
                    : messages,
              }),
            }),
          };
        },
      });
      const parts = await convertAsyncIterableToArray(result.stream);

      expect(parts.map(part => part.type)).toEqual([
        'start',
        'start-step',
        'tool-call',
        'tool-result',
        'finish-step',
        ...(mode === 'changed' ? ['compaction'] : []),
        'error',
      ]);
      expect(parts.at(-1)).toEqual({ type: 'error', error });
    },
  );
});
